import { Router } from 'express'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as migu from '../services/migu.js'

const router = Router()

// 各平台搜索服务映射：search = 歌曲搜索，artist = 歌手搜索（部分平台没有，走兜底）
const serviceMap = {
  '网易云音乐': { search: netease.searchSongs, artist: netease.searchArtists },
  'QQ音乐': { search: qqmusic.searchSongs, artist: qqmusic.searchArtists },
  'B站': { search: bilibili.search, artist: bilibili.searchArtists },
  '抖音': { search: douyin.searchSongs, artist: douyin.searchArtists },
  '咪咕音乐': { search: migu.searchSongs, artist: migu.searchArtists }
}

router.get('/', async (req, res) => {
  const { keyword, type, platform } = req.query
  if (!keyword) {
    return res.json({ code: 400, message: 'keyword required' })
  }

  try {
    const results = {}

    if (type === 'artist' || !type) {
      if (platform && serviceMap[platform]) {
        // 指定平台：只搜索该平台的歌手
        const artists = await (serviceMap[platform].artist?.(keyword) || Promise.resolve([])).catch(() => [])
        results.artists = artists
      } else {
        // 未指定平台：搜索所有支持歌手搜索的平台
        const allArtists = await Promise.allSettled(
          Object.entries(serviceMap)
            .filter(([, v]) => v.artist)
            .map(([, v]) => v.artist(keyword))
        )
        results.artists = allArtists.flatMap(r => r.status === 'fulfilled' ? r.value : [])
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
