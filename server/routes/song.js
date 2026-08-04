import { Router } from 'express'
import axios from 'axios'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as migu from '../services/migu.js'

const router = Router()

const DEMO_SONGS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3'
]

function getDemoUrl(id) {
  let hash = 0
  const str = String(id)
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return DEMO_SONGS[Math.abs(hash) % DEMO_SONGS.length]
}

router.get('/url', async (req, res) => {
  const { platform, id, bvid, cid, mid, mediaMid, musicId, contentId, copyrightId, quality, detect } = req.query
  if (!platform || !id) {
    return res.json({ code: 400, message: 'platform and id required' })
  }

  try {
    let url = null
    // quality: standard/high/lossless；高音质/无损获取失败时回退标准音质
    const q = ['standard', 'high', 'lossless'].includes(quality) ? quality : 'standard'
    // detect=1 时探测该歌曲实际可用的音质档位，供前端动态显示音质菜单
    let availableQualities = null
    switch (platform) {
      case '网易云音乐':
        if (detect === '1') availableQualities = await netease.detectQualities(id)
        url = await netease.getSongUrl(id, q)
        if (!url && q !== 'standard') url = await netease.getSongUrl(id, 'standard')
        break
      case 'QQ音乐':
        if (detect === '1') availableQualities = await qqmusic.detectQualities(mid || id, mediaMid)
        url = await qqmusic.getSongUrl(mid || id, mediaMid, q)
        if (!url && q !== 'standard') url = await qqmusic.getSongUrl(mid || id, mediaMid, 'standard')
        break
      case 'B站':
        url = await bilibili.getSongUrl(req.query.auid || id)
        break
      case '抖音':
      case '汽水音乐':
        url = req.query.sourceUrl || null
        break
      case '咪咕音乐':
        if (detect === '1') availableQualities = await migu.detectQualities(contentId || id, copyrightId)
        url = await migu.getSongUrl(contentId || id, copyrightId, q)
        if (!url && q !== 'standard') url = await migu.getSongUrl(contentId || id, copyrightId, 'standard')
        break
    }
    if (!url) url = getDemoUrl(id)
    res.json({ code: 200, data: { url, availableQualities } })
  } catch (e) {
    res.json({ code: 200, data: { url: getDemoUrl(req.query.id), availableQualities: null } })
  }
})

router.get('/lyrics', async (req, res) => {
  const { platform, id, mid, lyricUrl, contentId } = req.query
  if (!platform || !id) return res.json({ code: 400, message: 'platform and id required' })

  try {
    let lyrics = null
    switch (platform) {
      case '网易云音乐':
        lyrics = await netease.getLyrics(id)
        break
      case 'QQ音乐':
        lyrics = await qqmusic.getLyrics(mid || id)
        break
      case 'B站':
        lyrics = await bilibili.getLyrics(id, lyricUrl)
        break
      case '抖音':
      case '汽水音乐':
        if (lyricUrl) {
          const { data } = await axios.get(lyricUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 })
          if (Array.isArray(data)) {
            const lrc = data.map(line => {
              const t = parseFloat(line.timeId)
              const m = Math.floor(t / 60)
              const s = Math.floor(t % 60)
              const ms = Math.round((t - Math.floor(t)) * 100)
              return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${line.text}`
            }).join('\n')
            lyrics = { lyrics: lrc, transLyrics: '' }
          }
        }
        break
      case '咪咕音乐':
        lyrics = await migu.getLyrics(contentId || id)
        break
    }
    res.json({ code: 200, data: lyrics || { lyrics: '', transLyrics: '' } })
  } catch (e) {
    res.json({ code: 200, data: { lyrics: '', transLyrics: '' } })
  }
})

// 获取歌手歌曲：B站/抖音/咪咕无歌手专属接口时用 name 辅助搜索过滤，
// 咪咕/网易云/QQ/B站/抖音均支持分页（page 参数），返回 { songs, hasMore }
router.get('/artist', async (req, res) => {
  const { platform, artistId, name, page = 1 } = req.query
  if (!platform || !artistId) {
    return res.json({ code: 400, message: 'platform and artistId required' })
  }

  try {
    let songs = []
    let hasMore = false
    // 各平台 getArtistSongs 统一接收 (artistId, name, page) 并返回 { songs, hasMore }
    const r = await (async () => {
      switch (platform) {
        case '网易云音乐': return netease.getArtistSongs(artistId, name, Number(page))
        case 'QQ音乐': return qqmusic.getArtistSongs(artistId, name, Number(page))
        case 'B站': return bilibili.getArtistSongs(artistId, name, Number(page))
        case '抖音': return douyin.getArtistSongs(artistId, name, Number(page))
        case '咪咕音乐': return migu.getArtistSongs(artistId, name, Number(page))
        default: return { songs: [], hasMore: false }
      }
    })()
    songs = r.songs || []
    hasMore = !!r.hasMore
    res.json({ code: 200, data: { songs, hasMore } })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

export default router
