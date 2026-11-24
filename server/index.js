import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { createHash } from 'crypto'
import { isIP } from 'net'
import dns from 'dns/promises'
import { resolve, dirname, sep, extname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync, mkdirSync, readdirSync, statSync, unlinkSync, createReadStream, createWriteStream } from 'fs'
import { Readable } from 'stream'
import chartsRouter from './routes/charts.js'
import searchRouter from './routes/search.js'
import songRouter from './routes/song.js'
import accessLogger from './access-log.js'
import {
  audioCacheHash, readAudioMeta, writeAudioMeta, audioPartSize,
  clearAudioEntry, createPartWriter, streamFromDisk, parseRange
} from './audio-cache.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

// Docker/Nginx 反代场景必须声明信任一层代理：否则 req.ip 恒为容器网关地址，
// 所有访客会被当成同一 IP，限流会误伤全体用户；直连部署时此配置无副作用
app.set('trust proxy', 1)

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// ===== 接口限流：按接口成本分层，防止恶意高频抓取拖垮服务或连累上游平台封禁服务器 IP =====

// 限流触发时的统一响应：保持与现有 API 一致的 JSON 风格，便于前端按业务码处理
function limitHandler(_req, res) {
  res.status(429).json({ code: 429, message: '请求过于频繁，请稍后再试' })
}

// 通用参数封装：开启标准 RateLimit-* 响应头，关闭过时的 X-RateLimit-* 头
function limiterOptions(limit) {
  return { windowMs: 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, handler: limitHandler }
}

// 全局兜底：每 IP 每分钟 120 次。
// 跳过健康检查（监控探针高频调用，不能被限流）与图片代理（榜单/搜索页一次加载几十张封面，
// 计入全局会误伤正常浏览），图片代理单独挂更宽松的桶
const globalLimiter = rateLimit({
  ...limiterOptions(120),
  skip: (req) => req.path === '/health' || req.path.startsWith('/proxy/image')
})

// 搜索限流：每次搜索会扇出并发请求多家上游平台，成本最高，每 IP 每分钟 15 次
// （搜索请求同时计入全局桶，两层独立生效）
const searchLimiter = rateLimit(limiterOptions(15))

// 播放地址解析限流：防脚本批量把歌曲 ID 解析成直链，每 IP 每分钟 30 次
const songUrlLimiter = rateLimit(limiterOptions(30))

// 封面图片代理限流：正常浏览会批量加载封面，放宽到每分钟 300 次
const imageProxyLimiter = rateLimit(limiterOptions(300))

// 健康检查本身不需要计入访问日志
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// 访问日志：全局记录访问者的 IP/归属地/访问次数/网络状态/设备信息（内部会跳过静态资源与健康检查）
app.use(accessLogger)

// 挂载限流：具体接口的桶先挂（更严格的阈值先生效），全局桶后挂做兜底。
// 注意 /api/song/url 必须精确到路径，否则会把歌词 /api/song/lyrics、歌手 /api/song/artist 一起限
app.use('/api/search', searchLimiter)
app.use('/api/song/url', songUrlLimiter)
app.use('/api/proxy/image', imageProxyLimiter)
app.use('/api', globalLimiter)

// ===== 客户端标识校验：拦截无脑脚本 =====
// 前端所有 JSON 数据接口统一经 services/api.js 的 apiFetch 发出，自动携带 X-Network-Type 头：
// 浏览器/APK 正常用户完全无感知，而 curl/wget 等脚本直接抓接口时缺这个头会被 403 拒绝。
// 校验范围严格限定（挂载在具体前缀而非全局）：
// - /api/proxy/* 不查：<img>/<audio> 标签与下载功能不经过 apiFetch，浏览器媒体请求带不了自定义头
// - /api/version 不查：老版本 APK 靠它发现新版本弹更新提示，是旧用户的唯一升级通道，
//   若拦截会导致旧 APK 永远无法收到更新通知
// - /api/health 不查：监控探针高频调用
function clientHeaderGuard(req, res, next) {
  // 只要带了 header 就放行（值可以为空）：手机 WebView 里 navigator.connection
  // 可能不可用导致客户端发空值，空值仍说明是 App 发的请求，不该拦
  if (req.headers['x-network-type'] === undefined) {
    return res.status(403).json({ code: 403, message: 'forbidden' })
  }
  next()
}

for (const dataPrefix of ['/api/charts', '/api/song', '/api/search']) {
  app.use(dataPrefix, clientHeaderGuard)
}

