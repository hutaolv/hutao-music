const API_BASE = '/api'

const DEMO_SONGS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3'
]

function getDemoUrl(id) {
  let hash = 0
  const str = String(id)
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return DEMO_SONGS[Math.abs(hash) % DEMO_SONGS.length]
}

export async function fetchCharts(platform) {
  try {
    const res = await fetch(`${API_BASE}/charts?platform=${encodeURIComponent(platform)}`)
    const json = await res.json()
    if (json.code === 200) return json.data
    return null
  } catch (e) {
    console.warn(`Fetch ${platform} charts failed:`, e.message)
    return null
  }
}

export async function searchAll(keyword, platform) {
  let url = `${API_BASE}/search?keyword=${encodeURIComponent(keyword)}`
  if (platform) url += `&platform=${encodeURIComponent(platform)}`
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.code === 200) return json.data
    return { songs: [], artists: [] }
  } catch (e) {
    console.warn('Search failed:', e.message)
    return { songs: [], artists: [] }
  }
}

export async function searchSongs(keyword) {
  try {
    const res = await fetch(`${API_BASE}/search?keyword=${encodeURIComponent(keyword)}&type=song`)
    const json = await res.json()
    if (json.code === 200) return json.data.songs || []
    return []
  } catch (e) {
    console.warn('Song search failed:', e.message)
    return []
  }
}

export async function searchArtists(keyword) {
  try {
    const res = await fetch(`${API_BASE}/search?keyword=${encodeURIComponent(keyword)}&type=artist`)
    const json = await res.json()
    if (json.code === 200) return json.data.artists || []
    return []
  } catch (e) {
    console.warn('Artist search failed:', e.message)
    return []
  }
}

export async function getSongUrl(song) {
  const songId = song.platformId || song.id
  const params = new URLSearchParams({
    platform: song.platform,
    id: songId
  })
  if (song.bvid) params.set('bvid', song.bvid)
  if (song.cid) params.set('cid', song.cid)
  if (song.auid) params.set('auid', song.auid)
  if (song.platformSongMid) params.set('mid', song.platformSongMid)
  if (song.platformMediaMid) params.set('mediaMid', song.platformMediaMid)
  if (song.sourceUrl) params.set('sourceUrl', song.sourceUrl)
  if (song.musicId) params.set('musicId', song.musicId)

  try {
    const res = await fetch(`${API_BASE}/song/url?${params}`)
    const json = await res.json()
    if (json.code === 200 && json.data?.url) {
      return json.data.url
    }
  } catch (e) {
    console.warn('Get song URL failed:', e.message)
  }
  return getDemoUrl(songId)
}

export async function getLyrics(song) {
  const params = new URLSearchParams({ platform: song.platform, id: song.platformId || song.id })
  if (song.platformSongMid) params.set('mid', song.platformSongMid)
  if (song.lyricUrl) params.set('lyricUrl', song.lyricUrl)
  try {
    const res = await fetch(`${API_BASE}/song/lyrics?${params}`)
    const json = await res.json()
    if (json.code === 200 && json.data) return json.data
    return { lyrics: '', transLyrics: '' }
  } catch {
    return { lyrics: '', transLyrics: '' }
  }
}

// 获取歌手歌曲。artistName 可选，供 B站/抖音/咪咕等需按歌手名辅助搜索的平台使用
export async function getArtistSongs(platform, artistId, artistName) {
  let url = `${API_BASE}/song/artist?platform=${encodeURIComponent(platform)}&artistId=${encodeURIComponent(artistId)}`
  if (artistName) url += `&name=${encodeURIComponent(artistName)}`
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.code === 200) return json.data.songs || []
    return []
  } catch (e) {
    console.warn('Get artist songs failed:', e.message)
    return []
  }
}
