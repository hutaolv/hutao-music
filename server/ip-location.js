// IP 归属地服务（hiofd 优先）：签名调用 + 每分钟限流 + 2 小时缓存 + 排队重试
//
// 为什么单独抽一个模块：
// 1. hiofd（tool.hiofd.com）的 IP 库比现有的 pconline / ip-api 精细，能给出区县、街道和
//    经纬度，但接口需要前端混淆逻辑还原出来的 k/t/x/r 签名参数，且有调用频率限制，
//    不是能随手 fetch 的公开 API。签名、限流、排队、缓存这四件事集中在这里，
//    业务代码只调用出口函数，不感知细节。
// 2. 对外出口刻意设计成"同步查缓存 + 异步排队"两套：
//    - geoTag(ip) / geoFullOf(ip)：只读内存缓存，无 IO、无 await、绝不抛错，
//      供日志行拼接与访问统计取值；
//    - lookupOrQueue(ip, cb)：未命中则入队，解析完成（含失败）回调一次。
// 3. 限流是硬约束：默认每分钟最多 5 次，超出排队。缓存 2 小时，同一地址 2 小时内不重复查。
//
// 故障隔离：本模块任何异常都只在自己的 ip-geo 日志里留痕，绝不向调用方抛出，
// 也不阻塞请求——hiofd 挂掉时，业务日志与播放接口表现与接入前完全一致。
import { createHash, randomInt } from 'crypto'
import { mkdirSync, readFileSync, existsSync, renameSync, writeFileSync } from 'fs'
import { rename, writeFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  writeGeoRecord,
  writeGeoFail,
  writeGeoQueue,
  writeGeoDrop,
  writeGeoBrief
} from './geo-log.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------- 可调参数（环境变量优先，方便线上不改代码调整）----------

// 总开关：置 0 可整体关闭 hiofd 解析（access-log 会回落到原有解析链）
const ENABLED = String(process.env.IP_LOOKUP_ENABLED ?? '1') !== '0'
// 每分钟最多查询次数
const MAX_PER_MIN = Math.max(1, Number(process.env.IP_LOOKUP_MAX_PER_MIN) || 5)
// 缓存有效期：2 小时，期间同一 IP 不再发起查询
const TTL = Math.max(60_000, Number(process.env.IP_LOOKUP_TTL_MS) || 2 * 60 * 60 * 1000)
// 失败后的冷却时间：避免对超时/限流的地址反复重试，打满本就稀缺的调用额度
const NEG_TTL = Math.max(60_000, Number(process.env.IP_LOOKUP_NEG_TTL_MS) || 10 * 60 * 1000)
// 队列上限：满了丢弃最早入队的地址，防止突发流量把内存撑爆
const QUEUE_MAX = Math.max(10, Number(process.env.IP_LOOKUP_QUEUE_MAX) || 300)
// 缓存条目上限（按插入顺序淘汰）
const CACHE_MAX = 5000
// 单次请求超时：实测该接口耗时波动很大（0.7s ~ 12.7s，冷查询尤慢），
// 超时设太紧会把慢响应误判为失败，进而落入 10 分钟负缓存，导致日志缺归属地
const REQUEST_TIMEOUT = Math.max(5000, Number(process.env.IP_LOOKUP_TIMEOUT_MS) || 20_000)
// 同时在途请求上限：该接口偶发 10 秒以上的慢响应，限制并发数避免堆积一堆连接
const MAX_INFLIGHT = 2
// 缓存落盘间隔（有变更才写）
const FLUSH_INTERVAL = 30_000
// 队列水位线日志间隔：用来判断额度是否够用
const WATERLINE_INTERVAL = 60_000

// ---------- 接口常量 ----------

const API_URL = 'https://toola.hiofd.com/router/rest'
const SERVICE_ID = 'IpQuery'
// key/pwd 来自站点前端硬编码；站点若调整，可用环境变量覆盖，避免改代码重打镜像
const API_KEY = process.env.IP_LOOKUP_KEY || 'key11'
const API_PWD = process.env.IP_LOOKUP_PWD || 'pwd11'
// 签名算法用到的固定片段（由站点混淆逻辑还原，勿随意改动）
const SIGN_P = '3kp'
const SIGN_TAIL = '135'
const SIGN_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
// 伪装成浏览器请求：缺少 Referer 会被判非法来源
const USER_AGENT = process.env.IP_LOOKUP_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ---------- 本地时间格式化 ----------

