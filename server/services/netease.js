import axios from 'axios'

const BASE = 'https://music.163.com/api'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://music.163.com/',
  'Origin': 'https://music.163.com'
}

const KNOWN_LISTS = [
  { id: 3778678, name: '云音乐热歌榜' },
  { id: 3779629, name: '云音乐新歌榜' },
  { id: 19723756, name: '云音乐飙升榜' },
  { id: 2884035, name: '网易原创歌曲榜' }
]

const cookieHeaders = {
  ...headers,
  'Cookie': 'appver=2.0.2; os=pc; osver=10.0; MUSIC_U=; __remember_me=true'
}

async function getPlaylist(id) {
  try {
    const endpoints = [
      { url: `${BASE}/playlist/detail`, params: { id } },
      { url: `${BASE}/v3/playlist/detail`, params: { id, n: 50, s: 0, t: -1 } },
      { url: `https://music.163.com/api/v3/playlist/detail`, params: { id, n: 50, s: 0, t: -1 } }
    ]
    // 并行请求3个备用端点，取第一个成功的，代替串行重试
    const results = await Promise.allSettled(
      endpoints.map(ep => axios.get(ep.url, { headers: cookieHeaders, params: ep.params, timeout: 8000 }))
    )
    let data = null
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.data?.code === 200) { data = r.value.data; break }
    }
    if (!data) {
      console.error(`NetEase playlist ${id}: all endpoints failed`)
      return null
    }
    const rawTracks = data?.result?.tracks || data?.playlist?.tracks || data?.songs || []
    if (!rawTracks.length) {
      console.error(`NetEase playlist ${id} no tracks, keys:`, Object.keys(data?.result || data?.playlist || data || {}))
      return null
    }
    return rawTracks.map(track => ({
      id: `netease_${track.id}`,
      platformId: String(track.id),
      title: track.name,
      artist: (track.ar || track.artists || []).map(a => a.name || a).join(' / '),
      artistId: (track.ar?.[0]?.id || track.artists?.[0]?.id) ? `netease_artist_${(track.ar?.[0]?.id || track.artists?.[0]?.id)}` : '',
      album: track.al?.name || track.album?.name || '',
      cover: track.al?.picUrl || track.album?.picUrl || '',
      duration: formatDuration(track.dt || track.duration),
      durationMs: track.dt || track.duration || 0,
      platform: '网易云音乐',
      audioUrl: '',
      vip: track.fee === 1 || track.fee === 4,
      platformIdNum: track.id
    }))
  } catch (e) {
    console.error(`NetEase playlist ${id} error:`, e.message)
    return null
  }
}

export async function getToplist() {
  try {
    // 改为并行请求4个榜单，代替原来串行
    const results = await Promise.allSettled(KNOWN_LISTS.map(list =>
      getPlaylist(list.id).then(songs => songs?.length ? { name: list.name, cover: songs[0]?.cover || '', songs } : null)
    ))
    const result = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
    return result.length ? result : null
  } catch (e) {
    console.error('NetEase toplist error:', e.message)
    return null
  }
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get(`${BASE}/search/get/web`, {
      headers: { ...headers, 'Cookie': 'appver=2.0.2' },
      params: { s: keyword, type: 1, offset: 0, total: 'true', limit }
    })
    if (data.code !== 200 || !data.result?.songs) return []
    return data.result.songs.slice(0, limit).map(track => ({
      id: `netease_${track.id}`,
      platformId: String(track.id),
      title: track.name,
      artist: (track.artists || []).map(a => a.name).join(' / '),
      artistId: track.artists?.[0]?.id ? `netease_artist_${track.artists[0].id}` : '',
      album: track.album?.name || '',
      cover: track.album?.picUrl || '',
      duration: formatDuration(track.duration),
      durationMs: track.duration || 0,
      platform: '网易云音乐',
      audioUrl: '',
      vip: track.fee === 1 || track.fee === 4,
      platformIdNum: track.id
    }))
  } catch (e) {
    console.error('NetEase search error:', e.message)
    return []
  }
}

