import { Router } from 'express'
import * as netease from '../services/netease.js'
import * as qqmusic from '../services/qqmusic.js'
import * as bilibili from '../services/bilibili.js'

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
  const { platform, id, bvid, cid, mid, mediaMid, musicId } = req.query
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
        url = await bilibili.getSongUrl(bvid, cid, musicId)
        break
      case '抖音':
      case '汽水音乐':
        url = req.query.sourceUrl || null
        break
    }
    if (!url) url = getDemoUrl(id)
    res.json({ code: 200, data: { url } })
  } catch (e) {
    res.json({ code: 200, data: { url: getDemoUrl(req.query.id) } })
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