app.use('/api/charts', chartsRouter)
app.use('/api/search', searchRouter)
app.use('/api/song', songRouter)

// ---------- 图片代理磁盘缓存 ----------
// 封面图经代理拉取后落盘共享：A 用户拉过的图，所有用户与后续访问直接回盘，
// 不再打上游（防盗链源站），同时抗上游波动。TTL 7 天 + 总量上限按最旧淘汰
const IMG_CACHE_DIR = resolve(__dirname, 'cache/covers')
const IMG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const IMG_CACHE_MAX_TOTAL = 300 * 1024 * 1024
mkdirSync(IMG_CACHE_DIR, { recursive: true })

// 由 Content-Type 推断扩展名（未知类型按 jpg 处理，与历史回退逻辑一致）
function imgExtOf(contentType) {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('png')) return 'png'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('gif')) return 'gif'
  return 'jpg'
}
// 扩展名反查 Content-Type（缓存命中回盘时还原响应头）
const IMG_EXT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

// 缓存文件路径：对最终上游 URL 取 md5，扩展名记录内容类型
function imageCacheFile(url, contentType) {
  return resolve(IMG_CACHE_DIR, createHash('md5').update(url).digest('hex') + '.' + imgExtOf(contentType))
}

// 周期清理：先删超过 TTL 的文件，总量仍超限时按最旧淘汰
function cleanImageCache() {
  try {
    const now = Date.now()
    let total = 0
    const alive = []
    for (const name of readdirSync(IMG_CACHE_DIR)) {
      const p = resolve(IMG_CACHE_DIR, name)
      let st
      try { st = statSync(p) } catch { continue }
      if (now - st.mtimeMs > IMG_CACHE_TTL_MS) { try { unlinkSync(p) } catch {} continue }
      total += st.size
      alive.push({ p, mtimeMs: st.mtimeMs, size: st.size })
    }
    alive.sort((a, b) => a.mtimeMs - b.mtimeMs)
    for (const e of alive) {
      if (total <= IMG_CACHE_MAX_TOTAL) break
      try { unlinkSync(e.p); total -= e.size } catch {}
    }
  } catch { /* 清理失败不影响主流程 */ }
}
cleanImageCache()
setInterval(cleanImageCache, 6 * 60 * 60 * 1000)   // 每 6 小时清一次

// ===== 代理目标安全校验（防 SSRF）=====
// 图片/音频代理会以服务器身份抓取用户传入的 URL，必须挡住内网与云元数据地址，
// 否则任何人都能借接口读取服务器内网服务（如 169.254.169.254 云凭证、127.0.0.1 内部管理口）。
// 校验链：仅 http/https → 拒绝 localhost/单标签/内建特殊域名 → 字面量 IP 判私网
//        → DNS 解析结果逐个判私网（防域名解析到内网） → 重定向每一跳重新校验。

function isPrivateV4(ip) {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true
  const [a, b] = p
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||          // CGNAT 100.64/10
    (a === 169 && b === 254) ||                    // 链路本地 + 云元数据 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||           // 172.16/12
    (a === 192 && b === 168) ||                    // 192.168/16
    (a === 192 && b === 0) ||                      // 192.0.0/24 特殊用途
    a >= 224                                       // 组播/保留/广播
}

