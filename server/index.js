import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'
import { Readable } from 'stream'
import chartsRouter from './routes/charts.js'
import searchRouter from './routes/search.js'
import songRouter from './routes/song.js'
import accessLogger from './access-log.js'

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
  if (!req.headers['x-network-type']) {
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

app.get('/api/proxy/image', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ code: 400, message: 'url required' })
  try {
    // B站等来源的封面常是协议相对地址（//i0.hdslb.com/...），fetch 无法解析，需补全协议
    let target = decodeURIComponent(url)
    if (target.startsWith('//')) target = 'https:' + target
    const imageRes = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    })
    if (!imageRes.ok) return res.status(502).json({ code: 502, message: 'proxy failed' })
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    Readable.fromWeb(imageRes.body).pipe(res)
  } catch (e) {
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

app.get('/api/proxy/audio', audioStreamGuard, async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ code: 400, message: 'url required' })
  try {
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com/'
    }
    if (req.headers.range) fetchHeaders['Range'] = req.headers.range
    // 与图片代理一样补全协议相对地址，避免解析失败
    let target = decodeURIComponent(url)
    if (target.startsWith('//')) target = 'https:' + target
    const response = await fetch(target, { headers: fetchHeaders })
    if (!response.ok && response.status !== 206) return res.status(502).json({ code: 502, message: 'proxy failed' })
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Accept-Ranges', 'bytes')
    const contentType = response.headers.get('content-type') || 'audio/mpeg'
    res.setHeader('Content-Type', contentType)
    if (response.headers.get('content-length')) res.setHeader('Content-Length', response.headers.get('content-length'))
    if (response.headers.get('content-range')) res.setHeader('Content-Range', response.headers.get('content-range'))
    if (req.headers.range) {
      res.status(206)
    }
    Readable.fromWeb(response.body).pipe(res)
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

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
  // 固定URL：/downloads/胡桃音悦.apk 重定向到最新版文件（绕浏览器缓存）
  app.get('/downloads/%E8%83%A1%E6%A1%83%E9%9F%B3%E6%82%A6.apk', (req, res) => {
    try {
      const data = JSON.parse(readFileSync(versionJsonPath, 'utf8').replace(/^\uFEFF/, ''))
      if (data?.apkFile) {
        return res.redirect(302, `/downloads/${encodeURIComponent(data.apkFile)}`)
      }
    } catch {}
    // fallback：直接尝试读取固定文件名
    res.redirect(302, '/downloads/%E8%83%A1%E6%A1%83%E9%9F%B3%E6%82%A6-1.0.4.apk')
  })
  app.use('/downloads', express.static(downloadsDir, {
    setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment')
  }))
}

const distDir = resolve(__dirname, '../dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(resolve(distDir, 'index.html'))
    }
  })
}

app.listen(PORT, () => {
  console.log(`胡桃音悦 API Server running on http://localhost:${PORT}`)
})
