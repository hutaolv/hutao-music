import { Router } from 'express'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as qishui from '../services/qishui.js'
import * as migu from '../services/migu.js'

const router = Router()

router.get('/', async (req, res) => {
  const { keyword, type } = req.query
  if (!keyword) {
    return res.json({ code: 400, message: 'keyword required' })
  }

  try {
    const results = {}

    if (type === 'artist' || !type) {
      const [neteaseArtists, qqArtists] = await Promise.allSettled([
        netease.searchArtists(keyword),
        qqmusic.searchArtists(keyword)
      ])
      results.artists = [
        ...(neteaseArtists.status === 'fulfilled' ? neteaseArtists.value : []),
        ...(qqArtists.status === 'fulfilled' ? qqArtists.value : [])
      ]
    }

    if (type === 'song' || !type) {
      const [n, q, b, d, qs, mg] = await Promise.allSettled([
        netease.searchSongs(keyword),
        qqmusic.searchSongs(keyword),
        bilibili.searchSongs(keyword),
        douyin.searchSongs(keyword),
        qishui.searchSongs(keyword),
        migu.searchSongs(keyword)
      ])
      results.songs = [
        ...(n.status === 'fulfilled' ? n.value : []),
        ...(q.status === 'fulfilled' ? q.value : []),
        ...(b.status === 'fulfilled' ? b.value : []),
        ...(d.status === 'fulfilled' ? d.value : []),
        ...(qs.status === 'fulfilled' ? qs.value : []),
        ...(mg.status === 'fulfilled' ? mg.value : [])
      ]
    }

    res.json({ code: 200, data: results })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

export default router
