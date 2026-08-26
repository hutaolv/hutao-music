import axios from 'axios'

const CHART_API = 'https://api3-normal-c-lf.amemv.com/aweme/v1/chart/music/list/'

const charts = [

  { id: '7456941237036320787', name: '汽水热歌榜' },
 // { id: '6853972723954146568', name: '汽水热歌榜' },
  { id: '6854399861215730952', name: '汽水飙升榜' },
  { id: '6854399861215747336', name: '汽水原创榜' }
]

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.douyin.com/'
}

function mapSong(item) {
  const m = item.music_info || item
  return {
    id: `qishui_${m.id_str}`,
    platformId: m.id_str,
    title: m.title || '未知歌曲',
    artist: m.author || '未知',
    artistId: '',
    album: m.album || '',
    // 列表展示场景优先取缩略图（cover_thumb 比 cover_large 小数倍）
    cover: m.cover_thumb?.url_list?.[0] || m.cover_large?.url_list?.[0] || '',
    duration: formatDuration(m.duration),
    durationMs: (m.duration || 0) * 1000,
    platform: '汽水音乐',
    audioUrl: m.play_url?.url_list?.[0] || '',
    sourceUrl: m.play_url?.url_list?.[0] || '',
    lyricUrl: m.lyric_url || '',
    vip: false
  }
}

export async function getToplist(order, sublistIndex) {
  // 无 sublistIndex：只返回元数据
  if (sublistIndex == null) {
    return charts.map(c => ({ name: c.name, cover: '', songs: [] }))
  }

  // 有 sublistIndex：只拉该榜单的歌曲
  const idx = Math.min(sublistIndex, charts.length - 1)
  const chart = charts[idx]
  const result = charts.map(c => ({ name: c.name, cover: '', songs: [] }))

  try {
    const { data } = await axios.get(CHART_API, {
      headers,
      params: { chart_id: chart.id, count: 100, cursor: 0, aid: 1128 },
      timeout: 10000
    })
    if (data?.status_code === 0 && data?.music_list?.length) {
      result[idx].songs = data.music_list.map(mapSong)
      result[idx].cover = data.music_list[0]?.music_info?.cover_thumb?.url_list?.[0] || data.music_list[0]?.music_info?.cover_large?.url_list?.[0] || ''
    }
  } catch (e) {
    console.error(`Qishui chart ${chart.name} error:`, e.message)
  }
  return result
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get('https://music.douyin.com/api/search/music/v2/', {
      headers: { ...headers, 'Referer': 'https://music.douyin.com/', 'Origin': 'https://music.douyin.com' },
      params: { keyword, offset: 0, limit },
      timeout: 8000
    })
    const songs = data?.data || data?.musics || []
    if (songs.length) return songs.slice(0, limit).map(s => ({
      id: `qishui_${s.id}`,
      platformId: String(s.id),
      title: s.title || '未知歌曲',
      artist: s.author || '未知',
      artistId: '',
      album: s.album || '',
      cover: s.cover_medium?.url || s.cover_thumb?.url || s.cover || '',
      duration: formatDuration(s.duration),
      durationMs: (s.duration || 0) * 1000,
      platform: '汽水音乐',
      audioUrl: s.play_url?.url_list?.[0] || '',
      sourceUrl: s.play_url?.url_list?.[0] || '',
      vip: false
    }))
  } catch (e) {
    console.error('Qishui search error:', e.message)
  }
  return []
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
