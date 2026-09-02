import { Router } from 'express'
import axios from 'axios'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as migu from '../services/migu.js'
import * as kugou from '../services/kugou.js'
import * as kuwo from '../services/kuwo.js'
import { neteaseThirdPartyApis } from '../services/hutao-netease.js'
import { qqThirdPartyApis } from '../services/hutao-qq.js'
import { kuwoThirdPartyApis } from '../services/hutao-kuwo.js'
import { kugouThirdPartyApis } from '../services/hutao-kugou.js'
import { fetchWithFallback } from '../services/thirdPartyApis.js'
import { log } from '../logger.js'

const router = Router()

// 提取客户端真实IP：优先 X-Forwarded-For，回退 remoteAddress
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for']
  const raw = xff ? String(xff).split(',')[0].trim() : (req.socket?.remoteAddress || '')
  return raw.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1')
}

// 播放地址缓存：同一首歌10分钟内不重复请求
// （主流平台签名直链实际有效期普遍在20分钟左右，10分钟取中间安全值）
const urlCache = new Map()
const URL_CACHE_TTL = 10 * 60 * 1000
function getCachedUrl(key) {
  const entry = urlCache.get(key)
  if (entry && Date.now() - entry.ts < URL_CACHE_TTL) return entry.url
  urlCache.delete(key)
  return null
}
function setCachedUrl(key, url) {
  if (url) urlCache.set(key, { url, ts: Date.now() })
  // 限制缓存大小
  if (urlCache.size > 200) {
    const oldest = urlCache.keys().next().value
    urlCache.delete(oldest)
  }
}

// ---------- 音质探测独立缓存（P1）----------
// 探测需要并发打满多个上游接口（实测一次约1.4秒），而同一首歌的可用音质短期不会变化，
// 因此把探测结果单独缓存30分钟：期间任何用户再触发探测都直接复用，不再打扰上游
const qualityCache = new Map()
const QUALITY_CACHE_TTL = 30 * 60 * 1000

function getCachedQualities(key) {
  const entry = qualityCache.get(key)
  if (entry && Date.now() - entry.ts < QUALITY_CACHE_TTL) return entry.list
  qualityCache.delete(key)
  return null
}

function setCachedQualities(key, list) {
  if (!Array.isArray(list) || !list.length) return
  qualityCache.set(key, { list, ts: Date.now() })
  // 容量上限防膨胀：每条仅几十字节，300条约几十KB
  if (qualityCache.size > 300) {
    qualityCache.delete(qualityCache.keys().next().value)
  }
}

// 官方探测器的缓存包装：优先读缓存，未命中执行探测器并写缓存；异常时降级为标准音质
// 参数：detector - 官方探测函数；cacheKey - 探测缓存键
async function detectQualitiesCached(detector, cacheKey) {
  const cached = getCachedQualities(cacheKey)
  if (cached) return cached
  try {
    const list = await detector()
    if (Array.isArray(list) && list.length) {
      setCachedQualities(cacheKey, list)
      return list
    }
  } catch { /* 探测失败降级 */ }
  return ['standard']
}

// 第三方API并行探测三个音质档位（带缓存）。机制与原三处内联代码一致：
// 每档位5秒超时保护，全部失败时兜底返回标准音质
async function probeQualitiesByApis(apis, songId, cacheKey, ip) {
  const cached = getCachedQualities(cacheKey)
  if (cached) return cached
  const probes = [
    { q: 'lossless', quality: 'lossless' },
    { q: 'high', quality: 'high' },
    { q: 'standard', quality: 'standard' }
  ]
  const results = await Promise.allSettled(probes.map(p =>
    Promise.race([
      fetchWithFallback(apis, songId, p.quality, ip),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]).then(r => ({ q: p.q, ok: !!r?.url })).catch(() => ({ q: p.q, ok: false }))
  ))
  const list = results.map(r => r.value).filter(r => r.ok).map(r => r.q)
  const finalList = list.length ? list : ['standard']
  setCachedQualities(cacheKey, finalList)
  return finalList
}

