import axios from 'axios'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com/'
}

export async function getToplist() {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/web-interface/popular', {
      headers,
      params: { pn: 1, ps: 50 }
    })
    if (data.code !== 0) return null

    const songs = (data.data?.list || []).slice(0, 50).map((v, i) => ({
      id: `bilibili_${v.bvid}`,
      platformId: v.bvid,
      title: v.title,
      artist: v.owner?.name || '未知',
      artistId: `bilibili_artist_${v.owner?.mid || ''}`,
      album: v.tname || '',
      cover: v.pic || '',
      duration: formatDuration(v.duration),
      durationMs: v.duration * 1000,
      platform: 'B站',
      audioUrl: '',
      bvid: v.bvid,
      aid: v.aid,
      cid: v.cid
    }))

    return [{
      name: 'B站热门视频',
      cover: songs[0]?.cover || '',
      songs
    }]
  } catch (e) {
    console.error('Bilibili toplist error:', e.message)
    return null
  }
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/web-interface/search/type', {
      headers,
      params: { search_type: 'video', keyword, page: 1, order: 'click', duration: 0, tids: 0 }
    })
    const results = data?.data?.result || []
    return results.filter(v => v.tag === '音乐' || v.tname === '音乐').slice(0, limit).map(v => ({
      id: `bilibili_${v.bvid}`,
      platformId: v.bvid,
      title: v.title.replace(/<[^>]*>/g, ''),
      artist: v.author || '未知',
      artistId: v.mid ? `bilibili_artist_${v.mid}` : '',
      album: '',
      cover: v.pic || '',
      duration: formatDuration(v.duration),
      durationMs: (v.duration || 0) * 1000,
      platform: 'B站',
      audioUrl: '',
      bvid: v.bvid,
      aid: v.aid
    }))
  } catch (e) {
    console.error('Bilibili search error:', e.message)
    return []
  }
}

export async function getSongUrl(bvid, cid) {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/player/playurl', {
      headers,
      params: { bvid, cid, qn: 16, type: 'mp4', platform: 'web' }
    })
    const audio = data?.data?.dash?.audio
    if (audio?.length) {
      const best = audio.sort((a, b) => b.bandwidth - a.bandwidth)[0]
      return best.baseUrl || best.backupUrl?.[0] || null
    }
    return data?.data?.durl?.[0]?.url || null
  } catch (e) {
    console.error('Bilibili audio URL error:', e.message)
    return null
  }
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