// 本地时区时间戳（与 access-log / logger 保持同一视觉格式，不带时区后缀）
function localIso(d) {
  const pad = n => String(n).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`
}

// ---------- 状态 ----------

// 缓存：ip -> { country, province, city, district, street, isp, latitude, longitude,
//              source, queryAt, fetchedAt, costMs, queueMs }
const cache = new Map()
// 待查队列：ip -> 入队时间戳（Map 天然去重，同一 IP 只排一次）
const queue = new Map()
// 等待者：ip -> [cb]，同一个 IP 的多个调用方合并，只发一次请求
const waiters = new Map()
// 在途查询集合
const inflight = new Set()
// 负缓存：ip -> 冷却截止时间戳
const negative = new Map()
// 限流窗口：最近 60 秒内实际发出的请求时间戳。
// 这里刻意不用"桶容量 5 + 每 12 秒补 1"的令牌桶——那种算法在首个 60 秒内最多会发出
// 5 + 4 = 9 次（初始满桶 5 次，再叠加 4 次补充），与"每分钟最多 5 次"的硬约束不符。
// 滑动窗口能严格保证"任意 60 秒区间内不超过 MAX_PER_MIN 次"。
const windowHits = []
// 当前报告周期内已发出的请求数（水位线日志用，报告后清零）
let sentSinceReport = 0
// 累计计数（归档汇总用）
const counters = { lookup: 0, hit: 0, fail: 0, drop: 0 }
// 缓存是否有变更待落盘
let dirty = false

// 缓存持久化文件：进程重启后不必重查，也让 2 小时 TTL 跨重启生效。
// 这是"数据"不是"日志"，日志统一走 ip-geo-*.log
const LOG_DIR = resolve(__dirname, 'log')
const CACHE_FILE = resolve(LOG_DIR, 'ip-locations.json')
mkdirSync(LOG_DIR, { recursive: true })

// ---------- 缓存读写 ----------

// 取仍然有效的缓存记录；过期则删除并返回 null
function getCached(ip) {
  const rec = cache.get(ip)
  if (!rec) return null
  if (Date.now() - rec.fetchedAt > TTL) {
    cache.delete(ip)
    dirty = true
    return null
  }
  return rec
}

// 超上限时按插入顺序淘汰最旧的一条（Map 迭代顺序即插入顺序，命中不重排，
// 属近似 LRU，对本场景足够且实现简单）
function trimCache() {
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
}

// 启动时加载磁盘缓存：只保留未过期条目；损坏文件改名留存现场后从空开始
function loadCache() {
  if (!existsSync(CACHE_FILE)) return
  try {
    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf8').replace(/^\uFEFF/, '') || '{}')
    const entries = parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : {}
    const now = Date.now()
    for (const [ip, rec] of Object.entries(entries)) {
      if (!rec || typeof rec !== 'object') continue
      if (!rec.fetchedAt || now - rec.fetchedAt > TTL) continue
      cache.set(ip, rec)
    }
  } catch {
    try {
      renameSync(CACHE_FILE, resolve(LOG_DIR, `ip-locations.corrupt-${Date.now()}.json`))
    } catch { /* 保不住现场也不影响服务启动 */ }
  }
}

// 原子写：先写临时文件再 rename，避免进程被杀时留下半截 JSON
async function flushCache() {
  if (!dirty) return
  dirty = false
  const payload = JSON.stringify({
    savedAt: localIso(new Date()),
    ttlMs: TTL,
    entries: Object.fromEntries(cache)
  }, null, 2)
  try {
    const tmp = `${CACHE_FILE}.tmp`
    await writeFile(tmp, payload, 'utf8')
    await rename(tmp, CACHE_FILE)
  } catch (e) {
    // 写失败恢复脏标记，下一轮重试；不抛出（缓存丢失只影响性能，不影响正确性）
    dirty = true
    writeGeoFail({ ip: '-', error: `缓存落盘失败: ${e.message}`, costMs: 0, retryAfterMs: FLUSH_INTERVAL })
  }
}

// 同步落盘：收到 SIGTERM/SIGINT 时用，确保最后一段缓存不丢
function flushCacheSync() {
  if (!dirty) return
  try {
    writeFileSync(CACHE_FILE, JSON.stringify({
      savedAt: localIso(new Date()),
      ttlMs: TTL,
      entries: Object.fromEntries(cache)
    }, null, 2), 'utf8')
    dirty = false
  } catch { /* 停机阶段失败不阻塞退出 */ }
}

// ---------- 签名构造 ----------

// 生成指定长度的随机串（字符集与站点一致：0-9a-z）
function randStr(n) {
  let s = ''
  for (let i = 0; i < n; i++) s += SIGN_ALPHABET[randomInt(0, SIGN_ALPHABET.length)]
  return s
}

// 构造 k/t/x/r 四个签名参数，逐行对照站点前端逻辑还原：
// - d：7 位随机串，把 SIGN_P 的字符随机插入其中
// - k：d + 22 位随机串
// - t：1 位随机数字 + 毫秒时间戳 + SIGN_P 各字符在 d 中首次出现的位置 + "135"
// - r：32 位随机串
// - x：md5(t + serviceId + t + r + k) + 8 位随机串
function buildSign() {
  const arr = [...randStr(7)]
  for (const ch of SIGN_P) arr.splice(randomInt(0, arr.length + 1), 0, ch)
  const d = arr.join('')
  const kPos = [...SIGN_P].map(ch => String(d.indexOf(ch))).join('')
  const k = d + randStr(22)
  const t = String(randomInt(0, 10)) + Date.now() + kPos + SIGN_TAIL
  const r = randStr(32)
  const x = createHash('md5').update(t + SERVICE_ID + t + r + k, 'utf8').digest('hex') + randStr(8)
  return { k, t, x, r }
}

// ---------- 单次查询 ----------

// 调用 hiofd 查询一个 IP 的归属地。成功返回标准化记录；失败抛错（由调用方记失败日志并做负缓存）。
// 关键校验：返回体里的 ip 必须与请求的 ip 一致——IPv6 场景上游偶发串号，
// 拿 A 的结果去标 B 的归属地比没有数据更糟。
async function queryOnce(ip) {
  const { k, t, x, r } = buildSign()
  const url = `${API_URL}?method=${SERVICE_ID}&r=${Date.now()}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'referer': 'https://tool.hiofd.com/ip/',
      'user-agent': USER_AGENT
    },
    body: JSON.stringify({
      body: { input: { ip } },
      serviceId: SERVICE_ID,
      key: API_KEY,
      pwd: API_PWD,
      k, t, x, r
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  })
  if (res.status !== 200) {
    const err = new Error(`HTTP ${res.status}`)
    err.httpStatus = res.status
    // 读一小段响应体辅助定位（有些错误码会在 body 里说明原因）
    err.body = (await res.text().catch(() => '')).slice(0, 200)
    throw err
  }
  const data = await res.json()
  if (data?.resultCode !== 0) {
    const err = new Error(`resultCode=${data?.resultCode} ${data?.resultMessage || ''}`.trim())
    err.resultCode = data?.resultCode
    throw err
  }
  const resultIp = String(data.ip || '')
  if (resultIp && resultIp !== ip) {
    throw new Error(`返回 IP 不一致（请求 ${ip}，返回 ${resultIp}）`)
  }
  const now = new Date()
  return {
    ip,
    country: String(data.country || '').trim(),
    province: String(data.province || '').trim(),
    city: String(data.city || '').trim(),
    district: String(data.district || '').trim(),
    street: String(data.street || '').trim(),
    isp: String(data.isp || '').trim(),
    latitude: String(data.latitude || '').trim(),
    longitude: String(data.longitude || '').trim(),
    source: 'hiofd',
    queryAt: localIso(now),
    fetchedAt: now.getTime(),
    costMs: 0,
    queueMs: 0
  }
}