function isPrivateIp(ip) {
  const v = isIP(ip)
  if (v === 4) return isPrivateV4(ip)
  if (v === 6) {
    const h = ip.toLowerCase()
    if (h === '::1' || h === '::') return true
    if (/^f[cd]/.test(h)) return true                            // fc00::/7 唯一本地地址
    if (/^fe[89ab]/.test(h)) return true                         // fe80::/10 链路本地
    const dotted = h.match(/^(?::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/)  // IPv4-mapped/兼容地址
    if (dotted) return isPrivateV4(dotted[1])
    const hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)   // 十六进制 IPv4-mapped
    if (hex) {
      const hi = parseInt(hex[1], 16)
      const lo = parseInt(hex[2], 16)
      return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    return false
  }
  return true   // 无法识别的一律按私网拒绝
}

// 代理目标主机校验结果缓存：音频 Range 分片会对同一主机连续发起几十次请求，
// 若每个分片都 dns.lookup，会明显拖慢首包并放大 DNS 压力。
// 按主机名缓存（成功 2 分钟、失败 30 秒）：既避免重复解析，又把 DNS rebinding 窗口压到很短
const proxyHostVerdicts = new Map()
const PROXY_VERDICT_TTL_OK = 2 * 60 * 1000
const PROXY_VERDICT_TTL_FAIL = 30 * 1000

async function validateProxyUrl(target) {
  let u
  try { u = new URL(target) } catch { return { ok: false, status: 400 } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, status: 403 }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()   // IPv6 字面量带方括号
  if (!host) return { ok: false, status: 403 }
  if (isIP(host)) return isPrivateIp(host) ? { ok: false, status: 403 } : { ok: true }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host === 'metadata.google.internal') return { ok: false, status: 403 }
  if (!host.includes('.')) return { ok: false, status: 403 }      // 单标签主机名按内网服务处理

  const now = Date.now()
  const cached = proxyHostVerdicts.get(host)
  if (cached && cached.exp > now) return cached.verdict

  let verdict
  let addrs
  try { addrs = await dns.lookup(host, { all: true }) } catch { verdict = { ok: false, status: 502 } }
  if (!verdict) {
    if (!addrs.length) verdict = { ok: false, status: 502 }
    else if (addrs.some(a => isPrivateIp(a.address))) verdict = { ok: false, status: 403 }
    else verdict = { ok: true }
  }
  // 容量上限：异常场景下不让缓存无限膨胀
  if (proxyHostVerdicts.size > 1000) proxyHostVerdicts.clear()
  proxyHostVerdicts.set(host, {
    verdict,
    exp: now + (verdict.ok ? PROXY_VERDICT_TTL_OK : PROXY_VERDICT_TTL_FAIL)
  })
  return verdict
}

// 带校验的 fetch：每次请求（含重定向每一跳）先过 validateProxyUrl，
// 防止合法外网地址 302 跳转到内网（redirect-based SSRF）
async function safeFetch(rawUrl, options = {}, maxRedirects = 5) {
  let current = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const v = await validateProxyUrl(current)
    if (!v.ok) {
      const err = new Error('blocked by proxy guard')
      err.proxyStatus = v.status
      throw err
    }
    const resp = await fetch(current, { ...options, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(resp.status)) return resp
    const loc = resp.headers.get('location')
    if (!loc) return resp
    try { resp.body?.cancel() } catch { /* 重定向响应体无需消费 */ }
    current = new URL(loc, current).toString()
  }
  const err = new Error('too many redirects')
  err.proxyStatus = 502
  throw err
}

// 代理响应 Content-Type 白名单：同源代理若原样透传上游的 text/html，
// 攻击者用自己的 URL 就能在本站域名下执行脚本（同源 XSS）。
// 非白名单类型一律降级为 application/octet-stream + nosniff（不可执行、不可渲染脚本）
function safeContentType(upstreamCt, allow) {
  const ct = String(upstreamCt || '').split(';')[0].trim().toLowerCase()
  return allow(ct) ? ct : 'application/octet-stream'
}
const allowImageCt = (ct) => (ct.startsWith('image/') && ct !== 'image/svg+xml')   // SVG 可携带脚本，拒绝
const allowAudioCt = (ct) => ct.startsWith('audio/') || ct.startsWith('video/') || ct === 'application/octet-stream'

