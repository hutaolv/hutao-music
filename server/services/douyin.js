import axios from 'axios'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.douyin.com/',
  'Origin': 'https://www.douyin.com'
}

const cookieHeaders = {
  ...headers,
  'Cookie': 'msToken=abc123def456; odin_tt=; passport_csrf_token='
}

export async function getToplist() {
  try {
    const { data } = await axios.get('https://www.douyin.com/aweme/v1/web/music/list/', {
      headers: cookieHeaders,
      params: {
        type: 1,
        cursor: 0,
        count: 50
      }
    })
    if (data?.status_code !== 0) return null
    const songs = (data?.music_list || []).slice(0, 50).map(item => ({
      id: `douyin_${item.id}`,
      platformId: String(item.id),
      title: item.title || '未知歌曲',
      artist: item.author || '未知',
      artistId: '',
      album: '',
      cover: item.cover_url || item.cover_thumb?.url_list?.[0] || '',
      duration: formatDuration(item.duration),
      durationMs: (item.duration || 0) * 1000,
      platform: '抖音',
      audioUrl: item.play_url?.url_list?.[0] || item.play_url || '',
      sourceUrl: item.play_url?.url_list?.[0] || item.play_url || '',
      vip: false
    }))

    return [{
      name: '抖音热歌榜',
      cover: songs[0]?.cover || '',
      songs
    }]
  } catch (e) {
    console.error('Douyin toplist error:', e.message)
    return null
  }
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get('https://www.douyin.com/aweme/v1/web/music/search/', {
      headers: cookieHeaders,
      params: {
        keyword,
        cursor: 0,
        count: limit,
        type: 1
      }
    })
    const songs = data?.music_list || []
    return songs.map(item => ({
      id: `douyin_${item.id}`,
      platformId: String(item.id),
      title: item.title || '未知歌曲',
      artist: item.author || '未知',
      artistId: '',
      album: '',
      cover: item.cover_url || '',
      duration: formatDuration(item.duration),
      durationMs: (item.duration || 0) * 1000,
      platform: '抖音',
      audioUrl: item.play_url?.url_list?.[0] || '',
      sourceUrl: item.play_url?.url_list?.[0] || '',
      vip: false
    }))
  } catch (e) {
    console.error('Douyin search error:', e.message)
    return []
  }
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
