// IP 归属地服务（hiofd 优先，pconline / ip-api 兜底）：签名调用 + 匀速限流 + 24 小时缓存 + 排队重试
//
// 为什么单独抽一个模块：
// 1. hiofd（tool.hiofd.com）的 IP 库比公开接口精细，能给出区县、街道和经纬度，
//    但接口需要前端混淆逻辑还原出来的 k/t/x/r 签名参数，且有调用频率限制，
//    不是能随手 fetch 的公开 API。签名、限流、排队、缓存这四件事集中在这里，
//    业务代码只调用出口函数，不感知细节。
// 2. 双源设计：hiofd 会按来源 IP 拒绝请求（云服务器实测每次都返回 resultCode=1
//    "服务异常2"，同一个 IP 从家用宽带查却正常），所以必须有退路——
//    主源连续失败 3 次即熔断 30 分钟，期间全部改走 pconline（IPv4）/ ip-api（IPv6）。
//    备用源精度只到省市级、没有区县街道经纬度，但保证日志里不会整片空白。
// 3. 对外出口刻意设计成"同步查缓存 + 异步排队"两套：
//    - geoTag(ip) / geoFullOf(ip)：只读内存缓存，无 IO、无 await、绝不抛错，
//      供日志行拼接与访问统计取值；
//    - lookupOrQueue(ip, cb)：未命中则入队，解析完成（含失败）回调一次。
// 4. 节奏是硬约束：默认每 10 秒最多查一个地址（≈ 每分钟 6 次），超出排队。
//    缓存 24 小时，同一地址 24 小时内不重复查。
//
// 故障隔离：本模块任何异常都只在自己的 ip-geo 日志里留痕，绝不向调用方抛出，
// 也不阻塞请求——两个源全挂时，业务日志与播放接口表现与接入前完全一致。
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
  writeGeoBrief,
  writeGeoFill
} from './geo-log.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------- 可调参数（环境变量优先，方便线上不改代码调整）----------

// 总开关：置 0 可整体关闭 hiofd 解析（access-log 会回落到原有解析链）
const ENABLED = String(process.env.IP_LOOKUP_ENABLED ?? '1') !== '0'
// 查询节奏：每隔多少毫秒最多发出一次查询。
// 默认 10 秒 ≈ 每分钟 6 次。
// 为什么不是 12 秒（严格 5 次/分钟）：2026-11-25 实测按 10 秒间隔连发 7 个不同 IP，
// 第 6 次发出时 60 秒窗口内已有 6 次，7 次查询全部成功、fail=0，
// 说明上游额度并没有卡死在 5 次。若线上冒出 [IP-GEO-FAIL] 且带限流错误码，
// 用 IP_LOOKUP_INTERVAL_MS=12000 调回去即可，不用改代码。
// 取代了原来的"每分钟最多 N 次"滑动窗口——那个实现会在第 1~5 秒连发 5 次，
// 随后整整卡 55 秒，队列推进节奏完全不可预测，第 N 个 IP 要等多久算不出来。
const INTERVAL_MS = Math.max(1000, Number(process.env.IP_LOOKUP_INTERVAL_MS) || 10_000)
// 缓存有效期：24 小时。
// 为什么不是 2 小时：IP 归属地几乎不会变，2 小时意味着回头客每两小时就重新消耗
// 一次本就稀缺的查询额度。按 10 秒/个的节奏，2 小时 TTL 下日活 500 个 IP 一天要
// 查约 6000 次（产能只有 7200，毫无余量）；放到 24 小时只需 500 次，余量 14 倍。
const TTL = Math.max(60_000, Number(process.env.IP_LOOKUP_TTL_MS) || 24 * 60 * 60 * 1000)
// 失败后的冷却时间：避免对超时/限流的地址反复重试，打满本就稀缺的调用额度
const NEG_TTL = Math.max(60_000, Number(process.env.IP_LOOKUP_NEG_TTL_MS) || 10 * 60 * 1000)
// 队列上限：满了丢弃最早入队的地址，防止突发流量把内存撑爆
const QUEUE_MAX = Math.max(10, Number(process.env.IP_LOOKUP_QUEUE_MAX) || 300)
// 缓存条目上限（按插入顺序淘汰）。
// TTL 放到 24 小时后，一天的独立 IP 会全部留在缓存里，上限需要相应放宽：
// 2 万条 × 约 300 字节 ≈ 6MB 内存，压力可忽略
const CACHE_MAX = 20000
// 单次请求超时：实测该接口耗时波动很大（0.7s ~ 12.7s，冷查询尤慢），
// 超时设太紧会把慢响应误判为失败，进而落入 10 分钟负缓存，导致日志缺归属地
const REQUEST_TIMEOUT = Math.max(5000, Number(process.env.IP_LOOKUP_TIMEOUT_MS) || 20_000)
// 备用源单独的超时：ip-api 实测可从 0.4s 飙到 15s，用主源那 20 秒的额度会把
// 并发槽位（MAX_INFLIGHT=2）占死，后面排队的地址跟着一起卡住，所以收紧到 8 秒
const BACKUP_TIMEOUT = 8000
// 同时在途请求上限：该接口偶发 10 秒以上的慢响应，限制并发数避免堆积一堆连接
const MAX_INFLIGHT = 2
// 主源熔断：连续失败达到阈值后停用一段时间，期间全部直接走备用源。
// 为什么必须熔断：hiofd 会按来源 IP 拒绝请求——实测某台云服务器每次查询都返回
// resultCode=1"服务异常2"，而同一个 IP 从家用宽带查就正常返回。不熔断的话，
// 每个新地址都要先白等 1~2 秒（实测 461~2281ms）才降级，纯属浪费，
// 而且这些注定失败的请求还会持续给上游风控送弹药。
const BREAKER_THRESHOLD = 3
const BREAKER_COOLDOWN = Math.max(60_000, Number(process.env.IP_LOOKUP_BREAK_MS) || 30 * 60 * 1000)
// 缓存落盘间隔（有变更才写）
const FLUSH_INTERVAL = 30_000
// 队列水位线日志间隔：用来判断额度是否够用
const WATERLINE_INTERVAL = 60_000

