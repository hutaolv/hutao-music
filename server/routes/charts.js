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

// 内存缓存：排行榜数据5分钟内不重复请求
const cache = new Map()
const CACHE_TTL = 300_000

function getCached(key) {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data
  return null
}
function setCache(key, data) { cache.set(key, { data, time: Date.now() }) }

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
