// 访问日志模块（v2 重构版）：聚合记录每个访问者（按 IP）的访问次数、地理位置、网络状态与设备信息
//
// 与 v1 的区别：
// - 不再跨天累计：access.json 只保存"今天"的数据，每天本地时间 0 点归档一次
// - 凌晨归档：当天完整数据写入 server/log/history/access-日期.json，写入成功后才
//   清空内存与 access.json，从零开始记录新的一天
// - 原子写入：先写临时文件再 rename，任何时刻磁盘上都存在完整 JSON，
//   避免写一半进程被杀导致文件损坏、下次启动静默丢光历史
// - 优雅停机：SIGTERM/SIGINT 时强制落盘后再退出（Docker stop 场景不再丢最后 30 秒）
//
// 时区说明：归档时机取容器本地时区，Docker 默认 UTC 会导致"凌晨"对应北京时间早上 8 点，
// 部署时请在 docker-compose.yml 设置 TZ=Asia/Shanghai
import { mkdirSync, readFileSync, existsSync, renameSync, writeFileSync } from 'fs'
import { writeFile, rename } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
// hiofd 归属地服务：精确到区县/街道/经纬度，命中 24 小时缓存时零网络开销。
// 它与本模块的访问统计是独立职责，故障只影响 geoFull 字段，不影响统计本身
// isPublicIp 由 ip-location 统一提供：原先这里有一份同名逻辑（isExternalIp），
// 两份判定一旦漂移就会出现"查了却不计入覆盖率"的矛盾数字，所以合并为一处
import { geoFullOf, lookupOrQueue, takeIpLookupStats, isPublicIp } from './ip-location.js'
// 归档汇总写到独立的 ip-geo 日志，避免业务日志里混入运维信息
import { writeGeoArchive } from './geo-log.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 日志目录：server/log
const LOG_DIR = resolve(__dirname, 'log')
// 当天数据文件：server/log/access.json
const OUT_FILE = resolve(LOG_DIR, 'access.json')
// 历史归档目录：server/log/history（每天一个文件）
const HISTORY_DIR = resolve(LOG_DIR, 'history')
// 内存有变更时隔多少毫秒落盘一次（仅快照当日数据，供进程重启后恢复当天进度）
const FLUSH_INTERVAL = 30000

mkdirSync(LOG_DIR, { recursive: true })
mkdirSync(HISTORY_DIR, { recursive: true })

// 聚合表：ip -> { requests, firstSeen, lastSeen, geo, isp, network, device, os, browser, paths }
const stats = new Map()

