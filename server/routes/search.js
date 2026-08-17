import { Router } from 'express'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as migu from '../services/migu.js'
import * as kuwo from '../services/kuwo.js'
import * as kugou from '../services/kugou.js'
import { searchWithThirdParty } from '../services/thirdPartyApis.js'

const router = Router()

// 胡桃搜 - 第三方 API 搜索
router.get('/thirdparty', async (req, res) => {
  const { keyword, platform } = req.query
  if (!keyword) {
    return res.json({ code: 400, message: 'keyword required' })
  }
  try {
    const songs = await searchWithThirdParty(keyword, platform)
    res.json({ code: 200, data: { songs } })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

// 各平台搜索服务映射：search = 歌曲搜索，artist = 歌手搜索（部分平台没有，走兜底）
const serviceMap = {
  '网易云音乐': { search: netease.searchSongs, artist: netease.searchArtists },
  'QQ音乐': { search: qqmusic.searchSongs, artist: qqmusic.searchArtists },
  'B站': { search: bilibili.search, artist: bilibili.searchArtists },
  '抖音': { search: douyin.searchSongs, artist: douyin.searchArtists },
  '咪咕音乐': { search: migu.searchSongs, artist: migu.searchArtists },
  '酷我音乐': { search: kuwo.searchSongs, artist: null },
  '酷狗音乐': { search: kugou.searchSongs, artist: null }
}

// 酷我官方搜索接口不稳定：6 秒超时或无结果时，自动兜底第三方搜索（胡桃搜逻辑）
async function searchKuwoWithFallback(keyword) {
  try {
    const songs = await Promise.race([
      kuwo.searchSongs(keyword),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
    ])
    if (songs && songs.length) return songs
  } catch {
    // 官方搜索超时/异常，走第三方兜底
  }
  console.warn(`Kuwo official search timeout/empty for "${keyword}", fallback to third-party`)
  return searchWithThirdParty(keyword, '酷我音乐')
}

router.get('/', async (req, res) => {
  const { keyword, type, platform, scope } = req.query
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
        if (platform === 'B站') {
          // B站支持分页（每页50）+ 全站/分区 scope，返回 hasMore 供前端"加载更多"
          const result = await bilibili.search(keyword, scope, Number(req.query.page) || 1)
          results.songs = result.songs
          results.hasMore = result.hasMore
        } else if (platform === '酷我音乐') {
          // 酷我：官方搜索 6s 超时/无结果时自动兜底第三方搜索
          results.songs = await searchKuwoWithFallback(keyword)
        } else {
          results.songs = await serviceMap[platform].search(keyword, scope).catch(() => [])
        }
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
