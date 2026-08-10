const API_BASE = '/api'

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

export async function searchAll(keyword, platform, scope, page) {
  let url = `${API_BASE}/search?keyword=${encodeURIComponent(keyword)}`
  if (platform) url += `&platform=${encodeURIComponent(platform)}`
  if (scope) url += `&scope=${encodeURIComponent(scope)}`
  if (page && page > 1) url += `&page=${page}`
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

// 获取播放地址。quality: standard/high/lossless（音质档位，由播放器选择并持久化）。
// detect=true 时后端同时探测该歌曲可用音质，返回 { url, availableQualities }
export async function getSongUrl(song, quality = 'standard', detect = false) {
  const songId = song.platformId || song.id
  const params = new URLSearchParams({
    platform: song.platform,
    id: songId
  })
  if (quality && quality !== 'standard') params.set('quality', quality)
  if (detect) params.set('detect', '1')
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
      // 探测时返回对象（含可用音质列表），否则返回 url 字符串，兼容两种调用方式
      if (detect) return { url: json.data.url, availableQualities: json.data.availableQualities || ['standard'] }
      return json.data.url
    }
  } catch (e) {
    console.warn('Get song URL failed:', e.message)
  }
  // 拿不到真实音频时返回空，由播放器提示"无法获取"并跳下一首，不再回退 demo
  if (detect) return { url: null, availableQualities: ['standard'] }
  return null
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

// 获取歌手歌曲。artistName 可选，供 B站/抖音/咪咕等需按歌手名辅助搜索的平台使用；
// page 用于咪咕分页加载。返回 { songs, hasMore }
export async function getArtistSongs(platform, artistId, artistName, page = 1) {
  let url = `${API_BASE}/song/artist?platform=${encodeURIComponent(platform)}&artistId=${encodeURIComponent(artistId)}`
  if (artistName) url += `&name=${encodeURIComponent(artistName)}`
  if (page && page > 1) url += `&page=${page}`
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.code === 200) return json.data
    return { songs: [], hasMore: false }
  } catch (e) {
    console.warn('Get artist songs failed:', e.message)
    return { songs: [], hasMore: false }
  }
}
