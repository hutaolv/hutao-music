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

// 搜索抖音歌曲：cursor 为偏移量，用于分页加载
export async function searchSongs(keyword, limit = 50, cursor = 0) {
  try {
    const { data } = await axios.get('https://www.douyin.com/aweme/v1/web/music/search/', {
      headers: { ...headers, 'Cookie': '' },
      params: { keyword, cursor, count: limit },
      timeout: 8000
    })
    const songs = data?.music_list || []
    if (songs.length) return songs.slice(0, limit).map(mapSong)
  } catch {
  }
  return []
}

// 搜索抖音歌手：抖音搜索接口需要 X-Bogus 签名、基本返回 404，因此依赖歌曲搜索提取歌手。
// 歌曲搜索不可用时此函数同样会返回空
export async function searchArtists(keyword, limit = 20) {
  const songs = await searchSongs(keyword, 50)
  const map = new Map()
  for (const s of songs) {
    if (!s.artist) continue
    const id = `douyin_artist_${encodeURIComponent(s.artist)}`
    if (!map.has(id)) {
      map.set(id, {
        id,
        platformId: s.artist,
        name: s.artist,
        avatar: s.cover,
        region: '未知',
        genre: '未知',
        fans: 0,
        songCount: 0,
        platform: '抖音'
      })
    }
  }
  return Array.from(map.values()).slice(0, limit)
}

// 获取抖音歌手歌曲：通过歌手名搜索歌曲后按歌手过滤，cursor 翻页，
// 接口返回的 has_more 用于判断是否还有下一页
export async function getArtistSongs(artistId, artistName, page = 1) {
  const keyword = artistName || ''
  if (!keyword) return { songs: [], hasMore: false }
  const cursor = (page - 1) * 20
  try {
    const { data } = await axios.get('https://www.douyin.com/aweme/v1/web/music/search/', {
      headers: { ...headers, 'Cookie': '' },
      params: { keyword, cursor, count: 20 },
      timeout: 8000
    })
    const songs = (data?.music_list || []).map(mapSong).filter(s => (s.artist || '').includes(keyword))
    return { songs, hasMore: data?.has_more === 1 }
  } catch {
    return { songs: [], hasMore: false }
  }
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