// ---------- 双路并行竞速（P0）----------
// 官方与第三方两条解析路径同时出发，先拿到有效地址者胜出。
// 反超窗口只在"官方仍在途中"时生效：若官方已明确失败，第三方结果立即采用，
// 不白等窗口期（QQ 无版权歌的常见场景，官方会秒回 null）。
// 任一路抛错视为该路失败，不影响另一路
function raceDualPath(preferredFn, fallbackFn, graceMs = 600, ip) {
  const t0 = Date.now()
  const pPreferred = (async () => { try { return await preferredFn() } catch { return null } })()
  const pFallback = (async () => { try { return await fallbackFn() } catch { return null } })()
  return new Promise(resolve => {
    let settled = false
    let prefVal = null, prefDone = false     // 官方路的终局状态
    let fallVal = null, fallDone = false     // 第三方路的终局状态
    let timer = null

    const finish = (value, tag) => {
      if (settled || !value?.url) return
      settled = true
      if (timer) clearTimeout(timer)
      log(`[${ip || '-'}] [Race] ${tag} 胜出，耗时 ${Date.now() - t0}ms`)
      resolve(value)
    }

    // 第三方就绪后的裁决：官方已失败 → 立即采用第三方；
    // 官方还在路上 → 启动一次反超窗口计时
    const adjudicate = () => {
      if (settled || !fallDone || !fallVal?.url) return false
      if (prefDone) {
        finish(fallVal, '第三方(官方已失败)')
        return true
      }
      if (!timer) {
        timer = setTimeout(() => finish(fallVal, '第三方(超时反超)'), graceMs)
      }
      return true
    }

    const allDoneCheck = () => {
      if (!settled && prefDone && fallDone) {
        resolve(prefVal?.url ? prefVal : (fallVal?.url ? fallVal : null))
      }
    }

    pPreferred.then(v => {
      prefVal = v
      prefDone = true
      if (v?.url) {
        finish(v, '官方')
      } else {
        // 官方先失败了：若第三方也已就绪，立刻放行，不空耗窗口
        adjudicate()
      }
      allDoneCheck()
    })
    pFallback.then(v => {
      fallVal = v
      fallDone = true
      if (!adjudicate()) allDoneCheck()
    })
  })
}

// ---------- 酷我兜底链（从原三处内联代码提取复用）----------

// 酷我关键词搜索：返回首个命中的酷我歌曲ID，失败返回 null
async function searchKuwoId(title, artist) {
  try {
    const keyword = artist ? `${title} ${artist.split('/')[0]}` : title
    const { data } = await axios.get('http://search.kuwo.cn/r.s', {
      params: { client: 'kt', all: keyword, pn: 0, rn: 1, uid: '794762570', ver: 'kwplayer_ar_9.2.2.1', vipver: '1', show_copyright_off: '1', newver: '1', ft: 'music', cluster: '0', strategy: '2012', encoding: 'utf8', rformat: 'json', vermerge: '1', mobi: '1', issubtitle: '1' },
      headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000
    })
    const hit = data?.abslist?.[0]
    return hit ? String(hit.MUSICRID || '').replace('MUSIC_', '') : null
  } catch { return null }
}

// 用酷我ID走第三方API解析播放地址；目标音质拿不到时逐级回退标准。返回 { url } 或 null
async function resolveKuwoById(kuwoId, q, ip) {
  try {
    const result = await fetchWithFallback(kuwoThirdPartyApis, kuwoId, q, ip)
    let u = result?.url || null
    if (!u && q !== 'standard') {
      const fb = await fetchWithFallback(kuwoThirdPartyApis, kuwoId, 'standard', ip)
      u = fb?.url || null
    }
    return u ? { url: u } : null
  } catch { return null }
}

