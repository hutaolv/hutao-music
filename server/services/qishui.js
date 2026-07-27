import axios from 'axios'

const BASE = 'https://music.douyin.com'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://music.douyin.com/',
  'Origin': 'https://music.douyin.com'
}

export async function getToplist() {
  try {
    let songs = []
    try {
      const { data } = await axios.get(`${BASE}/api/recommend/hot/`, {
        headers,
        params: { offset: 0, limit: 50 }
      })
      songs = data?.data?.list || data?.data || []
    } catch {
      songs = []
    }
    if (!songs.length) return null

    return [{
      name: '汽水音乐热榜',
      cover: songs[0]?.cover_medium?.url || songs[0]?.cover_thumb?.url || '',
      songs: songs.slice(0, 50).map((item, i) => ({
        id: `qishui_${item.id}`,
        platformId: String(item.id),
        title: item.title || '未知歌曲',
        artist: item.author || '未知',
        artistId: '',
        album: item.album || '',
        cover: item.cover_medium?.url || item.cover_thumb?.url || '',
        duration: formatDuration(item.duration),
        durationMs: (item.duration || 0) * 1000,
        platform: '汽水音乐',
        audioUrl: item.play_url?.url_list?.[0] || '',
        sourceUrl: item.play_url?.url_list?.[0] || ''
      }))
    }]
  } catch (e) {
    console.error('Qishui toplist error:', e.message)
    return null
  }
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get(`${BASE}/api/search/music/v2/`, {
      headers,
      params: { keyword, offset: 0, limit }
    })
    const songs = data?.data || data?.musics || []
    if (songs.length) {
      return songs.slice(0, limit).map(item => ({
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
        sourceUrl: item.play_url?.url_list?.[0] || ''
      }))
    }
    return []
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