// ---------- 接口常量 ----------

const API_URL = 'https://toola.hiofd.com/router/rest'
const SERVICE_ID = 'IpQuery'
// 备用源：不依赖 key/签名，代价是精度只到省市级、没有区县街道经纬度。
// hiofd 按来源 IP 拒绝时，全靠它兜底，否则整条链路会一个地址都查不出来。
// pconline：全中文含运营商，仅 IPv4；实测有限流（1 秒间隔第 3 个起 503，
//           4 秒间隔全部正常），本模块 10 秒一个的节奏不会触发
const PCONLINE_URL = 'https://whois.pconline.com.cn/ipJson.jsp'
// ip-api：支持 IPv4/IPv6，返回中文；免费版只走 http、限 45 次/分钟，实测约 2.7 秒
const IPAPI_URL = 'http://ip-api.com/json'
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
// 主源熔断状态：连续失败次数 + 停用截止时间戳
let primaryFailStreak = 0
let primaryDownUntil = 0
// 上次实际发出查询的时间戳：匀速闸门唯一需要的状态。
// 距它不足 INTERVAL_MS 时，出队循环一律拿不到配额。
let lastSentAt = 0
// 当前报告周期内已发出的请求数（水位线日志用，报告后清零）
let sentSinceReport = 0
// 累计计数（归档汇总用）。
// brief/briefMiss 是"日志覆盖率"的分子分母：每次业务入口尝试写 [IP-GEO] 行时计数，
// 命中缓存记 brief，未命中记 briefMiss。没有这两个数就无法判断这套解析到底有没有用，
// 只能凭感觉调参数。
const counters = { lookup: 0, hit: 0, fail: 0, drop: 0, brief: 0, briefMiss: 0 }
// 缓存是否有变更待落盘
let dirty = false

// 缓存持久化文件：进程重启后不必重查，也让缓存 TTL 跨重启生效。
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

