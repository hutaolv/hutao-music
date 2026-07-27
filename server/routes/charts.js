import { Router } from 'express'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'
import * as douyin from '../services/douyin.js'
import * as qishui from '../services/qishui.js'
import * as migu from '../services/migu.js'

const router = Router()

const services = {
  '网易云音乐': netease,
  'QQ音乐': qqmusic,
  'B站': bilibili,
  '抖音': douyin,
  '汽水音乐': qishui,
  '咪咕音乐': migu
}

router.get('/', async (req, res) => {
  const platform = req.query.platform
  if (!platform || !services[platform]) {
    return res.json({ code: 400, message: 'Invalid platform', platforms: Object.keys(services) })
  }

  try {
    const result = await services[platform].getToplist()
    if (result) {
      res.json({ code: 200, data: result })
    } else {
      res.json({ code: 200, data: null, message: `${platform} toplist fetch failed, using fallback` })
    }
  } catch (e) {
    res.json({ code: 200, data: null, message: e.message })
  }
})

export default router
