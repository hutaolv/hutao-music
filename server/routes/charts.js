import { Router } from 'express'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as qishui from '../services/qishui.js'
import * as migu from '../services/migu.js'
import * as kuwo from '../services/kuwo.js'

const router = Router()

const services = {
  '网易云音乐': netease,
  'QQ音乐': qqmusic,
  'B站': bilibili,
  '抖音': douyin,
  '汽水音乐': qishui,
  '咪咕音乐': migu,
  '酷我音乐': kuwo
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

  const cached = getCached(platform)
  if (cached) return res.json({ code: 200, data: cached })

  try {
    const result = await services[platform].getToplist()
    if (result) {
      setCache(platform, result)
      res.json({ code: 200, data: result })
    } else {
      res.json({ code: 200, data: null, message: `${platform} toplist fetch failed, using fallback` })
    }
  } catch (e) {
    res.json({ code: 200, data: null, message: e.message })
  }
})

export default router
