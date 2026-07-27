import axios from 'axios'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.douyin.com/',
  'Origin': 'https://www.douyin.com'
}

const endpoints = [
  {
    url: 'https://www.douyin.com/aweme/v1/web/music/list/',
    params: { type: 1, cursor: 0, count: 50 },
    headers: { ...headers, 'Cookie': '' }
  },
  {
    url: 'https://www.iesdouyin.com/web/api/v2/music/list/',
    params: { device_platform: 'webapp', aid: 6383, channel: 'channel_pc_web', cursor: 0, count: 50, type: 1 },
    headers: { ...headers, 'Cookie': '' }
  }
]

function mapSong(item) {
  return {
    id: `douyin_${item.id}`,
    platformId: String(item.id),
    title: item.title || '未知歌曲',
    artist: item.author || '未知',
    artistId: '',
    album: '',
    cover: item.cover_url || item.cover_thumb?.url_list?.[0] || item.cover_thumb || '',
    duration: formatDuration(item.duration),
    durationMs: (item.duration || 0) * 1000,
    platform: '抖音',
    audioUrl: item.play_url?.url_list?.[0] || item.play_url || '',
    sourceUrl: item.play_url?.url_list?.[0] || item.play_url || '',
    vip: false
  }
}

export async function getToplist() {
  for (const ep of endpoints) {
    try {
      const res = await axios.get(ep.url, { headers: ep.headers, params: ep.params, timeout: 8000 })
      const songs = res.data?.music_list || []
      if (songs.length) {
        console.log(`Douyin toplist OK: ${ep.url} => ${songs.length} songs`)
        return [{
          name: '抖音热歌榜',
          cover: songs[0]?.cover || songs[0]?.cover_url || '',
          songs: songs.slice(0, 50).map(mapSong)
        }]
      }
      console.log(`Douyin endpoint ${ep.url}: status=${res.status}, has music_list=${!!res.data?.music_list}, keys=${Object.keys(res.data || {}).join(',')}`)
    } catch (e) {
      console.error(`Douyin endpoint ${ep.url}: ${e.message}`)
    }
  }
  console.error('Douyin toplist: all endpoints failed')
  return null
}

export async function searchSongs(keyword, limit = 50) {
  for (const ep of [
    { url: 'https://www.douyin.com/aweme/v1/web/music/search/', params: { keyword, cursor: 0, count: limit, type: 1 } },
    { url: 'https://www.iesdouyin.com/web/api/v2/music/search/', params: { device_platform: 'webapp', aid: 6383, channel: 'channel_pc_web', cursor: 0, count: limit, keyword, type: 1 } }
  ]) {
    try {
      const { data } = await axios.get(ep.url, { headers, params: ep.params, timeout: 8000 })
      const songs = data?.music_list || []
      if (songs.length) return songs.slice(0, limit).map(mapSong)
    } catch (e) {
      console.error(`Douyin search endpoint ${ep.url}: ${e.message}`)
    }
  }
  return []
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
