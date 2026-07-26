const API_BASE = 'http://localhost:3001/api'

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

export async function searchAll(keyword) {
  try {
    const res = await fetch(`${API_BASE}/search?keyword=${encodeURIComponent(keyword)}`)
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
  const params = new URLSearchParams({
    platform: song.platform,
    id: song.platformId || song.id
  })
  if (song.bvid) params.set('bvid', song.bvid)
  if (song.cid) params.set('cid', song.cid)
  if (song.platformSongMid) params.set('mid', song.platformSongMid)
  if (song.platformMediaMid) params.set('mediaMid', song.platformMediaMid)
  if (song.sourceUrl) params.set('sourceUrl', song.sourceUrl)

  try {
    const res = await fetch(`${API_BASE}/song/url?${params}`)
    const json = await res.json()
    if (json.code === 200 && json.data?.url) {
      return json.data.url
    }
    return null
  } catch (e) {
    console.warn('Get song URL failed:', e.message)
    return null
  }
}

export async function getArtistSongs(platform, artistId) {
  try {
    const res = await fetch(`${API_BASE}/song/artist?platform=${encodeURIComponent(platform)}&artistId=${encodeURIComponent(artistId)}`)
    const json = await res.json()
    if (json.code === 200) return json.data.songs || []
    return []
  } catch (e) {
    console.warn('Get artist songs failed:', e.message)
    return []
  }
}
