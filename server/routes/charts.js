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

// 内存缓存：排行榜数据1小时内不重复请求。
// 榜单本身各平台一天才更新一次，1小时的"陈旧"用户无感知，
// 可大幅减少首页并发拉榜对上游的压力（原为5分钟）
const cache = new Map()
const CACHE_TTL = 3_600_000

function getCached(key) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data
  return null
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

router.get('/', async (req, res) => {
  const platform = req.query.platform
  if (!platform || !services[platform]) {
    return res.json({ code: 400, message: 'Invalid platform', platforms: Object.keys(services) })
  }
  const page = Number(req.query.page) || 1
  const order = Number(req.query.order) || 1
  const sublist = req.query.sublist != null ? Number(req.query.sublist) : null

  // 缓存 key：元数据请求和歌曲请求分开缓存
  const cacheKey = platform === 'QQ音乐' ? `${platform}:${order}` : platform
  const sublistKey = sublist != null ? `${cacheKey}:s${sublist}` : null

  // 有 sublist 时查子榜单缓存
  if (sublistKey) {
    const cached = getCached(sublistKey)
    if (cached) return res.json({ code: 200, data: cached })
  }

  // 无 sublist 时查元数据缓存
  if (sublist == null) {
    const cached = getCached(cacheKey)
    if (cached) return res.json({ code: 200, data: cached })
  }

  try {
    const result = await services[platform].getToplist(order, sublist)
    if (result) {
      // 缓存结果
      if (sublist != null && sublistKey) setCache(sublistKey, result)
      else if (sublist == null) setCache(cacheKey, result)
      res.json({ code: 200, data: result })
    } else {
      res.json({ code: 200, data: null, message: `${platform} toplist fetch failed` })
    }
  } catch (e) {
    res.json({ code: 200, data: null, message: e.message })
  }
})

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
