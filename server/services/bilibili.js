import axios from 'axios'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com/',
  'Origin': 'https://www.bilibili.com'
}

const cookieHeaders = {
  ...headers,
  'Cookie': 'buvid3=local; b_nut=1700000000; _uuid=local'
}

export async function getToplist() {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/web-interface/ranking/v2', {
      headers,
      params: { type: 3 }
    })
    const items = data?.data?.list || []
    if (!items.length) {
      console.error('Bilibili ranking: empty list')
      return null
    }
    console.log(`Bilibili ranking OK: ${items.length} songs`)
    const songs = items.slice(0, 50).map(v => ({
      id: `bilibili_${v.bvid}`,
      platformId: v.bvid,
      title: v.title.replace(/<[^>]*>/g, ''),
      artist: v.owner?.name || '未知',
      artistId: v.owner?.mid ? `bilibili_artist_${v.owner.mid}` : '',
      album: v.tname || '',
      cover: v.pic || '',
      duration: formatDuration(v.duration),
      durationMs: parseDuration(v.duration) * 1000,
      platform: 'B站',
      audioUrl: '',
      vip: false,
      bvid: v.bvid,
      aid: v.aid
    }))
    return [{
      name: 'B站音乐排行榜',
      cover: songs[0]?.cover || '',
      songs
    }]
  } catch (e) {
    console.error('Bilibili ranking error:', e.message)
    return null
  }
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/web-interface/search/type', {
      headers: cookieHeaders,
      params: { search_type: 'video', keyword, page: 1, order: 'click' }
    })
    const results = data?.data?.result || []
    const musicResults = results.filter(v =>
      v.tag === '音乐' || v.tname === '音乐' || v.tname?.includes('音乐')
    )
    const finalList = musicResults.length > 5 ? musicResults : results.slice(0, limit)
    return finalList.slice(0, limit).map(v => ({
      id: `bilibili_${v.bvid}`,
      platformId: v.bvid,
      title: v.title.replace(/<[^>]*>/g, ''),
      artist: v.author || '未知',
      artistId: v.mid ? `bilibili_artist_${v.mid}` : '',
      album: v.tname || '',
      cover: v.pic || '',
      duration: formatDuration(v.duration),
      durationMs: parseDuration(v.duration) * 1000,
      platform: 'B站',
      audioUrl: '',
      vip: false,
      bvid: v.bvid,
      aid: v.aid
    }))
  } catch (e) {
    console.error('Bilibili search error:', e.message)
    return []
  }
}

export async function getSongUrl(bvid, cid, musicId) {
  try {
    let rawUrl = null
    if (musicId) {
      const { data } = await axios.get('https://api.bilibili.com/x/audio/music/playurl', {
        headers, params: { music_id: musicId, privilege: 2, quality: 2 }
      })
      rawUrl = data?.data?.cdns?.[0] || data?.data?.url || null
    } else {
      let realCid = cid
      if (!realCid && bvid) {
        const { data } = await axios.get('https://api.bilibili.com/x/player/pagelist', {
          headers, params: { bvid }
        })
        realCid = data?.data?.[0]?.cid
      }
      if (realCid) {
        const { data } = await axios.get('https://api.bilibili.com/x/player/playurl', {
          headers, params: { bvid, cid: realCid, qn: 16, type: 'mp4', platform: 'web' }
        })
        const audio = data?.data?.dash?.audio
        if (audio?.length) {
          const best = audio.sort((a, b) => b.bandwidth - a.bandwidth)[0]
          rawUrl = best.baseUrl || best.backupUrl?.[0] || null
        }
        if (!rawUrl) rawUrl = data?.data?.durl?.[0]?.url || null
      }
    }

    if (rawUrl) {
      const proxyUrl = new URL('/api/proxy/audio', 'http://localhost:3001')
      proxyUrl.searchParams.set('url', rawUrl)
      return proxyUrl.toString()
    }
    return null
  } catch (e) {
    console.error('Bilibili audio URL error:', e.message)
    return null
  }
}

function parseDuration(s) {
  if (!s) return 0
  if (typeof s === 'number') return s
  const parts = s.split(':')
  if (parts.length >= 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  return parseInt(s) || 0
}

function formatDuration(s) {
  const total = parseDuration(s)
  const m = Math.floor(total / 60)
  const sec = Math.floor(total % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