app.get('/api/proxy/image', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ code: 400, message: 'url required' })
  try {
    // B站等来源的封面常是协议相对地址（//i0.hdslb.com/...），fetch 无法解析，需补全协议
    let target = decodeURIComponent(url)
    if (target.startsWith('//')) target = 'https:' + target

    // SSRF 校验：内网/元数据/非 http 协议直接拒绝，不进入任何缓存与抓取流程
    const verdict = await validateProxyUrl(target)
    if (!verdict.ok) {
      const msg = verdict.status === 400 ? 'invalid url' : verdict.status === 403 ? 'forbidden url' : 'proxy failed'
      return res.status(verdict.status).json({ code: verdict.status, message: msg })
    }

    // 磁盘缓存命中：按扩展名还原 Content-Type 直接回盘
    const cacheDir = IMG_CACHE_DIR
    const hash = createHash('md5').update(target).digest('hex')
    for (const ext of Object.keys(IMG_EXT_TYPES)) {
      const f = resolve(cacheDir, `${hash}.${ext}`)
      if (!existsSync(f)) continue
      const st = statSync(f)
      if (Date.now() - st.mtimeMs > IMG_CACHE_TTL_MS) break   // 过期视为未命中，走重新拉取并覆盖
      res.setHeader('Content-Type', IMG_EXT_TYPES[ext])
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'public, max-age=604800')
      res.setHeader('Access-Control-Allow-Origin', '*')
      createReadStream(f).pipe(res)
      return
    }

    const imageRes = await safeFetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    })
    if (!imageRes.ok) return res.status(502).json({ code: 502, message: 'proxy failed' })
    // 白名单外的类型（HTML 错误页、SVG 脚本等）降级为二进制流，杜绝同源 XSS
    const isImageCt = allowImageCt(String(imageRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase())
    const contentType = isImageCt
      ? String(imageRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      : 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Access-Control-Allow-Origin', '*')
    // 浏览器缓存从1天提到7天：配合服务端磁盘缓存，封面几乎零重复流量
    res.setHeader('Cache-Control', 'public, max-age=604800')

    // 边转发边写盘：同一份上游流同时给用户和缓存文件，不额外占用内存缓冲
    // 只缓存真正的图片（非图片类型落盘没有意义，还会把错误页长期污染缓存）
    const upstream = Readable.fromWeb(imageRes.body)
    if (isImageCt) {
      const cacheFile = imageCacheFile(target, contentType)
      const ws = createWriteStream(cacheFile)
      upstream.on('error', () => { try { unlinkSync(cacheFile) } catch {} })
      ws.on('error', () => { try { unlinkSync(cacheFile) } catch {} })
      upstream.pipe(ws)
    }
    upstream.pipe(res)
  } catch (e) {
    if (e && e.proxyStatus) {
      const msg = e.proxyStatus === 403 ? 'forbidden url' : 'proxy failed'
      return res.status(e.proxyStatus).json({ code: e.proxyStatus, message: msg })
    }
    res.status(500).json({ code: 500, message: e.message })
  }
})

// ===== 音频代理并发保护 =====
// 音频是长连接（一首歌要流几分钟），按"每分钟请求次数"限流无法反映真实成本，
// 并发流数才是它占用带宽/内存 buffer/上游连接的单位。
// 这里按真实 IP 统计"正在进行中"的流数量，超过上限直接拒绝新请求，
// 防止单一来源开大量并发流吃满服务器资源、影响其他用户播放。
const activeStreams = new Map()
// 阈值支持环境变量覆盖：MAX_STREAMS_PER_IP，默认 4（正常单人听歌同时最多 1~2 条）
const MAX_STREAMS_PER_IP = Number(process.env.MAX_STREAMS_PER_IP) || 4

// 取客户端真实 IP：与 access-log 保持一致的逻辑，
// 优先取反代注入的 X-Forwarded-For 第一段，兜底 socket 直连地址，并去掉 IPv4-mapped 前缀
function getRealIp(req) {
  const xff = req.headers['x-forwarded-for']
  return (xff ? String(xff).split(',')[0].trim() : (req.socket?.remoteAddress || '')).replace(/^::ffff:/, '')
}

// 并发守卫中间件：进入时占用一个额度，连接销毁时归还
function audioStreamGuard(req, res, next) {
  const ip = getRealIp(req)
  const count = activeStreams.get(ip) || 0
  if (count >= MAX_STREAMS_PER_IP) {
    return res.status(429).json({ code: 429, message: '并发流超限，请稍后再试' })
  }
  activeStreams.set(ip, count + 1)
  // 必须监听 close 而不是 end：无论正常播完、用户暂停、关标签页、杀 App 还是网络中断，
  // 只要底层连接销毁 close 都会触发，保证额度一定被归还，计数不会越占越多
  res.on('close', () => {
    const c = activeStreams.get(ip) || 0
    // 归零时直接删 key，防止长期运行后 Map 无限膨胀
    if (c <= 1) activeStreams.delete(ip)
    else activeStreams.set(ip, c - 1)
  })
  next()
}

// ---------- 音频代理：缓存键、Range 工具、预缓冲转发 ----------

// 音频缓存键只接受 "platform:id:quality" 这类稳定标识（长度与字符集都限制），
// 防止被塞任意长字符串造成缓存目录膨胀，或用一个 key 覆盖别人的缓存内容
function safeAudioCacheKey(raw) {
  if (typeof raw !== 'string') return ''
  const k = raw.trim()
  if (k.length < 3 || k.length > 160) return ''
  return /^[\w\u4e00-\u9fa5:.\-]+$/.test(k) ? k : ''
}