// ---------- 结果分发 ----------

// 把结果（null 表示失败）通知给该 IP 的所有等待者，并清理等待队列
function notify(ip, rec) {
  const list = waiters.get(ip)
  waiters.delete(ip)
  if (!list) return
  for (const cb of list) {
    try { cb(rec) } catch { /* 单个回调异常不影响其他等待者 */ }
  }
}

// ---------- 限流判定 ----------

// 申请一次发送配额：严格滑动窗口，任意 60 秒内不超过 MAX_PER_MIN 次。
// 不足时返回 false，由调用方把 IP 留在队列里等待下一个 tick。
function takeToken() {
  const now = Date.now()
  // 移出窗口外的历史记录（数组按时间递增，只需从头弹出）
  while (windowHits.length && now - windowHits[0] >= 60_000) windowHits.shift()
  if (windowHits.length >= MAX_PER_MIN) return false
  windowHits.push(now)
  sentSinceReport++
  return true
}

// ---------- 队列消费 ----------

// 实际发起一次查询并回填缓存
async function runLookup(ip, enqueuedAt) {
  inflight.add(ip)
  const started = Date.now()
  try {
    const rec = await queryOnce(ip)
    rec.costMs = Date.now() - started
    rec.queueMs = enqueuedAt ? started - enqueuedAt : 0
    cache.set(ip, rec)
    trimCache()
    dirty = true
    counters.lookup++
    writeGeoRecord(rec)
    notify(ip, rec)
  } catch (e) {
    counters.fail++
    // 负缓存：冷却期内不再重试同一地址，把额度让给新地址
    negative.set(ip, Date.now() + NEG_TTL)
    writeGeoFail({
      ip,
      error: e.body ? `${e.message} ${e.body}` : e.message,
      httpStatus: e.httpStatus,
      resultCode: e.resultCode,
      costMs: Date.now() - started,
      retryAfterMs: NEG_TTL
    })
    notify(ip, null)
  } finally {
    inflight.delete(ip)
  }
}

