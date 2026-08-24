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

const __dirname = dirname(fileURLToPath(import.meta.url))
// 日志目录：server/log
const LOG_DIR = resolve(__dirname, 'log')
// 当天数据文件：server/log/access.json
const OUT_FILE = resolve(LOG_DIR, 'access.json')
// 历史归档目录：server/log/history（每天一个文件）
const HISTORY_DIR = resolve(LOG_DIR, 'history')
// 内存有变更时隔多少毫秒落盘一次（仅快照当日数据，供进程重启后恢复当天进度）
const FLUSH_INTERVAL = 30000
// 在线 IP 归属地接口超时（毫秒）
const GEO_TIMEOUT = 4000

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
// 脏标记：内存有新增/变更才需要落盘，避免空转 IO
let dirty = false
// 写入锁：上一次异步写未完成时跳过本轮，防止并发写同一文件互相覆盖
let writeBusy = false

// ---------- 序列化与原子写入 ----------

// 把指定日期的内存数据序列化为文件内容（带 date 字段，启动恢复时据此判断是否属于今天）
function serialize(date, map) {
  return JSON.stringify({ date, savedAt: new Date().toISOString(), ips: Object.fromEntries(map) }, null, 2)
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

// 内网/本机地址的可见标注，替代空 geo
function localGeoLabel(ip) {
  if (!ip || ip === 'unknown') return '未知'
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return '本机(127.0.0.1)'
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return '内网'
  if (ip.startsWith('172.')) return '内网'
  if (ip.includes(':')) return '本机(IPv6)'
  return ''
}

// 判定是否为外部 IPv4（可在线解析归属地）：内网/本机/IPv6 均返回 false
function isExternalIPv4(ip) {
  if (!ip || ip === 'unknown' || ip.includes(':')) return false
  if (ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) return false
  return true
}

// 在线解析 IP 归属地：优先 ipinfo.io（精度高），失败回退 ip-api.com（lang=zh-CN 返回中文）。
// 注意：免费接口有频率限制，新访客大量涌入时会部分解析失败留空，属可接受的降级
async function resolveGeo(ip, s) {
  if (!isExternalIPv4(ip)) return
  // 接口一：ipinfo.io（精度高，包含 ASN/运营商信息）
  try {
    const res = await fetch(`https://ipinfo.io/${ip}/json`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(GEO_TIMEOUT)
    })
    const json = await res.json()
    if (json?.city) {
      // 拼接为 "国家 省份 城市" 格式
      s.geo = [json.country, json.region, json.city].filter(Boolean).join(' ')
      // 从 org 字段提取运营商（格式：ASxxxx 运营商名）
      s.isp = (json.org || '').replace(/^AS\d+\s+/, '') || ''
      return
    }
  } catch { /* 该接口失败则继续尝试下一个 */ }
  // 接口二：ip-api.com（UTF-8 中文结果，国际可访问，兜底）
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,country,regionName,city,isp`, {
      signal: AbortSignal.timeout(GEO_TIMEOUT)
    })
    const json = await res.json()
    if (json?.status === 'success') {
      s.geo = [json.country, json.regionName, json.city].filter(Boolean).join(' ')
      s.isp = json.isp || ''
    }
  } catch { /* 全部失败则保留 unknown */ }
}

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
      firstSeen: now.toISOString(),
      lastSeen: now.toISOString(),
      geo: localGeoLabel(ip),
      isp: '',
      network,
      device,
      os,
      browser,
      paths: {}
    }
    stats.set(ip, s)
    // 首次见到该 IP：异步解析归属地（内网地址跳过在线解析）
    resolveGeo(ip, s)
  } else {
    s.requests++
    s.lastSeen = now.toISOString()
    // 后续访问用最新上报/解析的网络类型覆盖（网络环境可能切换）
    if (network) s.network = network
  }
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
export { stats, flushTick, archiveNow, OUT_FILE, HISTORY_DIR }