// 从 Content-Range 里取整首长度：bytes 0-1023/2829338 -> 2829338
function totalFromContentRange(cr) {
  const m = /\/(\d+)\s*$/.exec(String(cr || ''))
  return m ? Number(m[1]) : 0
}

// 预缓冲转发：先攒够 preBuffer 字节再开始回写。
// 原来的 reader.pipe(res) 是裸转发，上游只要抖半秒，客户端立刻欠载 —— 这是移动端
// "一顿一顿"的直接来源之一。攒够 128KB（约 0.5~1 秒音频）后再开始推，抗抖动能力明显变好，
// 代价只是起播晚 0.1 秒左右。
// 同时把流过的数据追加进缓存分片；客户端中途断开时终止上游、保留已写部分，下次可续传。
async function pumpUpstream({ body, res, writer, preBuffer = 128 * 1024 }) {
  const reader = Readable.fromWeb(body)
  let buffered = []
  let bufferedBytes = 0
  let started = false
  let aborted = false
  const startedAt = Date.now()
  // 预缓冲不能变成起播延迟：慢网（如 40KB/s）攒 128KB 要 3 秒，
  // 所以最多等 400ms，到点就把手上已有的数据先发出去
  const preBufferMaxWait = 400
  const onClose = () => { aborted = true; try { reader.destroy() } catch {} }
  res.on('close', onClose)

  const writeOut = async (chunk) => {
    if (res.destroyed || res.writableEnded) return
    if (!res.write(chunk)) await new Promise(r => res.once('drain', r))
  }

  try {
    for await (const chunk of reader) {
      if (aborted) break
      if (writer) { try { writer.write(chunk) } catch { /* 写盘失败不影响播放 */ } }
      if (!started) {
        buffered.push(chunk)
        bufferedBytes += chunk.length
        if (bufferedBytes >= preBuffer || Date.now() - startedAt >= preBufferMaxWait) {
          started = true
          for (const b of buffered) await writeOut(b)
          buffered = []
        }
      } else {
        await writeOut(chunk)
      }
    }
    if (!started) for (const b of buffered) await writeOut(b)
  } catch {
    // 上游中断：已写出的部分留在分片里，下次请求从断点续传
  } finally {
    res.off('close', onClose)
    if (writer) await new Promise(r => { writer.once('finish', r); writer.once('error', r); writer.end() })
  }
}

// 整首已缓存在本地：直接回盘，支持 Range/seek，完全不碰上游
function serveFromCompleteCache(req, res, hash, meta, range) {
  const total = meta.total
  let start = 0
  let end = total - 1
  let status = 200
  if (range) {
    status = 206
    if (range.suffix != null) {
      start = Math.max(0, total - range.suffix)
    } else {
      // 越界的起点必须回 416：HTTP 里 start >= total 属于不可满足的范围。
      // 若在这里把 start 钳到 total-1，会返回"最后一个字节 + 206"这种无效响应，
      // 播放器拿到后会认为续传成功但内容为空，进而反复重试
      start = range.start ?? 0
      if (start >= total) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`)
        res.end()
        return Promise.resolve()
      }
      end = range.end != null ? Math.min(range.end, total - 1) : total - 1
    }
    if (start > end || start < 0) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`)
      res.end()
      return Promise.resolve()
    }
  }
  res.status(status)
  res.setHeader('Access-Control-Allow-Origin', '*')
  // 音频流不做浏览器缓存：直链带时效，缓存下来的分段很可能已经失效，
  // seek 时命中失效片段反而制造卡顿。本地磁盘缓存已经承担了"重复播放不重复下载"的职责
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', meta.contentType || 'audio/mpeg')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Length', end - start + 1)
  if (status === 206) res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
  return streamFromDisk(res, hash, start, end).then(() => {
    if (!res.writableEnded) res.end()
  })
}