// ---------- 备用源 ----------
//
// 作用：主源按来源 IP 拒绝时的唯一退路。返回结构与 queryOnce 保持一致，
// 下游（缓存、日志、统计）不需要区分数据来自哪个源，只靠 source 字段区分。
// 精度差异：没有区县、街道、经纬度，只有国家/省/市/运营商。

// 中国省级行政区前缀，用来判断 pconline 返回的 pro 是境内省份还是境外国家
const CN_REGION_RE = /^(北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|香港|澳门)/

// pconline（太平洋电脑网）：全中文，含运营商。
// 两个坑：① 只支持 IPv4，传 IPv6 会忽略参数、返回调用方自己的归属地；
//        ② 返回体是 GBK 编码，必须先按 GBK 解码再 JSON.parse
async function queryPconline(ip) {
  if (ip.includes(':')) throw new Error('pconline 不支持 IPv6')
  const res = await fetch(`${PCONLINE_URL}?ip=${encodeURIComponent(ip)}&json=true`, {
    headers: { 'user-agent': USER_AGENT, referer: 'https://whois.pconline.com.cn/' },
    signal: AbortSignal.timeout(BACKUP_TIMEOUT)
  })
  if (!res.ok) {
    const err = new Error(`pconline HTTP ${res.status}`)
    err.httpStatus = res.status
    throw err
  }
  const json = JSON.parse(new TextDecoder('gbk').decode(await res.arrayBuffer()))
  if (!json?.pro) throw new Error(`pconline 无结果${json?.err ? ': ' + json.err : ''}`)
  // addr 形如"广东省深圳市 电信"：空格后是运营商；港澳台等可能只有一段，此时不填 isp
  const parts = String(json.addr || '').split(/\s+/).filter(Boolean)
  const now = new Date()
  return {
    ip,
    country: CN_REGION_RE.test(json.pro) ? '中国' : '',
    province: String(json.pro || '').trim(),
    city: String(json.city || '').trim(),
    district: '',
    street: '',
    isp: parts.length > 1 ? parts[parts.length - 1] : '',
    latitude: '',
    longitude: '',
    source: 'pconline',
    queryAt: localIso(now),
    fetchedAt: now.getTime(),
    costMs: 0,
    queueMs: 0
  }
}

// ip-api：IPv6 的唯一退路（pconline 查不了 IPv6）。
// 免费版只提供 http 明文接口，部分机房会禁明文出网，此时会抛错并落负缓存
async function queryIpApi(ip) {
  const res = await fetch(`${IPAPI_URL}/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,message,country,regionName,city,isp`, {
    signal: AbortSignal.timeout(BACKUP_TIMEOUT)
  })
  if (!res.ok) {
    const err = new Error(`ip-api HTTP ${res.status}`)
    err.httpStatus = res.status
    throw err
  }
  const json = await res.json()
  if (json?.status !== 'success') throw new Error(`ip-api 无结果${json?.message ? ': ' + json.message : ''}`)
  const now = new Date()
  return {
    ip,
    country: String(json.country || '').trim(),
    province: String(json.regionName || '').trim(),
    city: String(json.city || '').trim(),
    district: '',
    street: '',
    isp: String(json.isp || '').trim(),
    latitude: '',
    longitude: '',
    source: 'ip-api',
    queryAt: localIso(now),
    fetchedAt: now.getTime(),
    costMs: 0,
    queueMs: 0
  }
}

// 备用源本身也是两级：IPv4 先试 pconline（快、直接给运营商），
// 被限流（实测 1 秒间隔就 503）或返回无结果时再退到 ip-api；IPv6 只能走 ip-api。
// 两个都失败才抛错——把两条错误拼在一起，日志里能直接看出是哪边挂了。
async function queryBackup(ip) {
  const errors = []
  if (!ip.includes(':')) {
    try {
      return await queryPconline(ip)
    } catch (e) {
      errors.push(`pconline: ${e.message}`)
    }
  }
  try {
    return await queryIpApi(ip)
  } catch (e) {
    errors.push(`ip-api: ${e.message}`)
  }
  throw new Error(errors.join(' / '))
}

// 主源是否可用（未处于熔断期）
function primaryUsable() {
  return Date.now() >= primaryDownUntil
}