// 每秒尝试出队一条：有令牌且在途未满才发车。
// 用"唯一消费者"而不是"谁需要谁去发"，是因为每分钟 5 次是全局配额，
// 必须有单一出口统一分配，否则并发一高就会超发被上游限流。
const drainTimer = setInterval(() => {
  if (!queue.size) return
  if (inflight.size >= MAX_INFLIGHT) return
  if (!takeToken()) return
  const ip = queue.keys().next().value
  const enqueuedAt = queue.get(ip)
  queue.delete(ip)
  runLookup(ip, enqueuedAt)
}, 1000)
// unref：定时器不能阻止进程正常退出
drainTimer.unref()

// ---------- 水位线日志 ----------

// 每分钟一条：积压多深、最久的等了多久、这一分钟发了几次。
// 只在有积压或刚发过请求时输出，空转不刷日志。
// sentSinceReport 在报告后清零，保证"每分钟发出数"是真正的增量而不是累计值
const waterlineTimer = setInterval(() => {
  if (!queue.size && !sentSinceReport) return
  writeGeoQueue({
    pending: queue.size,
    oldestWaitMs: queue.size ? Date.now() - queue.values().next().value : 0,
    sentLastMin: sentSinceReport,
    inflight: inflight.size,
    cacheSize: cache.size
  })
  sentSinceReport = 0
}, WATERLINE_INTERVAL)
waterlineTimer.unref()

// 定时落盘
const flushTimer = setInterval(flushCache, FLUSH_INTERVAL)
flushTimer.unref()

// 启动即加载磁盘缓存
loadCache()

// ---------- 对外接口 ----------

// 同步取"省市·区县·运营商"短标签，供其他模块做粗粒度展示。
// 查不到返回空串，调用方据此决定是否使用，绝不留 "未知" 占位。
export function geoTag(ip) {
  if (!ENABLED || !ip) return ''
  const rec = getCached(ip)
  if (!rec) return ''
  const parts = []
  if (rec.country && rec.country !== '中国') parts.push(rec.country)
  // 直辖市的 province 与 city 相同，只保留一个
  const region = rec.province || rec.city
  if (region) parts.push(region)
  if (rec.district) parts.push(rec.district)
  if (rec.isp) parts.push(rec.isp)
  return parts.join('·')
}

