import { Router } from 'express'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as migu from '../services/migu.js'

const router = Router()

const serviceMap = {
  '网易云音乐': { search: netease.searchSongs, artist: netease.searchArtists },
  'QQ音乐': { search: qqmusic.searchSongs, artist: qqmusic.searchArtists },
  'B站': { search: bilibili.search },
  '抖音': { search: douyin.searchSongs },
  '咪咕音乐': { search: migu.searchSongs }
}

router.get('/', async (req, res) => {
  const { keyword, type, platform } = req.query
  if (!keyword) {
    return res.json({ code: 400, message: 'keyword required' })
  }

  try {
    const results = {}

    if (type === 'artist' || !type) {
      if (platform && serviceMap[platform]?.artist) {
        const artists = await serviceMap[platform].artist(keyword).catch(() => [])
        results.artists = artists
      } else {
        const [neteaseArtists, qqArtists] = await Promise.allSettled([
          netease.searchArtists(keyword),
          qqmusic.searchArtists(keyword)
        ])
        results.artists = [
          ...(neteaseArtists.status === 'fulfilled' ? neteaseArtists.value : []),
          ...(qqArtists.status === 'fulfilled' ? qqArtists.value : [])
        ]
      }
    }

    if (type === 'song' || !type) {
      if (platform && serviceMap[platform]) {
        const songs = await serviceMap[platform].search(keyword).catch(() => [])
        results.songs = songs
      } else {
        const allResults = await Promise.allSettled([
          netease.searchSongs(keyword),
          qqmusic.searchSongs(keyword),
          bilibili.search(keyword),
          douyin.searchSongs(keyword),
          migu.searchSongs(keyword)
        ])
        results.songs = allResults.flatMap(r => r.status === 'fulfilled' ? r.value : [])
      }
    }

    res.json({ code: 200, data: results })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

export default router