app.get('/api/proxy/audio', audioStreamGuard, async (req, res) => {
  const { url, filename, key } = req.query
  if (!url) return res.status(400).json({ code: 400, message: 'url required' })
  try {
    // 与图片代理一样补全协议相对地址，避免解析失败
    let target = decodeURIComponent(url)
    if (target.startsWith('//')) target = 'https:' + target
    // SSRF 校验：内网/元数据/非 http 协议直接拒绝（音频接口无鉴权，必须拦在最前面）
    const verdict = await validateProxyUrl(target)
    if (!verdict.ok) {
      const msg = verdict.status === 400 ? 'invalid url' : verdict.status === 403 ? 'forbidden url' : 'proxy failed'
      return res.status(verdict.status).json({ code: verdict.status, message: msg })
    }

    const range = parseRange(req.headers.range)
    const isDownload = !!filename
    // 下载请求不参与缓存（一次性的整包下载，缓存只会白占盘）
    const cacheKey = isDownload ? '' : safeAudioCacheKey(key)
    const hash = cacheKey ? audioCacheHash(cacheKey, target) : ''

    if (hash) {
      const meta = readAudioMeta(hash)
      const part = audioPartSize(hash)
      // 1) 整首已经下完：直接回盘，seek 与重播都不再碰上游
      if (meta.total > 0 && part >= meta.total) {
        return serveFromCompleteCache(req, res, hash, meta, range)
      }
      // 2) 手里有半截分片，且客户端要的起点落在分片内：
      //    先用本地数据补上，再从上游续传剩余部分。这是断流恢复的关键路径 ——
      //    上一次播放中断留下的分片不会被浪费，也不必重新下载整首
      const wantStart = range && range.start != null ? range.start : 0
      if (part > 0 && wantStart <= part) {
        const served = await serveResume({ res, target, hash, part, meta, range })
        if (served) return
        // 上游不配合（地址已过期 403、或不支持 Range）：清掉分片，退回纯转发。
        // 若此刻有别的请求正在写这个分片则不清，避免把对方的进度删掉
        if (!audioCacheInflight.has(hash)) clearAudioEntry(hash)
      }
    }

    // 3) 首次播放：边转发边写盘
    await servePassthrough({ req, res, target, hash, range, isDownload })
    return
  } catch (e) {
    // SSRF 拦截/重定向超限：按拦截状态返回，不泄露内部细节
    if (e && e.proxyStatus) {
      const msg = e.proxyStatus === 403 ? 'forbidden url' : 'proxy failed'
      if (!res.headersSent) res.status(e.proxyStatus).json({ code: e.proxyStatus, message: msg })
      return
    }
    // AbortError/TimeoutError 是超时主动断开，非服务器错误，静默关闭连接即可
    if (e.name === 'AbortError' || e.name === 'TimeoutError' || e.name === 'DOMException') {
      if (!res.destroyed) res.destroy()
      return
    }
    if (!res.headersSent) res.status(500).json({ code: 500, message: e.message })
  }
})

// 正在写盘的缓存键：同一首歌被两个用户同时请求时，只让第一个写分片。
// 否则两个流都从同一偏移 append，数据会交错重复，缓存文件直接损坏
// （损坏后下次命中会播出错乱音频，比不缓存还糟）
const audioCacheInflight = new Set()

// 断点续传：本地分片补 [wantStart, part-1]，上游补 [part, 末尾]
// 返回 true 表示已经完整响应（调用方不要再走转发）；false 表示上游不配合，需要回退
async function serveResume({ res, target, hash, part, meta, range }) {
  const wantStart = range && range.start != null ? range.start : 0
  const wantEnd = range && range.end != null ? range.end : null
  const contentType = meta.contentType || 'audio/mpeg'

  // 客户端要的范围完全落在分片内：纯本地响应，不用碰上游
  if (wantEnd != null && wantEnd < part) {
    const total = meta.total || part
    res.status(206)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', contentType)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Range', `bytes ${wantStart}-${wantEnd}/${total}`)
    res.setHeader('Content-Length', wantEnd - wantStart + 1)
    await streamFromDisk(res, hash, wantStart, Math.min(wantEnd, part - 1))
    if (!res.writableEnded) res.end()
    return true
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 15000)
  let response
  try {
    response = await safeFetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/',
        'Range': `bytes=${part}-${wantEnd != null ? wantEnd : ''}`
      },
      signal: ac.signal
    })
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }

  // 只有 206 才说明上游按 Range 返回，可以从 part 处接上；
  // 返回 200（不支持 Range）或 403（地址已过期）都不能续，交回上层重新拉
  if (response.status !== 206 || !response.body) {
    try { response.body?.cancel() } catch {}
    return false
  }
  const total = totalFromContentRange(response.headers.get('content-range'))
  if (!total) {
    try { response.body.cancel() } catch {}
    return false
  }
  writeAudioMeta(hash, { total, contentType })

  const localEnd = Math.min(part - 1, total - 1)
  const respEnd = wantEnd != null ? Math.min(wantEnd, total - 1) : total - 1

  res.status(206)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', contentType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Range', `bytes ${wantStart}-${respEnd}/${total}`)
  res.setHeader('Content-Length', respEnd - wantStart + 1)

  // 先把本地已有的那一段发出去（客户端立刻有数据可播），再续上游
  if (localEnd >= wantStart) await streamFromDisk(res, hash, wantStart, localEnd)
  if (res.destroyed || res.writableEnded) {
    try { response.body.cancel() } catch {}
    return true
  }
  // 并发保护：同一首歌已有请求在写分片时，这次只转发、不写盘，避免两路 append 交错损坏文件
  const ownCache = !audioCacheInflight.has(hash)
  let writer = null
  if (ownCache) {
    audioCacheInflight.add(hash)
    writer = createPartWriter(hash, part)
  }
  try {
    await pumpUpstream({ body: response.body, res, writer, preBuffer: 0 })
  } finally {
    if (ownCache) audioCacheInflight.delete(hash)
  }
  if (!res.writableEnded) res.end()
  return true
}

