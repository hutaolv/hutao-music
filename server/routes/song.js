import { Router } from 'express'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'

const router = Router()

router.get('/url', async (req, res) => {
  const { platform, id, bvid, cid, mid, mediaMid } = req.query
  if (!platform || !id) {
    return res.json({ code: 400, message: 'platform and id required' })
  }

  try {
    let url = null
    switch (platform) {
      case '网易云音乐':
        url = await netease.getSongUrl(id)
        break
      case 'QQ音乐':
        url = await qqmusic.getSongUrl(mid || id, mediaMid)
        break
      case 'B站':
        url = await bilibili.getSongUrl(bvid, cid)
        break
      case '抖音':
      case '汽水音乐':
        url = req.query.sourceUrl || null
        break
    }
    res.json({ code: 200, data: { url } })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

router.get('/artist', async (req, res) => {
  const { platform, artistId } = req.query
  if (!platform || !artistId) {
    return res.json({ code: 400, message: 'platform and artistId required' })
  }

  try {
    let songs = []
    switch (platform) {
      case '网易云音乐':
        songs = await netease.getArtistSongs(artistId)
        break
      case 'QQ音乐':
        songs = await qqmusic.getArtistSongs(artistId)
        break
    }
    res.json({ code: 200, data: { songs } })
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message })
  }
})

export default router
