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
import { log, warn } from '../logger.js'
// 归属地精简行：仅当该 IP 已有 24 小时内的解析缓存时才输出，
// 同步读内存、无网络请求，失败时静默（不影响下面的业务日志）
import { logGeoBrief } from '../ip-location.js'

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

// 带签名的中转地址（如 90svip 的 api.php?get=url&...&sign=xxx&t=1795401852）有效期
// 远短于普通直链：t 是签发时刻（实测与请求时刻只差几秒），真实有效期上游未公开。
// 这类地址若按 10 分钟缓存，过期后同一请求会反复返回死链 —— 表现就是"重试也播不了"。
// 这里按保守的 3 分钟缓存：宁可多解析一次，也不返回可能已失效的地址。
const SIGNED_URL_TTL = 3 * 60 * 1000
function hasShortLivedSign(url) {
  if (!url) return false
  // 注意：这里的入参可能是已经过 /api/proxy/audio?url=encodeURIComponent(...) 包装的地址，
  // 包装后原始查询串里的 ? & = 都变成了 %3F %26 %3D，直接拿正则去匹配 ?
  // 永远不会命中 —— 这个判定曾因此实际失效，签名地址仍按 10 分钟缓存。
  // 先解码一次再判断（不是代理包装的地址解码后不变，无副作用）。
  let raw = url
  if (raw.includes('%26') || raw.includes('%3F')) {
    try { raw = decodeURIComponent(raw) } catch { /* 非法转义保持原样 */ }
  }
  return /[?&]sign=/i.test(raw) && /[?&]t=\d{9,13}/i.test(raw)
}
function getCachedUrl(key) {
  const entry = urlCache.get(key)
  if (entry && Date.now() - entry.ts < entry.ttl) return entry.url
  urlCache.delete(key)
  return null
}
function setCachedUrl(key, url) {
  if (!url) return
  const ttl = hasShortLivedSign(url) ? SIGNED_URL_TTL : URL_CACHE_TTL
  urlCache.set(key, { url, ts: Date.now(), ttl })
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

// ---------- 多路并行取首个有效地址 ----------
// 用途：一条兜底链里有多个互相独立、都可能成功的解析路径（如第三方源组 + 换平台搜索）。
// 与 Promise.all 的关键区别是"谁先拿到地址就用谁"，不必等最慢的那一路超时。
// 曾踩过的坑：把换源搜索串在 Promise.all 之后，要等 8 个第三方源全部超时（5 秒）
// 才轮到它，此时请求早已把空结果返回给前端，兜底形同虚设。
// 参数：promises - 若干返回 { url } 或 null 的 Promise
function firstUrl(promises) {
  return new Promise(resolve => {
    let pending = promises.length
    if (!pending) return resolve(null)
    promises.forEach(p => p.then(r => {
      if (r?.url) return resolve(r)
      if (--pending === 0) resolve(null)
    }).catch(() => {
      if (--pending === 0) resolve(null)
    }))
  })
}

// ---------- 酷我兜底链（从原三处内联代码提取复用）----------

// 酷我关键词搜索：返回首个命中的酷我歌曲ID，失败返回 null
// 带 ip 仅用于失败日志：这条链是 QQ/咪咕/酷狗三个平台的共同兜底，
// 一旦酷我搜索被限流，三个平台的兜底会同时失效，必须有日志才能第一时间发现
async function searchKuwoId(title, artist, ip) {
  const keyword = artist ? `${title} ${artist.split('/')[0]}` : title
  const params = { client: 'kt', all: keyword, pn: 0, rn: 1, uid: '794762570', ver: 'kwplayer_ar_9.2.2.1', vipver: '1', show_copyright_off: '1', newver: '1', ft: 'music', cluster: '0', strategy: '2012', encoding: 'utf8', rformat: 'json', vermerge: '1', mobi: '1', issubtitle: '1' }
  // 两个协议通道轮流试：实测该接口会偶发 403（短时间连续搜索触发临时限流），
  // 换协议重试一次通常就能恢复。两个通道都失败才认定兜底链不可用
  let lastErr = null
  for (const base of ['http://search.kuwo.cn/r.s', 'https://search.kuwo.cn/r.s']) {
    try {
      const { data } = await axios.get(base, {
        params, headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000
      })
      const hit = data?.abslist?.[0]
      if (!hit) {
        // 通道正常但没有该首歌：换通道结果也一样，直接结束
        log(`[${ip || '-'}] [KuwoFallback] 酷我搜索无结果: ${keyword}`)
        return null
      }
      return String(hit.MUSICRID || '').replace('MUSIC_', '')
    } catch (e) {
      lastErr = e
    }
  }
  log(`[${ip || '-'}] [KuwoFallback] 酷我搜索失败: ${lastErr?.message || 'unknown'} | ${title}`)
  return null
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
  const kuwoId = await searchKuwoId(title, artist, ip)
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
  const { platform, id, bvid, cid, mid, mediaMid, musicId, contentId, copyrightId, quality, detect, source, refresh } = req.query
  const ip = getClientIp(req)
  log(`[${ip}] [SongURL]`, { platform, id, source, quality, mid, mediaMid, title: req.query.title })
  // 紧跟在入口业务行之后补一行归属地。
  // 每个请求只在入口处调用一次：缓存命中分支与异常分支本身还会再写一行业务日志，
  // 若各自都补一遍，同一个请求会输出多行重复的归属地
  logGeoBrief(ip)
  if (!platform || !id) {
    return res.json({ code: 400, message: 'platform and id required' })
  }

  // 非探测请求直接查缓存。refresh=1 表示前端播放失败后的重试，
  // 此时必须跳过缓存重新解析：缓存里很可能就是那条已经失效的签名地址，
  // 拿它重试等于必然再失败一次（旧实现"重试也播不了"就是这个原因）
  // 部分平台的 id 会带平台前缀：搜索结果、排行榜、历史记录里都是 kuwo_888898 这种形状，
  // 而取地址用的第三方源只认纯数字。不剥离的话每个源都返回空，前端只能拿到 url:null ——
  // 表现为点了歌一直转圈、不出声（酷狗早期踩过同一个坑，已在其分支单独处理）。
  // 归一化同时用于缓存键：否则同一首歌按 kuwo_888898 / 888898 各存一份地址，白占缓存
  const songId = platform === '酷我音乐' ? String(id).replace(/^kuwo_/, '') : id
  const cacheKey = `${platform}:${songId}:${quality || 'standard'}`
  if (detect !== '1' && refresh !== '1') {
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
    // 不再重新解析地址（探测的本意只是拿音质菜单），零上游请求完成响应。
    // refresh=1 时同样跳过，避免把失效地址当探测结果回给前端
    if (detect === '1' && refresh !== '1') {
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
          const kuwoId = await searchKuwoId(title, artist, ip)
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
          availableQualities = await probeQualitiesByApis(thirdPartyApis, songId, qualityKey, ip)
        }
        const result = await fetchWithFallback(thirdPartyApis, songId, q, ip)
        url = result?.url || null
        if (!url && q !== 'standard') {
          const fallback = await fetchWithFallback(thirdPartyApis, songId, 'standard', ip)
          url = fallback?.url || null
        }
        // 第三方源本身也可能挂（实测部分源已整体失效，返回空 url）：
        // 拿不到地址时再用歌名+歌手搜一次酷我换源，避免第三方歌直接变成"无法获取"
        if (!url && req.query.title) {
          const r = await resolveViaKuwoSearch(req.query.title, req.query.artist || '', q, ip)
          url = r?.url || null
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
        case '咪咕音乐': {
          const miguContentId = contentId || (id.startsWith('migu_') ? id.replace('migu_', '') : id)
          const miguCopyrightId = copyrightId || miguContentId
          if (detect === '1') {
            // 探测结果走独立缓存（P1），咪咕按内容ID维度区分
            availableQualities = await detectQualitiesCached(
              () => migu.detectQualities(miguContentId, miguCopyrightId),
              `${qualityKey}:${miguContentId}`)
          }
          // P0 双路并行竞速：咪咕官方对 VIP 歌只返回 dialogInfo 不给地址（auditionsLength 仅试听），
          // 而原先这里只有官方一条路，拿不到就是 null → 前端提示"无法获取"并 2 秒跳歌。
          // 现在官方与"酷我搜索→第三方解析"兜底同时出发：抓不到地址立即放行第三方，
          // 官方仍在路上时给 800ms 反超窗口（实测咪咕官方免费歌约 370ms 返回，窗口足够）。
          const officialFn = async () => {
            // officialOnly=true：官方拿不到就立刻返回 null，不在 migu.getSongUrl 内部再串第三方。
            // 这里的第三方兜底已由下方 fallbackFn 并行承担，函数内再串一次只会白等 3 秒
            let u = await migu.getSongUrl(miguContentId, miguCopyrightId, q, true)
            if (!u && q !== 'standard') u = await migu.getSongUrl(miguContentId, miguCopyrightId, 'standard', true)
            return u ? { url: u } : null
          }
          const fallbackFn = () => {
            const title = req.query.title || ''
            const artist = req.query.artist || ''
            if (!title) return Promise.resolve(null)
            return resolveViaKuwoSearch(title, artist, q, ip)
          }
          const raced = await raceDualPath(officialFn, fallbackFn, 800, ip)
          url = raced?.url || null
          break
        }
        case '酷我音乐':
          // 酷我音乐官方播放 API 需要加密，暂时使用第三方 API
          // 用 songId（已剥 kuwo_ 前缀），第三方源只认纯数字
          const kuwoResult = await fetchWithFallback(kuwoThirdPartyApis, songId, q, ip)
          url = kuwoResult?.url || null
          if (!url && q !== 'standard') {
            const fallback = await fetchWithFallback(kuwoThirdPartyApis, songId, 'standard', ip)
            url = fallback?.url || null
          }
          break
        case '酷狗音乐': {
          // 酷狗官方播放接口无需签名：免费歌曲返回直链，付费歌曲 url 为空。
          // P0 双路并行竞速：官方与第三方同时出发先到先得，取代旧的串行逐档回退；
          // 第三方的两个音质档位也并行尝试，不再串行等待
          // id 可能带 migu 那种风格的前缀（kugou_xxx，来自列表数据/历史记录），
          // 而官方接口与第三方源都只认 32 位纯 hash。带着前缀去请求，官方必然返 null、
          // 第三方拼出的 URL 也是错的 —— 表现就是"免费歌也要等兜底 2~3 秒"。
          // 前端正常播放走 platformId（纯 hash）不会踩到，但历史记录/分享链接会。
          const kugouHash = String(id).replace(/^kugou_/, '')
          const officialFn = async () => {
            const u = await kugou.getSongUrl(kugouHash)
            return u ? { url: u } : null
          }
          const fallbackFn = async () => {
            const title = req.query.title || ''
            const artist = req.query.artist || ''
            let settledUrl = null
            // 第一路：现有第三方源组（两个音质档位并行）
            const thirdPartyTask = async () => {
              const results = await Promise.all(
                [...new Set([q, 'standard'])].map(qq => fetchWithFallback(kugouThirdPartyApis, kugouHash, qq, ip))
              )
              const hit = results.find(r => r?.url) || null
              if (hit) settledUrl = hit
              return hit
            }
            // 第二路：按歌名换搜酷我。延迟 800ms 启动 —— 第三方正常时（实测 400~600ms 出结果）
            // 就不必白打一次酷我搜索；第三方全挂时它已经跑起来了，不会像串行那样等到超时之后
            const kuwoTask = async () => {
              await new Promise(r => setTimeout(r, 800))
              if (settledUrl || !title) return null
              log(`[${ip || '-'}] [KuwoFallback] 酷狗第三方未出结果，改按歌名搜酷我: ${title}`)
              return resolveViaKuwoSearch(title, artist, q, ip)
            }
            return firstUrl([thirdPartyTask(), kuwoTask()])
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
      // 附带稳定标识 key：同一首歌每次解析出的都是带新签名的地址，代理层若按 URL 做缓存键
      // 则永远命中不了（等于没缓存）。这里用 platform:id:quality，同一首歌不同次解析共享一份缓存，
      // 才能实现"播过的歌 seek/重播直接走本地、不再依赖已失效的直链"
      const cacheTag = String(cacheKey).replace(/[^\w\u4e00-\u9fa5:.\-]/g, '_').slice(0, 160)
      url = `/api/proxy/audio?url=${encodeURIComponent(url)}&key=${encodeURIComponent(cacheTag)}`
    }
    // 探测请求解析出的地址同样写入缓存：前端开播后立刻会发一次后台探测，
    // 这次结果若不落缓存，用户短期内重播同一首还得再解析一遍
    if (url) setCachedUrl(cacheKey, url)
    res.json({ code: 200, data: { url, availableQualities } })
  } catch (e) {
    warn(`[${ip}] [SongURL] ${platform} ${id} error: ${e.message}`)
    res.json({ code: 200, data: { url: null, availableQualities: null } })
  }
})

// 按平台取歌词（/lyrics 与 /match-lyrics 共用），返回 { lyrics, transLyrics } 或 null
async function fetchLyricsByPlatform(platform, opts = {}) {
  const { id, mid, lyricUrl, contentId, timelength } = opts
  switch (platform) {
    case '网易云音乐':
      return netease.getLyrics(id)
    case 'QQ音乐':
      return qqmusic.getLyrics(mid || id)
    case 'B站':
      return bilibili.getLyrics(id, lyricUrl)
    case '抖音':
    case '汽水音乐': {
      if (!lyricUrl) return null
      const { data } = await axios.get(lyricUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 })
      if (!Array.isArray(data)) return null
      const lrc = data.map(line => {
        const t = parseFloat(line.timeId)
        const m = Math.floor(t / 60)
        const s = Math.floor(t % 60)
        const ms = Math.round((t - Math.floor(t)) * 100)
        return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${line.text}`
      }).join('\n')
      return { lyrics: lrc, transLyrics: '' }
    }
    case '咪咕音乐':
      return migu.getLyrics(contentId || id)
    case '酷我音乐':
      // 酷我歌词：解析 m.kuwo.cn 播放详情页 __NUXT__ 内嵌歌词
      return kuwo.getLyrics(id)
    case '酷狗音乐':
      // 酷狗官方歌词接口需要歌曲时长（毫秒）
      return kugou.getLyrics(id, timelength)
    default:
      return null
  }
}

router.get('/lyrics', async (req, res) => {
  const { platform, id, mid, lyricUrl, contentId } = req.query
  if (!platform || !id) return res.json({ code: 400, message: 'platform and id required' })

  try {
    const lyrics = await fetchLyricsByPlatform(platform, { id, mid, lyricUrl, contentId, timelength: req.query.timelength })
    if (!lyrics) warn(`[Lyrics] ${platform} ${id} empty`)
    res.json({
      code: 200,
      data: lyrics
        ? { lyrics: sanitizeLyricsText(lyrics.lyrics), transLyrics: sanitizeLyricsText(lyrics.transLyrics) }
        : { lyrics: '', transLyrics: '' }
    })
  } catch (e) {
    warn(`[Lyrics] ${platform} ${id} error: ${e.message}`)
    res.json({ code: 200, data: { lyrics: '', transLyrics: '' } })
  }
})

// ===== 本地导入歌模糊匹配歌词 =====
// 跨平台搜索候选 → 打分（标题55% + 歌手25% + 时长20%，版本词降权）→ 取分最高且能取到词的候选
const MATCH_TTL_MS = 30 * 60 * 1000
const MATCH_CACHE_MAX = 300
const MATCH_MIN_SCORE = 0.55
const MATCH_MAX_TRIES = 3
const matchCache = new Map() // cacheKey -> { data, exp }

const normText = s => String(s || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
const VERSION_WORDS = /(live|cover|remix|remaster|instrumental|demo|acoustic|现场|翻唱|伴奏|纯音乐)/i

// 去掉版本词后的标题：主标题相似度用它算，避免 "xx (Live)" 与原版互相拉低分数
function stripVersionWords(t) {
  return normText(String(t || '')
    .replace(/[（(\[【][^)）\]】]{0,20}[)）\]】]/g, ' ')
    .replace(VERSION_WORDS, ' '))
}

// 二元组 Dice 相似度：对中英文标题都够用，且无需依赖库
function diceSim(a, b) {
  a = normText(a)
  b = normText(b)
  if (!a || !b) return 0
  if (a === b) return 1
  const grams = s => {
    if (s.length < 2) return [s]
    const arr = []
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2))
    return arr
  }
  const ba = grams(a)
  const bb = grams(b)
  const pool = new Map()
  for (const g of ba) pool.set(g, (pool.get(g) || 0) + 1)
  let hit = 0
  for (const g of bb) {
    const c = pool.get(g) || 0
    if (c > 0) { hit++; pool.set(g, c - 1) }
  }
  return (2 * hit) / (ba.length + bb.length)
}

function scoreCandidate(cand, q) {
  const baseTitle = diceSim(stripVersionWords(cand.title), stripVersionWords(q.title))
  const cHasVer = VERSION_WORDS.test(String(cand.title || ''))
  const qHasVer = VERSION_WORDS.test(String(q.title || ''))
  // 版本不一致（一方 Live/伴奏/翻唱等）是强降权信号，但不直接否决
  const titleScore = baseTitle * (cHasVer !== qHasVer ? 0.55 : 1)
  const artistKnown = q.artist && !/^(未知|unknown)$/i.test(q.artist.trim())
  const artistScore = artistKnown ? diceSim(cand.artist, q.artist) : 0.7
  let durScore = 0.7 // 双方任一缺时长时保持中性
  const cd = Number(cand.durationMs) || 0
  const qd = Number(q.durationMs) || 0
  if (cd > 0 && qd > 0) {
    const diff = Math.abs(cd - qd) / 1000
    durScore = diff <= 2 ? 1 : diff <= 5 ? 0.9 : diff <= 10 ? 0.6 : 0.2 // 时长差是最强的反串台信号
  }
  return titleScore * 0.55 + artistScore * 0.25 + durScore * 0.2
}

// 候选来源：音频平台 5 家（B站/抖音是视频源，标题噪声大，不参与匹配）
const MATCH_SEARCHES = [
  { platform: '网易云音乐', run: kw => netease.searchSongs(kw, 10) },
  { platform: 'QQ音乐', run: kw => qqmusic.searchSongs(kw, 10) },
  { platform: '咪咕音乐', run: kw => migu.searchSongs(kw, 10) },
  { platform: '酷我音乐', run: kw => kuwo.searchSongs(kw, 10) },
  { platform: '酷狗音乐', run: kw => kugou.searchSongs(kw, 10, 1) }
]

router.get('/match-lyrics', async (req, res) => {
  const title = String(req.query.title || '').trim()
  const artist = String(req.query.artist || '').trim()
  const durationMs = Number(req.query.durationMs) || 0
  if (!title || title.length > 80) return res.json({ code: 400, message: 'title required' })

  const mode = req.query.mode === 'candidates' ? 'candidates' : ''
  // 纠错用：排除已试过的来源（"换一批"），格式 平台|id,平台|id
  const excluded = new Set(
    String(req.query.exclude || '').split(',').map(s => s.trim()).filter(Boolean)
  )
  const fresh = req.query.fresh === '1'
  // candidates/exclude 是手动纠错路径：结果形状不同/要求实时性 → 绕过缓存读写；
  // fresh 只跳过读（负缓存手动重试），新结果仍回写
  const useCache = !mode && !excluded.size

  // 缓存按 标题+歌手+时长桶（5s 一桶，容忍导入测时长的小误差）
  const cacheKey = `${normText(title)}|${normText(artist)}|${durationMs > 0 ? Math.round(durationMs / 5000) : 0}`
  if (useCache && !fresh) {
    const cached = matchCache.get(cacheKey)
    if (cached && cached.exp > Date.now()) return res.json({ code: 200, data: cached.data })
  }
  const respond = data => {
    if (useCache) {
      matchCache.set(cacheKey, { data, exp: Date.now() + MATCH_TTL_MS })
      if (matchCache.size > MATCH_CACHE_MAX) matchCache.delete(matchCache.keys().next().value)
    }
    res.json({ code: 200, data })
  }

  try {
    const q = { title, artist, durationMs }
    // 全平台并行搜索，单平台 7s 兜底超时，慢平台不拖垮整体
    const settled = await Promise.allSettled(MATCH_SEARCHES.map(s => Promise.race([
      s.run(title),
      new Promise((_, reject) => setTimeout(() => reject(new Error('search timeout')), 7000))
    ])))
    const candidates = []
    const seen = new Set()
    settled.forEach((r, i) => {
      if (r.status !== 'fulfilled' || !Array.isArray(r.value)) return
      const platform = MATCH_SEARCHES[i].platform
      r.value.slice(0, 5).forEach(c => {
        const cid = String(c.platformId || c.id || '')
        if (!cid) return
        const key = `${platform}|${cid}`
        if (seen.has(key)) return
        seen.add(key)
        candidates.push({ c, platform, cid, score: scoreCandidate(c, q) })
      })
    })
    candidates.sort((a, b) => b.score - a.score)
    // "换一批"：滤掉已试过的来源
    const filtered = candidates.filter(it => !excluded.has(`${it.platform}|${it.cid}`))

    if (mode === 'candidates') {
      // 手动纠错（P2）：只回 top5 候选元数据，不设分数门槛、不取词，
      // 挑选与取词由前端完成（取词复用现成 /song/lyrics 接口）
      return res.json({
        code: 200,
        data: {
          candidates: filtered.slice(0, 5).map(it => ({
            key: `${it.platform}|${it.cid}`,
            platform: it.platform,
            id: it.cid,
            mid: it.c.platformSongMid || '',
            contentId: it.c.contentId || '',
            title: it.c.title || '',
            artist: it.c.artist || '',
            durationMs: Number(it.c.durationMs) || 0,
            score: Number(it.score.toFixed(2))
          }))
        }
      })
    }

    for (const item of filtered.slice(0, MATCH_MAX_TRIES)) {
      if (item.score < MATCH_MIN_SCORE) break
      try {
        // 单平台取词 8s 兜底超时：netease/qq 的 getLyrics 自身无超时，
        // 上游悬挂会把整个匹配请求拖死（Promise.allSettled 的搜索超时护不住这里）
        const lyrics = await Promise.race([
          fetchLyricsByPlatform(item.platform, {
            id: item.cid,
            mid: item.c.platformSongMid,
            contentId: item.c.contentId,
            lyricUrl: item.c.lyricUrl,
            timelength: item.c.durationMs || durationMs
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('lyrics timeout')), 8000))
        ])
        if (lyrics && lyrics.lyrics) {
          warn(`[MatchLyrics] "${title}" -> ${item.platform} ${item.cid} score=${item.score.toFixed(2)}`)
          return respond({
            matched: true,
            confidence: Number(item.score.toFixed(2)),
            matchSource: {
              platform: item.platform,
              id: item.cid,
              title: item.c.title || '',
              artist: item.c.artist || '',
              durationMs: Number(item.c.durationMs) || 0
            },
            lyrics: sanitizeLyricsText(lyrics.lyrics),
            transLyrics: sanitizeLyricsText(lyrics.transLyrics)
          })
        }
      } catch {
        // 单平台取词失败，继续尝试下一个候选
      }
    }
    warn(`[MatchLyrics] "${title}" no match (${candidates.length} candidates)`)
    return respond({ matched: false })
  } catch (e) {
    warn(`[MatchLyrics] "${title}" error: ${e.message}`)
    return res.json({ code: 200, data: { matched: false } })
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