export async function searchArtists(keyword) {
  try {
    const { data } = await axios.get(`${BASE}/search/get/web`, {
      headers: { ...headers, 'Cookie': 'appver=2.0.2' },
      params: { s: keyword, type: 100, offset: 0, total: 'true', limit: 20 }
    })
    if (data.code !== 200 || !data.result?.artists) return []
    return data.result.artists.map(a => ({
      id: `netease_artist_${a.id}`,
      platformId: a.id,
      name: a.name,
      avatar: a.img1v1Url || a.picUrl || '',
      region: a.transNames?.length ? '华语' : '未知',
      genre: '流行',
      fans: a.fansCount || 0,
      songCount: a.musicSize || 0,
      platform: '网易云音乐'
    }))
  } catch (e) {
    console.error('NetEase artist search error:', e.message)
    return []
  }
}

// 获取网易云歌手歌曲：/api/v1/artist 接口不支持 offset 分页（固定返回前 50 首），
// 因此改用歌曲搜索接口(cloudsearch)按歌手名分页；无歌手名时退回详情接口取前 50 首
export async function getArtistSongs(artistId, artistName, page = 1) {
  try {
    let tracks = []
    let hasMore = false
    const offset = (page - 1) * 20
    if (artistName) {
      // 用歌曲搜索代替歌手详情接口，支持 offset 翻页；返回按歌手名过滤确保准确性
      const { data } = await axios.post(`${BASE}/cloudsearch/pc?type=1&s=${encodeURIComponent(artistName)}&offset=${offset}&limit=20`, {}, {
        headers: { ...headers, 'Cookie': 'appver=2.0.2' },
        timeout: 8000
      })
      const songs = data?.result?.songs || []
      const songCount = data?.result?.songCount || 0
      // 过滤掉非该歌手的歌曲（合唱等），保证列表属于当前歌手；
      // 注意 cloudsearch 返回字段是 ar/al（详情接口才是 artists/album）
      tracks = songs.filter(t => (t.ar || t.artists || []).some(a => a.name === artistName))
      // 依据接口返回的总数判断是否还有下一页（offset 累计 + 本页条数 小于 总数）
      hasMore = offset + songs.length < songCount
    } else {
      // 无歌手名时退回详情接口，取前 50 首，不支持分页
      const { data } = await axios.get(`https://music.163.com/api/v1/artist/${artistId}`, {
        headers: { ...headers, 'Cookie': 'appver=2.0.2' }
      })
      tracks = data.code === 200 ? (data.hotSongs || []).slice(0, 50) : []
    }
    const songs = tracks.map(track => {
      // cloudsearch(ar/al) 与详情接口(artists/album) 字段不同，这里做兼容
      const ar = track.ar || track.artists || []
      const al = track.al || track.album || {}
      const dur = track.dt || track.duration || 0
      return {
        id: `netease_${track.id}`,
        platformId: String(track.id),
        title: track.name,
        artist: ar.map(a => a.name).join(' / '),
        artistId: `netease_artist_${ar[0]?.id || ''}`,
        album: al.name || '',
        cover: al.picUrl || '',
        duration: formatDuration(dur),
        durationMs: dur,
        platform: '网易云音乐',
        audioUrl: '',
        vip: track.fee === 1 || track.fee === 4,
        platformIdNum: track.id
      }
    })
    return { songs, hasMore }
  } catch (e) {
    console.error('NetEase artist songs error:', e.message)
    return { songs: [], hasMore: false }
  }
}

export async function getSongUrl(id) {
  try {
    const { data } = await axios.get(`https://music.163.com/api/song/enhance/player/url`, {
      headers: cookieHeaders,
      params: { ids: `[${id}]`, br: 128000 }
    })
    if (data.code === 200 && data.data?.[0]?.url) {
      return data.data[0].url
    }
    return null
  } catch (e) {
    console.error('NetEase song URL error:', e.message)
    return null
  }
}

export async function getLyrics(id) {
  try {
    const { data } = await axios.get(`https://music.163.com/api/song/lyric`, {
      headers: cookieHeaders,
      params: { id, lv: 1, kv: 1, tv: -1 }
    })
    if (data.code !== 200) return null
    return {
      lyrics: data.lrc?.lyric || '',
      transLyrics: data.tlyric?.lyric || ''
    }
  } catch (e) {
    console.error('NetEase lyrics error:', e.message)
    return null
  }
}

function formatDuration(ms) {
  if (!ms) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
