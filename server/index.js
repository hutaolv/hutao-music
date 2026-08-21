import express from 'express'
import cors from 'cors'
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

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// 健康检查本身不需要计入访问日志
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// 访问日志：全局记录访问者的 IP/归属地/访问次数/网络状态/设备信息（内部会跳过静态资源与健康检查）
app.use(accessLogger)

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

app.get('/api/proxy/audio', async (req, res) => {
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
app.get('/api/version', (req, res) => {
  try {
    const data = JSON.parse(readFileSync(versionJsonPath, 'utf8').replace(/^\uFEFF/, ''))
    if (!data || !data.version || !data.apkFile) {
      return res.status(404).json({ code: 404, message: 'no release' })
    }
    res.json({
      code: 200,
      data: {
        version: String(data.version),
        apkUrl: `/downloads/${encodeURIComponent(data.apkFile)}`,
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
