import axios from 'axios'

const BASE = 'https://music.douyin.com'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://music.douyin.com/',
  'Origin': 'https://music.douyin.com'
}

const endpoints = [
  { url: `${BASE}/api/explore/`, params: { page: 1, page_size: 50 } },
  { url: `${BASE}/api/recommend/hot/`, params: { offset: 0, limit: 50 } },
  { url: `${BASE}/api/recommend/`, params: { page: 1, page_size: 50 } },
  { url: `${BASE}/api/search/music/`, params: { keyword: '热歌', offset: 0, limit: 50 } }
]

function mapSong(item) {
  return {
    id: `qishui_${item.id}`,
    platformId: String(item.id),
    title: item.title || '未知歌曲',
    artist: item.author || '未知',
    artistId: '',
    album: item.album || '',
    cover: item.cover_medium?.url || item.cover_thumb?.url || item.cover || '',
    duration: formatDuration(item.duration),
    durationMs: (item.duration || 0) * 1000,
    platform: '汽水音乐',
    audioUrl: item.play_url?.url_list?.[0] || '',
    sourceUrl: item.play_url?.url_list?.[0] || '',
    vip: false
  }
}

export async function getToplist() {
  const hotKeywords = ['热歌', '流行', '新歌', '抖音热歌', '热门']
  for (const ep of endpoints) {
    try {
      const res = await axios.get(ep.url, { headers, params: ep.params, timeout: 8000 })
      const songs = res.data?.data?.list || res.data?.data || res.data?.musics || []
      if (songs.length) {
        console.log(`Qishui toplist OK: ${ep.url} => ${songs.length} songs`)
        return [{
          name: '汽水音乐热榜',
          cover: songs[0]?.cover_medium?.url || songs[0]?.cover_thumb?.url || '',
          songs: songs.map(mapSong)
        }]
      }
      console.log(`Qishui endpoint ${ep.url}: status=${res.status}, keys=${Object.keys(res.data || {}).join(',')}`)
    } catch (e) {
      console.error(`Qishui endpoint ${ep.url}: ${e.message}`)
    }
  }
  // fallback: use search API with trending keywords
  try {
    const allSongs = []
    for (const kw of hotKeywords) {
      const { data } = await axios.get(`${BASE}/api/search/music/v2/`, {
        headers, params: { keyword: kw, offset: 0, limit: 20 }, timeout: 5000
      })
      const songs = data?.data || data?.musics || []
      for (const s of songs) {
        if (!allSongs.find(x => x.id === s.id)) allSongs.push(s)
      }
      if (allSongs.length >= 30) break
    }
    if (allSongs.length) {
      console.log(`Qishui toplist fallback: ${allSongs.length} songs from search`)
      return [{
        name: '汽水音乐热榜',
        cover: allSongs[0]?.cover_medium?.url || allSongs[0]?.cover_thumb?.url || '',
        songs: allSongs.map(mapSong)
      }]
    }
  } catch (e) {
    console.error('Qishui search fallback error:', e.message)
  }
  console.error('Qishui toplist: all endpoints + search fallback failed')
  return null
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get(`${BASE}/api/search/music/v2/`, {
      headers,
      params: { keyword, offset: 0, limit }
    })
    const songs = data?.data || data?.musics || []
    return songs.slice(0, limit).map(mapSong)
  } catch (e) {
    console.error('Qishui search error:', e.message)
    return []
  }
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