// 搜索+解析一步到位：QQ 官方失败时的完整兜底链
async function resolveViaKuwoSearch(title, artist, q, ip) {
  const kuwoId = await searchKuwoId(title, artist)
  if (!kuwoId) return null
  log(`[${ip || '-'}] [KuwoFallback] 命中酷我: ${kuwoId}`)
  return resolveKuwoById(kuwoId, q, ip)
}

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
  const ip = getClientIp(req)
  log(`[${ip}] [SongURL]`, { platform, id, source, quality, mid, mediaMid, title: req.query.title })
  if (!platform || !id) {
    return res.json({ code: 400, message: 'platform and id required' })
  }

  // 非探测请求直接查缓存
  const cacheKey = `${platform}:${id}:${quality || 'standard'}`
  if (detect !== '1') {
    const cached = getCachedUrl(cacheKey)
    if (cached) {
      log(`[${ip}] [SongURL] cache hit`, cacheKey)
      return res.json({ code: 200, data: { url: cached } })
    }
  }

  try {
    let url = null
    // quality: standard/high/lossless；高音质/无损获取失败时回退标准音质
    const q = ['standard', 'high', 'lossless'].includes(quality) ? quality : 'standard'
    // detect=1 时探测该歌曲实际可用的音质档位，供前端动态显示音质菜单
    let availableQualities = null
    // 音质探测缓存的键：可用音质只与"哪首歌"有关，与请求的音质档位无关
    const qualityKey = `${platform}:${id}`

    // 探测请求的快速通道：播放地址与可用音质双双命中缓存时，
    // 不再重新解析地址（探测的本意只是拿音质菜单），零上游请求完成响应
    if (detect === '1') {
      const cachedUrlForDetect = getCachedUrl(cacheKey)
      if (cachedUrlForDetect) {
        return res.json({
          code: 200,
          data: { url: cachedUrlForDetect, availableQualities: getCachedQualities(qualityKey) || ['standard'] }
        })
      }
    }

    // 第三方搜索的歌曲：直接使用第三方 API
    if (source === 'thirdparty') {
      // QQ音乐第三方播放 API 已失效，直接用酷我搜索+播放
      if (platform === 'QQ音乐') {
        const title = req.query.title
        const artist = req.query.artist || ''
        if (title) {
          const kuwoId = await searchKuwoId(title, artist)
          if (kuwoId) {
            // 探测结果走缓存：同一首歌30分钟内不重复打上游（P1）
            if (detect === '1') {
              availableQualities = await probeQualitiesByApis(kuwoThirdPartyApis, kuwoId, qualityKey, ip)
            }
            const r = await resolveKuwoById(kuwoId, q, ip)
            url = r?.url || null
          }
        }
        if (!url && detect === '1' && !availableQualities) availableQualities = ['standard']
      } else {
        const thirdPartyApis = platform === '酷我音乐' ? kuwoThirdPartyApis : neteaseThirdPartyApis
        if (detect === '1') {
          availableQualities = await probeQualitiesByApis(thirdPartyApis, id, qualityKey, ip)
        }
        const result = await fetchWithFallback(thirdPartyApis, id, q, ip)
        url = result?.url || null
        if (!url && q !== 'standard') {
          const fallback = await fetchWithFallback(thirdPartyApis, id, 'standard', ip)
          url = fallback?.url || null
        }
      }
    } else {
      // 官方搜索的歌曲：使用官方 API
      switch (platform) {
        case '网易云音乐':
          // 探测结果走独立缓存（P1）：30分钟内重复探测直接复用
          if (detect === '1') {
            availableQualities = await detectQualitiesCached(() => netease.detectQualities(id), qualityKey)
          }
          url = await netease.getSongUrl(id, q)
          if (!url && q !== 'standard') url = await netease.getSongUrl(id, 'standard')
          break
        case 'QQ音乐': {
          // 音质探测走独立缓存（P1）：官方探测器优先，失败降级为标准音质
          if (detect === '1') {
            availableQualities = await detectQualitiesCached(
              () => qqmusic.detectQualities(mid || id, mediaMid), qualityKey)
          }
          // P0 双路并行竞速：官方直连与"酷我搜索→第三方"兜底链同时出发，
          // 先拿到有效地址者胜出（旧实现为三层串行瀑布，实测最坏 2 秒以上）
          const officialFn = async () => {
            let u = await qqmusic.getSongUrl(mid || id, mediaMid, q)
            if (!u && q !== 'standard') u = await qqmusic.getSongUrl(mid || id, mediaMid, 'standard')
            return u ? { url: u } : null
          }
          const fallbackFn = () => {
            const title = req.query.title || ''
            const artist = req.query.artist || ''
            if (!title) return Promise.resolve(null)
            return resolveViaKuwoSearch(title, artist, q, ip)
          }
          const raced = await raceDualPath(officialFn, fallbackFn, 600, ip)
          url = raced?.url || null
          break
        }
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
          {
            const miguContentId = contentId || (id.startsWith('migu_') ? id.replace('migu_', '') : id)
            const miguCopyrightId = copyrightId || miguContentId
            if (detect === '1') {
              // 探测结果走独立缓存（P1），咪咕按内容ID维度区分
              availableQualities = await detectQualitiesCached(
                () => migu.detectQualities(miguContentId, miguCopyrightId),
                `${qualityKey}:${miguContentId}`)
            }
            url = await migu.getSongUrl(miguContentId, miguCopyrightId, q)
            if (!url && q !== 'standard') url = await migu.getSongUrl(miguContentId, miguCopyrightId, 'standard')
          }
          break
        case '酷我音乐':
          // 酷我音乐官方播放 API 需要加密，暂时使用第三方 API
          const kuwoResult = await fetchWithFallback(kuwoThirdPartyApis, id, q, ip)
          url = kuwoResult?.url || null
          if (!url && q !== 'standard') {
            const fallback = await fetchWithFallback(kuwoThirdPartyApis, id, 'standard', ip)
            url = fallback?.url || null
          }
          break
        case '酷狗音乐': {
          // 酷狗官方播放接口无需签名：免费歌曲返回直链，付费歌曲 url 为空。
          // P0 双路并行竞速：官方与第三方同时出发先到先得，取代旧的串行逐档回退；
          // 第三方的两个音质档位也并行尝试，不再串行等待
          const officialFn = async () => {
            const u = await kugou.getSongUrl(id)
            return u ? { url: u } : null
          }
          const fallbackFn = async () => {
            const results = await Promise.all(
              [...new Set([q, 'standard'])].map(qq => fetchWithFallback(kugouThirdPartyApis, id, qq, ip))
            )
            return results.find(r => r?.url) || null
          }
          const raced = await raceDualPath(officialFn, fallbackFn, 600, ip)
          url = raced?.url || null
          break
        }
      }
    }
    // 跨域直链（http/https 域名）统一走 /api/proxy/audio 同源转发：
    // 音频接入 AudioContext 频谱分析后，浏览器对无 CORS 头的跨域媒体会静音，
    // 代理保证同源可播放且频谱有数据（已走代理的相对路径 /api/... 不再处理）
    if (url && !url.startsWith('/')) {
      url = `/api/proxy/audio?url=${encodeURIComponent(url)}`
    }
    // 探测请求解析出的地址同样写入缓存：前端开播后立刻会发一次后台探测，
    // 这次结果若不落缓存，用户短期内重播同一首还得再解析一遍
    if (url) setCachedUrl(cacheKey, url)
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
