import { Router } from 'express'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as qishui from '../services/qishui.js'
import * as migu from '../services/migu.js'
import * as kuwo from '../services/kuwo.js'
import * as kugou from '../services/kugou.js'

const router = Router()

const services = {
  '网易云音乐': netease,
  'QQ音乐': qqmusic,
  'B站': bilibili,
  '抖音': douyin,
  '汽水音乐': qishui,
  '咪咕音乐': migu,
  '酷我音乐': kuwo,
  '酷狗音乐': kugou
}

// 内存缓存：榜单 1 天内不重复请求，每天凌晨 2:00 定时刷新一次。
// 规则：抓取成功且数据可用才覆盖缓存；失败保留旧数据（过期也兜底返回），下一轮重试。
// 进程重启会清空内存缓存，此时由 TTL 懒加载兜底——首个请求实时抓取。
const cache = new Map()
const CACHE_TTL = 24 * 60 * 60 * 1000

// 同一 key 的并发请求共用一次抓取（singleflight），防止缓存过期瞬间被并发打爆
const inflight = new Map()

function getCached(key) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data
  return null
}

// 取旧数据（可能已过期）：抓取失败时兜底返回，避免用户拿到 null
function peekCache(key) {
  const entry = cache.get(key)
  return entry ? entry.data : null
}

// 缓存容量上限：防御性措施——缓存键由用户可控的 platform/sublist 拼出，
const CACHE_MAX_ENTRIES = 2000

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() })
  // 超限后按 Map 插入顺序淘汰最旧的一条（与 song.js 的 urlCache 同款策略）
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
}

// 抓取结果可用性校验：空数组、或子榜单一首歌都没抓到，都视为失败，
// 不写缓存（否则失败数据会被带一整天）
function isUsable(result, hasSublist) {
  if (!Array.isArray(result) || result.length === 0) return false
  if (!hasSublist) return true
  return result.some(l => Array.isArray(l?.songs) && l.songs.length > 0)
}

async function fetchToplist(platform, order, sublist) {
  try {
    return await services[platform].getToplist(order, sublist)
  } catch (e) {
    console.error(`[Charts] ${platform} toplist error:`, e.message)
    return null
  }
}

function cacheKeyOf(platform, order, sublist) {
  const base = platform === 'QQ音乐' ? `${platform}:${order}` : platform
  return sublist != null ? `${base}:s${sublist}` : base
}

// 读取榜单：缓存新鲜直接返回；过期则抓取（singleflight 合流），失败不覆盖旧数据
async function getToplistCached(platform, order, sublist, { force = false } = {}) {
  const key = cacheKeyOf(platform, order, sublist)
  if (!force) {
    const cached = getCached(key)
    if (cached) return cached
  }
  const pending = inflight.get(key)
  if (pending) return pending
  const task = (async () => {
    try {
      const result = await fetchToplist(platform, order, sublist)
      if (isUsable(result, sublist != null)) {
        setCache(key, result)
        return result
      }
      return peekCache(key) // 抓取失败：返回过期旧数据兜底，缓存 time 不刷新 → 下次请求/次日定时还会重试
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, task)
  return task
}

router.get('/', async (req, res) => {
  const platform = req.query.platform
  if (!platform || !services[platform]) {
    return res.json({ code: 400, message: 'Invalid platform', platforms: Object.keys(services) })
  }
  const order = Number(req.query.order) || 1
  const sublist = req.query.sublist != null ? Number(req.query.sublist) : null

  try {
    const data = await getToplistCached(platform, order, sublist)
    if (data) res.json({ code: 200, data })
    else res.json({ code: 200, data: null, message: `${platform} toplist fetch failed` })
  } catch (e) {
    res.json({ code: 200, data: null, message: e.message })
  }
})

// ===== 每天 2:00（服务器本地时间）定时刷新榜单 =====
// 只刷新缓存里已存在的 key，不引入新 key；key 间隔 600ms，降低同 IP 连打风控风险。
const REFRESH_HOUR = 2
const sleep = ms => new Promise(r => setTimeout(r, ms))
let lastRefreshDay = ''

function parseCacheKey(key) {
  const parts = String(key).split(':')
  let sublist = null
  if (parts.length > 1 && /^s\d+$/.test(parts[parts.length - 1])) {
    sublist = Number(parts.pop().slice(1))
  }
  const platform = parts[0]
  const order = platform === 'QQ音乐' && parts.length > 1 ? (Number(parts[1]) || 1) : 1
  if (!services[platform]) return null
  return { platform, order, sublist }
}

async function refreshCachedCharts() {
  const keys = [...cache.keys()]
  console.log(`[Charts] 定时刷新开始，共 ${keys.length} 个榜单`)
  let ok = 0
  for (const key of keys) {
    const parsed = parseCacheKey(key)
    if (!parsed) continue
    try {
      const data = await getToplistCached(parsed.platform, parsed.order, parsed.sublist, { force: true })
      if (data) ok++
    } catch (e) {
      console.error(`[Charts] 刷新 ${key} 失败:`, e.message)
    }
    await sleep(600)
  }
  console.log(`[Charts] 定时刷新结束，成功 ${ok}/${keys.length}`)
}

setInterval(() => {
  const now = new Date()
  if (now.getHours() !== REFRESH_HOUR || now.getMinutes() !== 0) return
  if (lastRefreshDay === now.toDateString()) return // 防止分钟内 tick 触发两次
  lastRefreshDay = now.toDateString()
  refreshCachedCharts().catch(e => console.error('[Charts] 定时刷新异常:', e))
}, 30 * 1000)

// 加载更多：支持 HOYO-MiX 等分页榜单
router.get('/more', async (req, res) => {
  const { platform, name, page, order } = req.query
  if (!platform || !name || platform !== 'QQ音乐') {
    return res.json({ code: 400, message: 'Unsupported platform' })
  }
  try {
    if (name === 'HOYO-MiX') {
      const result = await qqmusic.getArtistSongs('001uz8tl04tdL8', 'HOYO-MiX', Number(page) || 2, Number(order) || 1)
      return res.json({ code: 200, data: { songs: result?.songs || [], hasMore: result?.hasMore || false } })
    }
    res.json({ code: 200, data: { songs: [], hasMore: false } })
  } catch (e) {
    res.json({ code: 200, data: { songs: [], hasMore: false } })
  }
})

export default router