// 本地时区日期字符串（YYYY-MM-DD）。不用 toISOString 是因为它按 UTC 取日期，
// 会导致东八区晚上 8 点后日期提前一天，凌晨归档时间错位
function localDateStr(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 当前统计所属的日期，跨天检测与归档都以此为基准
let currentDate = localDateStr(new Date())

// 本地时区时间戳（不带时区后缀），如 2026-08-24 13:55:40.959。
// 直接按服务器本地时区输出，日志里看到的就是北京时间；
// 无偏移量后缀，默认读者已知这是东八区时间。归档日期判断仍用上面的 localDateStr
function localIso(d) {
  const pad = n => String(n).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`
}
// 脏标记：内存有新增/变更才需要落盘，避免空转 IO
let dirty = false
// 写入锁：上一次异步写未完成时跳过本轮，防止并发写同一文件互相覆盖
let writeBusy = false

// ---------- 序列化与原子写入 ----------

// 把指定日期的内存数据序列化为文件内容（带 date 字段，启动恢复时据此判断是否属于今天）
function serialize(date, map) {
  // 剔除下划线开头的内部字段：这类字段只服务于运行时判断（如各种节流时间戳），
  // 不该出现在对外的访问统计文件里
  const ips = {}
  for (const [ip, s] of map) {
    const clean = {}
    for (const k of Object.keys(s)) if (!k.startsWith('_')) clean[k] = s[k]
    ips[ip] = clean
  }
  return JSON.stringify({ date, savedAt: localIso(new Date()), ips }, null, 2)
}

// 原子写：先写同目录临时文件，再 rename 覆盖目标——rename 在同一文件系统上是原子的，
// 目标文件要么是旧完整内容、要么是新完整内容，不会出现截断的半截 JSON
async function atomicWrite(file, text) {
  const tmp = `${file}.tmp`
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
}

// 把当天内存快照写入 access.json（异步，不阻塞事件循环；失败保留脏标记下轮重试）
async function writeToday() {
  try {
    await atomicWrite(OUT_FILE, serialize(currentDate, stats))
  } catch (e) {
    dirty = true
    console.warn('访问日志写入失败:', e.message)
  }
}

// 定时快照：有变更且上一轮已写完才执行
async function flushTick() {
  if (writeBusy || !dirty) return
  writeBusy = true
  dirty = false
  await writeToday()
  writeBusy = false
}

// ---------- 每日归档 ----------

// 核心归档动作：
// 1. 当天内存数据写入历史目录（文件名带日期；同名文件已存在则跳过，避免重复运行时覆盖）
// 2. 归档成功后才清空内存、更新当前日期并重置 access.json —— 保证"先落地再清理"，不丢数据
async function archiveNow() {
  const hasData = stats.size > 0
  // 归档前先记住所属日期：下面会把 currentDate 切到新的一天，
  // 汇总日志里必须写被归档的那一天，而不是新的一天
  const archivedDate = currentDate
  if (hasData) {
    const histFile = resolve(HISTORY_DIR, `access-${currentDate}.json`)
    if (!existsSync(histFile)) {
      await atomicWrite(histFile, serialize(currentDate, stats))
    } else {
      console.warn(`历史文件已存在，跳过归档: ${histFile}`)
    }
  }
  // 清空当天统计，切换到新的一天，并立即把空的当天文件写下去
  stats.clear()
  currentDate = localDateStr(new Date())
  await writeToday()
  // 归属地解析的当日汇总：查了多少次、命中多少、失败多少、队列有没有丢数据。
  // 写到独立的 ip-geo 日志，业务日志不掺运维信息。
  // takeIpLookupStats 会顺手清零计数，保证次日汇总只统计次日
  if (hasData) {
    writeGeoArchive({ date: archivedDate, ...takeIpLookupStats() })
  }
}

// 凌晨定时器：计算距离下一个本地 0 点的毫秒数，睡到点后归档，再安排下一天。
// 比"每小时检查一次"精确，也不会出现 v1 里只存第一个小时快照的问题
function scheduleMidnightArchive() {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 0, 0) // 小时数传 24 自动滚到明天 0 点
  setTimeout(async () => {
    try {
      await archiveNow()
    } catch (e) {
      // 归档失败不清内存：脏数据还在，下个触发点或重启后会再次尝试
      console.warn('凌晨归档失败（数据保留待重试）:', e.message)
    }
    scheduleMidnightArchive()
  }, next.getTime() - now.getTime())
}

// ---------- 启动恢复 ----------

// 启动时处理磁盘上的 access.json：
// - 属于今天：恢复进内存，接着记（进程白天重启不丢当天进度）
// - 属于过去（如停机跨了零点）：先把那天数据补归档到历史目录，再以空数据开新的一天
// - 文件损坏：改名留存现场（access.corrupt-时间戳.json），从空开始，避免反复 parse 失败
function loadFromDisk() {
  if (!existsSync(OUT_FILE)) return
  try {
    const parsed = JSON.parse(readFileSync(OUT_FILE, 'utf8').replace(/^\uFEFF/, '') || '{}')
    const today = localDateStr(new Date())
    if (parsed?.date === today && parsed.ips && typeof parsed.ips === 'object') {
      for (const [ip, s] of Object.entries(parsed.ips)) {
        if (s && typeof s === 'object') stats.set(ip, s)
      }
    } else if (parsed?.date && parsed.ips && Object.keys(parsed.ips).length > 0) {
      const histFile = resolve(HISTORY_DIR, `access-${parsed.date}.json`)
      if (!existsSync(histFile)) {
        writeFileSync(histFile, JSON.stringify(parsed, null, 2), 'utf8')
      }
      writeFileSync(OUT_FILE, serialize(today, new Map()), 'utf8')
    }
  } catch {
    try {
      renameSync(OUT_FILE, resolve(LOG_DIR, `access.corrupt-${Date.now()}.json`))
    } catch { /* 连损坏文件都保不住时只能放弃，不影响服务启动 */ }
  }
}

loadFromDisk()

// ---------- IP 归属地解析（在线接口，后续可换离线库）----------

// 内网/本机地址的可见标注，替代空 geo。
// IPv6 细分：仅回环/链路本地(fe80)/唯一本地(fc|fd开头)算本地，
// 其余是公网 IPv6（如 Cloudflare 中转出口），返回空串交给在线解析
function localGeoLabel(ip) {
  if (!ip || ip === 'unknown') return '未知'
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return '本机(127.0.0.1)'
  if (ip.includes(':')) {
    const lower = ip.toLowerCase()
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return '内网(IPv6)'
    return ''
  }
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return '内网'
  if (ip.startsWith('172.')) return '内网'
  return ''
}

// 判定是否为可在线解析的外部地址：IPv4 排除内网/保留段；
// IPv6 仅排除回环与本地前缀，公网 IPv6 同样可查归属地。
// 实现已上移到 ip-location.js（与日志覆盖率共用同一份判定），此处保留别名便于阅读
const isExternalIp = isPublicIp

// 把 hiofd 的完整记录写进统计对象。
// 注意字段拆分方式：geo 用"国家 省 市"三段拼接，与本模块原有格式保持一致；
// 区县/街道/经纬度只存在于 geoFull，不塞进 geo，避免污染已有的展示逻辑
function applyHiofdGeo(s, rec) {
  if (!s || !rec) return
  const loc = [rec.country, rec.province, rec.city].filter(Boolean).join(' ')
  if (loc) s.geo = loc
  if (rec.isp) s.isp = rec.isp
  s.geoFull = {
    country: rec.country,
    province: rec.province,
    city: rec.city,
    district: rec.district,
    street: rec.street,
    isp: rec.isp,
    longitude: rec.longitude,
    latitude: rec.latitude,
    source: rec.source,
    queryAt: rec.queryAt,
    fetchedAt: rec.fetchedAt,
    costMs: rec.costMs
  }
}

// 归属地解析编排：全部交给 ip-location（hiofd 主源 + 备用源）。
// 本函数由 record() 在每个请求上调用，不在这里 await 任何网络请求：
// - 缓存命中（24 小时内查过）→ 立即填充，零网络；
// - 未命中 → 入队，查询完成（或失败）后通过 waiters 回调回填。
// 入队本身依赖 lookupOrQueue 的 queue/inflight 去重，重复调用不会再排一次。
async function resolveGeo(ip, s) {
  if (!isExternalIp(ip)) return
  const cached = geoFullOf(ip)
  if (cached) {
    applyHiofdGeo(s, cached)
    return
  }
  lookupOrQueue(ip, rec => { if (rec) applyHiofdGeo(s, rec) })
}

// 归属地的在线解析已统一收拢到 ip-location.js（hiofd 主源 + pconline/ip-api 备用源）。
// 这里原先还有一条 pconline → ip-api → ipinfo 的兜底链，作用是"入队等 hiofd 期间
// 先给统计填个大概的省市"。现在 ip-location 自己就带备用源、失败会自动降级，
// 再跑一遍只会对同一个 IP 重复请求同一个接口——额度翻倍，反而更容易触发 pconline 限流
// （实测 1 秒间隔查到第 3 个就 503），所以整条链删掉，只走 lookupOrQueue 的回调回填。
//
// 代价：新 IP 首次请求写进统计时 geo 还是空的，等查询完成（10 秒内）由回调补上。

// ---------- 请求记录 ----------

// 解析 User-Agent，返回 { device, os, browser, network }
function parseUA(ua = '') {
  const u = ua.toLowerCase()
  let device = '桌面端'
  let os = '未知系统'
  let browser = '未知浏览器'
  // 设备类型：优先按常见关键字判断
  if (/ipad|tablet/.test(u)) device = '平板'
  else if (/iphone|android|mobile/.test(u)) device = '移动端'
  // 操作系统
  if (u.includes('windows')) os = 'Windows'
  else if (u.includes('android')) os = 'Android'
  else if (u.includes('iphone') || u.includes('ipad') || u.includes('ios')) os = 'iOS'
  else if (u.includes('mac os')) os = 'macOS'
  else if (u.includes('linux')) os = 'Linux'
  // 浏览器/App
  if (u.includes('micromessenger')) browser = '微信内置'
  else if (u.includes('capacitor')) browser = 'Capacitor(APK)'
  else if (u.includes('edg/') || u.includes('edge/')) browser = 'Edge'
  else if (u.includes('opera') || u.includes('opr/')) browser = 'Opera'
  else if (u.includes('qqbrowser')) browser = 'QQ浏览器'
  else if (u.includes('ucbrowser')) browser = 'UC浏览器'
  else if (u.includes('chrome')) browser = 'Chrome'
  else if (u.includes('firefox')) browser = 'Firefox'
  else if (u.includes('safari')) browser = 'Safari'
  // 网络状态：优先从 UA 特征推断，其次标记 WebView/移动网络不可直接推断，仅区分已知标记
  let network = '未知网络'
  if (u.includes('wv') || u.includes('webview') || u.includes('capacitor')) {
    network = 'App内WebView'
    if (u.includes('android')) network = 'Android WebView'
    if (u.includes('iphone') || u.includes('ipad')) network = 'iOS WebView'
  } else if (u.includes('micromessenger')) {
    network = '微信内置浏览器'
  }
  // 移动设备走移动网络/无线，桌面走有线/无线，仅作粗略标注
  if (network === '未知网络') network = device === '移动端' ? '移动网络/无线' : '有线/无线'
  return { device, os, browser, network }
}

// 记录一次访问：internalIp 为内网地址时跳过归属地在线解析，标注为本地网络
async function record(req) {
  // 跳过健康检查与静态资源请求，避免首页/JS/CSS 刷爆统计（只记真实访问入口）
  if (req.path === '/api/health') return
  if (/\.(js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|map|json)(\?|$)/i.test(req.path)) return
  // 跨天兜底：若定时器因故未触发（如系统休眠/时钟跳变），在第一条新一天的请求里补归档
  const today = localDateStr(new Date())
  if (today !== currentDate) {
    try { await archiveNow() } catch (e) { console.warn('跨天归档失败:', e.message) }
  }
  // 支持 x-forwarded-for（Nginx 反代时取真实客户端 IP）
  const xff = req.headers['x-forwarded-for']
  const ip = (xff ? String(xff).split(',')[0].trim() : (req.socket?.remoteAddress || '')).replace(/^::ffff:/, '')
  const ua = req.headers['user-agent'] || ''
  // 前端通过 api.js 上报真实网络类型（wifi/4g/3g/2g），有则覆盖 UA 猜测
  const reportedNetwork = String(req.headers['x-network-type'] || '').trim()
  const now = new Date()
  const { device, os, browser, network: guessedNetwork } = parseUA(ua)
  const network = reportedNetwork || guessedNetwork

  let s = stats.get(ip)
  if (!s) {
    s = {
      requests: 1,
      firstSeen: localIso(now),
      lastSeen: localIso(now),
      geo: localGeoLabel(ip),
      isp: '',
      network,
      device,
      os,
      browser,
      paths: {}
    }
    stats.set(ip, s)
  } else {
    s.requests++
    // 老访客再次访问：lastSeen 同样用本地时区格式（此前漏改成 UTC，导致同一记录里两种格式混排）
    s.lastSeen = localIso(now)
    // 后续访问用最新上报/解析的网络类型覆盖（网络环境可能切换）
    if (network) s.network = network
  }
  // 归属地缓存保鲜：每次请求都检查一次，而不是只在 IP 首次出现时查。
  // 老实现把 resolveGeo 写在 if (!s) 分支里，导致 2 小时缓存过期后该 IP 永不刷新——
  // 只要进程不重启、stats 不清空，它之后一整天所有请求的 [IP-GEO] 行都会一直缺。
  // resolveGeo 内部对缓存命中、入队去重、失败冷却都有判断，重复调用只多一次 Map 查找。
  resolveGeo(ip, s).catch(() => {})
  // 累计路径访问次数（不记录查询参数，避免入库搜索关键词等敏感信息）
  s.paths[req.method + ' ' + req.path] = (s.paths[req.method + ' ' + req.path] || 0) + 1
  dirty = true
}

// 定时快照当日数据 + 安排凌晨归档
setInterval(flushTick, FLUSH_INTERVAL)
scheduleMidnightArchive()

// 优雅停机：SIGTERM（docker stop）/SIGINT（Ctrl+C）时强制把当天数据落盘再退出。
// 注意 v1 挂在 process.on('exit') 的方案对信号终止无效，必须拦信号本身
async function shutdownFlush() {
  dirty = true
  await flushTick()
  process.exit(0)
}
process.on('SIGTERM', () => { shutdownFlush() })
process.on('SIGINT', () => { shutdownFlush() })

// Express 中间件：每个请求记录一次访问（不阻塞响应）
export default function accessLogger(req, res, next) {
  record(req).catch(() => {})
  next()
}

// 供测试/调试/手动归档使用：stats 为当天内存数据，archiveNow 可立即触发一次归档
export { stats, flushTick, archiveNow, localIso, OUT_FILE, HISTORY_DIR }
