import axios from 'axios'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.douyin.com/',
  'Origin': 'https://www.douyin.com'
}

export async function getToplist() {
  try {
    const { data } = await axios.get('https://www.iesdouyin.com/web/api/v2/music/list/', {
      headers: {
        ...headers,
        'Cookie': ''
      },
      params: {
        device_platform: 'webapp',
        aid: 6383,
        channel: 'channel_pc_web',
        cursor: 0,
        count: 50,
        type: 1
      }
    })
    if (!data?.music_list || data.status_code !== 0) return null

    const songs = (data.music_list || []).slice(0, 50).map((item, i) => ({
      id: `douyin_${item.id}`,
      platformId: String(item.id),
      title: item.title || '未知歌曲',
      artist: item.author || '未知',
      artistId: '',
      album: '',
      cover: item.cover_url || item.cover_thumb || '',
      duration: formatDuration(item.duration),
      durationMs: (item.duration || 0) * 1000,
      platform: '抖音',
      audioUrl: item.play_url?.url_list?.[0] || item.play_url || '',
      sourceUrl: item.play_url?.url_list?.[0] || item.play_url || ''
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
    const { data } = await axios.get('https://www.iesdouyin.com/web/api/v2/music/search/', {
      headers: {
        ...headers,
        'Cookie': ''
      },
      params: {
        device_platform: 'webapp',
        aid: 6383,
        channel: 'channel_pc_web',
        cursor: 0,
        count: limit,
        keyword,
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
      sourceUrl: item.play_url?.url_list?.[0] || ''
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
