import { Router } from 'express'
import axios from 'axios'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as migu from '../services/migu.js'
import * as kugou from '../services/kugou.js'
import * as kuwo from '../services/kuwo.js'
import { neteaseThirdPartyApis, qqThirdPartyApis, kuwoThirdPartyApis, fetchWithFallback } from '../services/thirdPartyApis.js'

const router = Router()

// 清洗歌词文本里的 HTML 实体（如 &nbsp; &amp; &lt; &#39;），避免原样显示
function sanitizeLyricsText(text) {
  if (!text) return text
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

router.get('/url', async (req, res) => {
  const { platform, id, bvid, cid, mid, mediaMid, musicId, contentId, copyrightId, quality, detect, source } = req.query
  if (!platform || !id) {
    return res.json({ code: 400, message: 'platform and id required' })
  }

  try {
    let url = null
    // quality: standard/high/lossless；高音质/无损获取失败时回退标准音质
    const q = ['standard', 'high', 'lossless'].includes(quality) ? quality : 'standard'
    // detect=1 时探测该歌曲实际可用的音质档位，供前端动态显示音质菜单
    let availableQualities = null

    // 第三方搜索的歌曲：直接使用第三方 API
    if (source === 'thirdparty') {
      const thirdPartyApis = platform === 'QQ音乐' ? qqThirdPartyApis : platform === '酷我音乐' ? kuwoThirdPartyApis : neteaseThirdPartyApis
      if (detect === '1') {
        // 探测第三方 API 支持的音质
        availableQualities = []
        const probes = [
          { q: 'lossless', quality: 'lossless' },
          { q: 'high', quality: 'high' },
          { q: 'standard', quality: 'standard' }
        ]
        for (const p of probes) {
          try {
            const result = await Promise.race([
              fetchWithFallback(thirdPartyApis, id, p.quality),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ])
            if (result?.url) availableQualities.push(p.q)
          } catch {}
        }
        if (!availableQualities.length) availableQualities = ['standard']
      }
      // 获取播放地址
      const result = await fetchWithFallback(thirdPartyApis, id, q)
      url = result?.url || null
      if (!url && q !== 'standard') {
        const fallback = await fetchWithFallback(thirdPartyApis, id, 'standard')
        url = fallback?.url || null
      }
    } else {
      // 官方搜索的歌曲：使用官方 API
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
          // 音频馆歌曲走 auid；搜索到的音乐视频按 bvid 取真实的视频音频流
          if (req.query.auid) url = await bilibili.getSongUrl(req.query.auid)
          if (!url && req.query.bvid) url = await bilibili.getVideoUrl(req.query.bvid)
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
        case '酷我音乐':
          // 酷我音乐官方播放 API 需要加密，暂时使用第三方 API
          const kuwoResult = await fetchWithFallback(kuwoThirdPartyApis, id, q)
          url = kuwoResult?.url || null
          if (!url && q !== 'standard') {
            const fallback = await fetchWithFallback(kuwoThirdPartyApis, id, 'standard')
            url = fallback?.url || null
          }
          break
        case '酷狗音乐':
          // 酷狗官方播放接口无需签名：免费歌曲返回直链，付费歌曲 url 为空（前端提示并跳过）
          url = await kugou.getSongUrl(id)
          if (!url && q !== 'standard') url = await kugou.getSongUrl(id)
          break
      }
    }
    // 拿不到真实音频时不返回 demo，前端据此提示"无法获取"并跳过，url 保持为 null
    res.json({ code: 200, data: { url, availableQualities } })
  } catch (e) {
    res.json({ code: 200, data: { url: null, availableQualities: null } })
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
      case '酷我音乐':
        // 酷我歌词：解析 m.kuwo.cn 播放详情页 __NUXT__ 内嵌歌词
        lyrics = await kuwo.getLyrics(id)
        break
      case '酷狗音乐':
        // 酷狗官方歌词接口需要歌曲时长（毫秒），由前端传入 timelength
        lyrics = await kugou.getLyrics(id, req.query.timelength)
        break
    }
    res.json({
      code: 200,
      data: lyrics
        ? { lyrics: sanitizeLyricsText(lyrics.lyrics), transLyrics: sanitizeLyricsText(lyrics.transLyrics) }
        : { lyrics: '', transLyrics: '' }
    })
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