// 同步取完整记录（仅缓存命中时返回，未命中返回 null，绝不触发网络请求）
export function geoFullOf(ip) {
  if (!ENABLED || !ip) return null
  return getCached(ip)
}

// 业务日志用：若该 IP 已有归属地缓存，就在业务行之后紧邻输出一条精简 [IP-GEO] 行。
// 只读缓存、同步完成，未命中时什么都不做（业务日志不会多出占位行）
export function logGeoBrief(ip) {
  if (!ENABLED || !ip) return
  const rec = getCached(ip)
  if (!rec) return
  writeGeoBrief(rec)
}

// 异步：命中缓存立即回调，未命中则入队（解析完成或失败都会回调一次）。
// onDone(rec) 中 rec 为 null 表示失败，调用方应回落到其他解析源。
export function lookupOrQueue(ip, onDone) {
  if (!ENABLED || !ip) {
    if (onDone) onDone(null)
    return
  }
  const cached = getCached(ip)
  if (cached) {
    counters.hit++
    if (onDone) onDone(cached)
    return
  }
  // 冷却期内直接告知失败，让调用方走降级链，不占用限流额度
  const negUntil = negative.get(ip)
  if (negUntil && negUntil > Date.now()) {
    if (onDone) onDone(null)
    return
  }
  if (onDone) {
    if (!waiters.has(ip)) waiters.set(ip, [])
    waiters.get(ip).push(onDone)
  }
  // 已在队列或在途：等待者挂上即可，不重复排队
  if (queue.has(ip) || inflight.has(ip)) return
  // 队列溢出：丢弃最早入队的地址（保留新地址，因为新地址更可能是当前活跃用户），
  // 并把被丢弃地址的等待者按失败回调，避免调用方永远等不到结果
  if (queue.size >= QUEUE_MAX) {
    const oldestIp = queue.keys().next().value
    // 先取排队时长再删除，否则拿到的是 undefined，日志里的等待时长会恒为 0
    const oldestWaitMs = Date.now() - (queue.get(oldestIp) || Date.now())
    queue.delete(oldestIp)
    counters.drop++
    writeGeoDrop({
      dropped: oldestIp,
      droppedWaitMs: oldestWaitMs,
      pending: queue.size,
      reason: '队列已满，丢弃最早入队项'
    })
    notify(oldestIp, null)
  }
  queue.set(ip, Date.now())
}

// 供归档汇总使用：返回累计计数与当前水位
export function getIpLookupStats() {
  return {
    enabled: ENABLED,
    lookup: counters.lookup,
    hit: counters.hit,
    fail: counters.fail,
    drop: counters.drop,
    pending: queue.size,
    cacheSize: cache.size,
    maxPerMin: MAX_PER_MIN,
    ttlHours: +(TTL / 3_600_000).toFixed(1)
  }
}

// 取走计数并清零：凌晨归档时调用，保证每天的汇总只统计当天。
// 与 getIpLookupStats 的区别是带副作用（计数器归零），仅供归档使用
export function takeIpLookupStats() {
  const snapshot = getIpLookupStats()
  counters.lookup = 0
  counters.hit = 0
  counters.fail = 0
  counters.drop = 0
  return snapshot
}

// ---------- 生命周期 ----------

process.on('SIGTERM', flushCacheSync)
process.on('SIGINT', flushCacheSync)

// 命令行自测入口：node server/ip-location.js 61.171.246.254
// 绕过队列与限流直接查一次，用于部署后验证签名算法是否仍然有效
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const target = process.argv[2]
  if (!target) {
    console.error('用法: node server/ip-location.js <ip>')
    process.exit(1)
  }
  const started = Date.now()
  queryOnce(target)
    .then(rec => {
      console.log(JSON.stringify({ ...rec, costMs: Date.now() - started }, null, 2))
      process.exit(0)
    })
    .catch(e => {
      console.error('查询失败:', e.message)
      process.exit(1)
    })
}
