import axios from 'axios'

const CHART_API = 'https://api3-normal-c-lf.amemv.com/aweme/v1/chart/music/list/'

const charts = [
  { id: '6853972723954146568', name: '抖音热歌榜' },
  { id: '6854399861215730952', name: '抖音飙升榜' },
  { id: '6854399861215747336', name: '抖音原创榜' }
]

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.douyin.com/'
}

function mapSong(item) {
  const m = item.music_info || item
  return {
    id: `douyin_${m.id_str}`,
    platformId: m.id_str,
    title: m.title || '未知歌曲',
    artist: m.author || '未知',
    artistId: '',
    album: m.album || '',
    cover: m.cover_large?.url_list?.[0] || m.cover_thumb?.url_list?.[0] || '',
    duration: formatDuration(m.duration),
    durationMs: (m.duration || 0) * 1000,
    platform: '抖音',
    audioUrl: m.play_url?.url_list?.[0] || '',
    sourceUrl: m.play_url?.url_list?.[0] || '',
    lyricUrl: m.lyric_url || '',
    vip: false
  }
}

export async function getToplist() {
  const result = []
  for (const chart of charts) {
    try {
      const { data } = await axios.get(CHART_API, {
        headers,
        params: { chart_id: chart.id, count: 100, cursor: 0, aid: 1128 },
        timeout: 10000
      })
      if (data?.status_code === 0 && data?.music_list?.length) {
        result.push({
          name: chart.name,
          cover: data.music_list[0]?.music_info?.cover_large?.url_list?.[0] || '',
          songs: data.music_list.map(mapSong)
        })
      }
    } catch (e) {
      console.error(`Douyin chart ${chart.name} error:`, e.message)
    }
  }
  return result.length ? result : null
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get('https://www.douyin.com/aweme/v1/web/music/search/', {
      headers: { ...headers, 'Cookie': '' },
      params: { keyword, cursor: 0, count: limit },
      timeout: 8000
    })
    const songs = data?.music_list || []
    if (songs.length) return songs.slice(0, limit).map(mapSong)
  } catch {
  }
  return []
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
