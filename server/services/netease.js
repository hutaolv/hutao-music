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
    const { data } = await axios.get(`https://music.163.com/api/v3/playlist/detail`, {
      headers: cookieHeaders,
      params: { id, n: 50, s: 0, t: -1 }
    })
    const tracks = data?.playlist?.tracks || []
    if (!tracks.length) return null
    return tracks.slice(0, 50).map(track => ({
      id: `netease_${track.id}`,
      platformId: String(track.id),
      title: track.name,
      artist: (track.ar || []).map(a => a.name).join(' / '),
      artistId: track.ar?.[0]?.id ? `netease_artist_${track.ar[0].id}` : '',
      album: track.al?.name || '',
      cover: track.al?.picUrl || '',
      duration: formatDuration(track.dt),
      durationMs: track.dt || 0,
      platform: '网易云音乐',
      audioUrl: '',
      vip: track.fee === 1 || track.fee === 4,
      platformIdNum: track.id
    }))
  } catch (e) {
    return null
  }
}

export async function getToplist() {
  try {
    const result = []
    for (const list of KNOWN_LISTS) {
      const songs = await getPlaylist(list.id)
      if (songs?.length) {
        result.push({
          name: list.name,
          cover: songs[0]?.cover || '',
          songs
        })
      }
    }
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

export async function getArtistSongs(artistId) {
  try {
    const { data } = await axios.get(`https://music.163.com/api/artist/${artistId}`, {
      headers: { ...headers, 'Cookie': 'appver=2.0.2' }
    })
    if (data.code !== 200 || !data.hotSongs) return []
    return data.hotSongs.slice(0, 10).map(track => ({
      id: `netease_${track.id}`,
      platformId: String(track.id),
      title: track.name,
      artist: (track.artists || []).map(a => a.name).join(' / '),
      artistId: `netease_artist_${track.artists?.[0]?.id || ''}`,
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
    console.error('NetEase artist songs error:', e.message)
    return []
  }
}

export async function getSongUrl(id) {
  try {
    const { data } = await axios.get(`https://music.163.com/api/song/enhance/player/url`, {
      headers: { ...headers, 'Cookie': 'appver=2.0.2' },
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

function formatDuration(ms) {
  if (!ms) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