// 纯转发：首次播放走这里。边转发边写盘，客户端断开后保留已下部分供下次续传
async function servePassthrough({ req, res, target, hash, range, isDownload }) {
  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com/'
  }
  if (req.headers.range) fetchHeaders['Range'] = req.headers.range

  // 超时只约束"拿到响应头"这一步：音频是长连接，整条流都要受 15 秒限制的话，
  // 播到 15 秒就会被掐断。拿到响应头即清掉定时器，后续按客户端节奏走
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 15000)
  let response
  try {
    response = await safeFetch(target, { headers: fetchHeaders, signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok && response.status !== 206) {
    // 416 要原样透传：上游在说"这个范围取不到"，改写成 502 会让播放器认为
    // 是服务器故障而反复重试，实际它应该按 Range 不可满足处理（重新从 0 请求）
    if (response.status === 416) {
      const cr = response.headers.get('content-range')
      try { await response.body?.cancel() } catch {}
      if (cr) res.setHeader('Content-Range', cr)
      return res.status(416).end()
    }
    return res.status(502).json({ code: 502, message: 'proxy failed' })
  }

  res.setHeader('Access-Control-Allow-Origin', '*')
  // 与缓存命中分支一致：音频流不进浏览器缓存，避免命中已失效的分段
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Accept-Ranges', 'bytes')
  // 白名单外的类型（HTML 错误页等）降级为二进制流，防同源 XSS
  const contentType = safeContentType(response.headers.get('content-type'), allowAudioCt)
  res.setHeader('Content-Type', contentType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // 客户端走浏览器兜底下载时带上文件名，否则浏览器会按 URL 末段命名成 "audio"
  if (isDownload) {
    const name = String(req.query.filename).slice(0, 120)
    const ascii = name.replace(/[^\x20-\x7E]/g, '_')
    // 必须把 Content-Type 改成二进制流：多数浏览器（含国产浏览器）对 audio/* 会嗅探成内联播放器，
    // 即使带了 Content-Disposition: attachment 也照样播，octet-stream 才必然触发下载。
    // 只有带 filename 参数的下载请求会命中此分支，播放用的 URL 不受影响。
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`)
  }
  if (response.headers.get('content-length')) res.setHeader('Content-Length', response.headers.get('content-length'))
  if (response.headers.get('content-range')) res.setHeader('Content-Range', response.headers.get('content-range'))
  if (req.headers.range) res.status(206)

  if (!response.body) {
    if (!res.headersSent) res.status(502).json({ code: 502, message: 'upstream closed' })
    return
  }

  // 只有从第 0 字节开始的请求才能顺序写盘（续传场景由 serveResume 处理，避免写空洞）
  const wantStart = range && range.start != null ? range.start : 0
  const total = totalFromContentRange(response.headers.get('content-range')) ||
    Number(response.headers.get('content-length')) || 0
  const ownCache = !!hash && !isDownload && wantStart === 0 && total > 0 && !audioCacheInflight.has(hash)
  let writer = null
  if (ownCache) {
    audioCacheInflight.add(hash)
    writeAudioMeta(hash, { total, contentType })
    writer = createPartWriter(hash, 0)
  }

  try {
    await pumpUpstream({
      body: response.body,
      res,
      writer,
      // 预缓冲量随文件大小自适应：小文件（低码率短音频）若也攒 128KB，
      // 等于要先下掉总量的一大截才开始出声，起播会明显变慢
      preBuffer: total > 0 ? Math.min(128 * 1024, Math.max(16 * 1024, Math.floor(total / 4))) : 128 * 1024
    })
  } finally {
    if (ownCache) audioCacheInflight.delete(hash)
  }
  if (!res.writableEnded) res.end()
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// APK 版本检查：读 server/downloads/version.json，返回最新版本与安装包下载地址
// 支持两种下载方式：
//   1. 带版本号：/downloads/胡桃音悦-1.0.4.apk（精确版本）
//   2. 固定URL：/downloads/胡桃音悦.apk（自动重定向到最新版，绕浏览器缓存）
app.get('/api/version', (req, res) => {
  try {
    const data = JSON.parse(readFileSync(versionJsonPath, 'utf8').replace(/^\uFEFF/, ''))
    if (!data || !data.version || !data.apkFile) {
      return res.status(404).json({ code: 404, message: 'no release' })
    }
    // 带版本号的精确下载地址
    const versionedUrl = `/downloads/${encodeURIComponent(data.apkFile)}`
    // 固定URL：始终指向最新版文件名（带 ?v= 版本号绕浏览器缓存）
    const fixedUrl = `/downloads/${encodeURIComponent(data.apkFileFixed || '胡桃音悦.apk')}?v=${data.version}`
    res.json({
      code: 200,
      data: {
        version: String(data.version),
        apkUrl: versionedUrl,
        apkUrlFixed: fixedUrl,
        notes: data.notes || ''
      }
    })
  } catch {
    res.status(404).json({ code: 404, message: 'no release' })
  }
})

// 静态托管安装包目录（/downloads/胡桃音悦.apk），强制下载行为
const downloadsDir = resolve(__dirname, 'downloads')
const versionJsonPath = resolve(downloadsDir, 'version.json')
if (existsSync(downloadsDir)) {
  // 固定URL：/downloads/胡桃音悦.apk 直接流式返回最新版文件
  // 不用 302 重定向：浏览器跟随重定向会丢掉 <a download> 属性，
  // 部分手机浏览器对重定向后的 content-disposition: attachment 不生效，导致打开空白页不下载。
  // res.download 直接带 attachment 头返回文件，首次响应即触发下载。
  app.get('/downloads/%E8%83%A1%E6%A1%83%E9%9F%B3%E6%82%A6.apk', (req, res) => {
    try {
      const data = JSON.parse(readFileSync(versionJsonPath, 'utf8').replace(/^﻿/, ''))
      if (data?.apkFile) {
        const filePath = resolve(downloadsDir, data.apkFile)
        if (existsSync(filePath)) {
          res.set('Cache-Control', 'no-cache')
          return res.download(filePath, data.apkFile)
        }
      }
    } catch {}
    // fallback：直接尝试读取固定文件名
    const fallback = resolve(downloadsDir, '胡桃音悦.apk')
    if (existsSync(fallback)) {
      res.set('Cache-Control', 'no-cache')
      return res.download(fallback, '胡桃音悦.apk')
    }
    res.status(404).send('Not found')
  })
  app.use('/downloads', express.static(downloadsDir, {
    setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment')
  }))
}

const distDir = resolve(__dirname, '../dist')
if (existsSync(distDir)) {
  // 静态资源缓存策略：
  // - assets/ 下是带内容哈希的 JS/CSS：代码不变则文件名不变，可安全长缓存。
  //   设为 10 天 + immutable，期间浏览器/Cloudflare 直接用本地副本不再发请求
  //   （发新版时哈希文件名变化，index.html 会指向新文件，不存在更新不到的问题）
  // - index.html 不设长缓存：保持每次校验，确保发版即时生效
  app.use(express.static(distDir, {
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${sep}assets${sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=864000, immutable')
      }
    }
  }))
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return
    // 带扩展名的路径视为静态资源（图片/字体/apk 等）：没被 express.static 命中说明文件不存在，
    // 直接 404，不能用 index.html 兜底 —— 否则浏览器/Cloudflare 会把 HTML 当成图片缓存下来，
    // 表现为同一个图标"有的时候加载不出来"（不同边缘节点缓存到 HTML）
    if (/\.[a-z0-9]+$/i.test(req.path)) {
      res.status(404).type('text/plain').send('Not Found')
      return
    }
    res.sendFile(resolve(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`胡桃音悦 API Server running on http://localhost:${PORT}`)
})
