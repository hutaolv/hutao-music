import express from 'express'
import cors from 'cors'
import { Readable } from 'stream'
import chartsRouter from './routes/charts.js'
import searchRouter from './routes/search.js'
import songRouter from './routes/song.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use('/api/charts', chartsRouter)
app.use('/api/search', searchRouter)
app.use('/api/song', songRouter)

app.get('/api/proxy/image', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ code: 400, message: 'url required' })
  try {
    const imageRes = await fetch(decodeURIComponent(url), {
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
    const response = await fetch(decodeURIComponent(url), { headers: fetchHeaders })
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

app.listen(PORT, () => {
  console.log(`MusicHub API Server running on http://localhost:${PORT}`)
})
