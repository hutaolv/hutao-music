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

app.get('/api/proxy/audio', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ code: 400, message: 'url required' })
  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com/'
      }
    })
    if (!response.ok) return res.status(502).json({ code: 502, message: 'proxy failed' })
    const contentType = response.headers.get('content-type') || 'audio/mpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=3600')
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