// 记录一次主源失败；达到阈值则熔断并写一条明显的告警，便于运维一眼看到降级
function onPrimaryFail(err) {
  primaryFailStreak++
  if (primaryFailStreak < BREAKER_THRESHOLD || Date.now() < primaryDownUntil) return
  primaryDownUntil = Date.now() + BREAKER_COOLDOWN
  writeGeoFail({
    ip: '-',
    error: `主源连续失败 ${primaryFailStreak} 次，熔断 ${Math.round(BREAKER_COOLDOWN / 60000)} 分钟，期间只走备用源：${err.message}`,
    httpStatus: err.httpStatus,
    resultCode: err.resultCode,
    costMs: 0,
    retryAfterMs: BREAKER_COOLDOWN
  })
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

// 申请一次发送配额：匀速闸门，距上次发出不足 INTERVAL_MS 就拒绝。
// 拿不到时由调用方把 IP 留在队列里，等下一个 tick 再来。
// 与滑动窗口的区别：窗口是"攒满 5 个额度一口气打完"，闸门是"每 10 秒稳定放一个"。
// 后者让队列里第 N 个 IP 的等待时间可以直接按 N × 10 秒预估，便于判断缓冲够不够用。
function takeToken() {
  const now = Date.now()
  if (now - lastSentAt < INTERVAL_MS) return false
  lastSentAt = now
  sentSinceReport++
  return true
}

// ---------- 队列消费 ----------

// 实际发起一次查询并回填缓存。
// 两级源：主源（hiofd）可用就先试，失败或熔断中则降级到备用源；
// 只有两级都失败才落负缓存。这样单边故障不会让归属地整体空掉。
async function runLookup(ip, enqueuedAt) {
  inflight.add(ip)
  const started = Date.now()
  // 提到 try 外层，失败日志里要能说清"主源当时是什么状态"
  let primaryError = null
  let primarySkipped = false
  try {
    let rec = null
    if (primaryUsable()) {
      try {
        rec = await queryOnce(ip)
        primaryFailStreak = 0
      } catch (e) {
        primaryError = e
        onPrimaryFail(e)
      }
    } else {
      primarySkipped = true
    }
    if (!rec) {
      rec = await queryBackup(ip)
      // 降级原因写进记录，ip-geo 日志里靠它区分"本来就该用备用源"和"主源挂了"
      if (primaryError) rec.fallbackFrom = primaryError.message
      else if (primarySkipped) rec.fallbackFrom = 'primary breaker open'
    }
    rec.costMs = Date.now() - started
    rec.queueMs = enqueuedAt ? started - enqueuedAt : 0
    cache.set(ip, rec)
    trimCache()
    dirty = true
    counters.lookup++
    writeGeoRecord(rec)
    // 补写一行带 forAt 的归属地：enqueuedAt 就是"正在等归属地的那次请求"的时刻。
    // 之前这类新 IP 的那次请求在 app 日志里永远是一行空白（只有缓存命中才写 [IP-GEO]），
    // 现在查到后补一行 FILL，把这段空白补上。
    // 命令行直查（enqueuedAt 为空）不产生这条噪音。
    if (enqueuedAt) {
      writeGeoFill(rec, {
        forAt: localIso(new Date(enqueuedAt)),
        waitMs: Date.now() - enqueuedAt
      })
    }
    notify(ip, rec)
  } catch (e) {
    counters.fail++
    // 负缓存：冷却期内不再重试同一地址，把额度让给新地址
    negative.set(ip, Date.now() + NEG_TTL)
    // 备用源也失败时，把主源的状态一并写进错误信息——
    // 否则只能看到"pconline HTTP 503"，不知道 hiofd 那边是不是早就熔断了
    const note = primaryError
      ? ` [主源: ${primaryError.message}]`
      : primarySkipped ? ' [主源熔断中]' : ''
    writeGeoFail({
      ip,
      error: `${e.body ? e.message + ' ' + e.body : e.message}${note}`,
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

// 每 500ms 尝试出队一条：有配额且在途未满才发车。
// 用"唯一消费者"而不是"谁需要谁去发"，是因为这个节奏是全局的，
// 必须有单一出口统一分配，否则并发一高就会超发被上游限流。
// tick 取 500ms 而不是 1000ms：闸门判的是"距上次 ≥INTERVAL_MS"，检查粒度越粗，
// 实际间隔的漂移越大（1 秒粒度下 10 秒闸门会漂到 10~11 秒），500ms 能压到 10.0~10.5 秒。
const drainTimer = setInterval(() => {
  if (!queue.size) return
  if (inflight.size >= MAX_INFLIGHT) return
  if (!takeToken()) return
  const ip = queue.keys().next().value
  const enqueuedAt = queue.get(ip)
  queue.delete(ip)
  runLookup(ip, enqueuedAt)
}, 500)
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

// 判定是否为需要归属地的公网地址：
// IPv4 排除内网/保留段；IPv6 仅排除回环与本地前缀，公网 IPv6 同样可查。
// 该判定同时用于"要不要去查"和"日志覆盖率的分母"，两处必须一致，
// 否则会出现"查了但不计入覆盖率"这种自相矛盾的数字。
export function isPublicIp(ip) {
  if (!ip || ip === 'unknown') return false
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return false
  if (ip.includes(':')) {
    const lower = ip.toLowerCase()
    return !(lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd'))
  }
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) return false
  return true
}

// 业务日志用：若该 IP 已有归属地缓存，就在业务行之后紧邻输出一条精简 [IP-GEO] 行。
// 只读缓存、同步完成，未命中时什么都不做（业务日志不会多出占位行）。
//
// 命中与未命中都计数：这两个数字构成"[IP-GEO] 行覆盖率"。
// 内网/本机地址不进分母——本地开发时全是 127.0.0.1，算进来覆盖率会永远是 0%，失去意义。
export function logGeoBrief(ip) {
  if (!ENABLED || !isPublicIp(ip)) return
  const rec = getCached(ip)
  if (!rec) {
    counters.briefMiss++
    return
  }
  counters.brief++
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
    // 同一 IP 在排队期间可能被反复请求（record 现在每个请求都会调用本函数），
    // 回调里做的是同一件事（把结果写回同一个统计对象），因此只需少量样本即可。
    // 不设上限的话，一个排队几分钟的热门 IP 会堆积成百上千个闭包。
    const list = waiters.get(ip)
    if (list.length < 8) list.push(onDone)
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
    // hit 只统计 lookupOrQueue 内部命中。正常路径下 resolveGeo 会先查缓存并提前返回，
    // 走不到 lookupOrQueue，所以这个值几乎恒为 0——判断命中率请用下面的 brief / coverage
    hit: counters.hit,
    fail: counters.fail,
    drop: counters.drop,
    pending: queue.size,
    cacheSize: cache.size,
    intervalMs: INTERVAL_MS,
    ttlHours: +(TTL / 3_600_000).toFixed(1),
    // 主源健康度：连续失败次数与熔断剩余时间。排查"为什么日志里 source 全是 pconline"看这里
    primary: {
      failStreak: primaryFailStreak,
      downForMs: Math.max(0, primaryDownUntil - Date.now())
    },
    // 日志覆盖率：入口业务行里成功带上归属地的比例（分母排除内网/本机）。
    // 这是判断"解析够不够用"的唯一客观依据——没有它只能凭感觉调限流和 TTL。
    brief: counters.brief,
    briefMiss: counters.briefMiss,
    coverage: (() => {
      const total = counters.brief + counters.briefMiss
      return total ? +(counters.brief / total * 100).toFixed(1) : 0
    })()
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
  counters.brief = 0
  counters.briefMiss = 0
  return snapshot
}

// ---------- 生命周期 ----------

process.on('SIGTERM', flushCacheSync)
process.on('SIGINT', flushCacheSync)
// process.exit()、未捕获异常等退出路径不会触发上面两个信号，
// 会丢掉最近 30 秒（FLUSH_INTERVAL）尚未落盘的缓存，重启后只能重新查一遍。
// exit 钩子里只能做同步操作，flushCacheSync 正好是同步的。
process.on('exit', flushCacheSync)

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
