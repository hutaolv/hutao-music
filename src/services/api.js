// API 基地址：
// - 网页版走相对路径 /api（同源，由 Express/Nginx 转发）
// - 打包成 APK 后 WebView 加载的是本地资源，/api 会指向手机本地，必须改用线上服务器地址
// - 通过 VITE_API_BASE 构建时注入（打包 APK 时由构建命令指定，不写死在代码里）
//   注意 VITE_API_BASE 应指向服务器根地址（不含 /api），下方统一拼接
const API_ORIGIN = import.meta.env.VITE_API_BASE || ''
const API_BASE = `${API_ORIGIN}/api`

// 把后端返回的相对路径（/api/proxy/...）转成绝对地址：
// 网页版保持相对路径（同源），APK 里 WebView origin 是本地，必须补上服务器地址才能加载封面/音频
export function toAbsolute(url) {
  if (!url || typeof url !== 'string') return url
  if (url.startsWith('/') && !url.startsWith('//') && API_ORIGIN) return API_ORIGIN + url
  return url
}

export async function fetchCharts(platform) {
  try {
    const res = await fetch(`${API_BASE}/charts?platform=${encodeURIComponent(platform)}`)
    const json = await res.json()
    if (json.code === 200) {
      // 榜单歌曲封面可能是代理相对路径，APK 里统一转绝对地址
      const data = json.data
      if (Array.isArray(data)) {
        data.forEach(list => {
          if (Array.isArray(list?.songs)) list.songs.forEach(s => { if (s) s.cover = toAbsolute(s.cover) })
        })
      }
      return data
    }
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
    if (json.code === 200) {
      const data = json.data
      // 搜索结果歌曲/歌手的封面或头像可能是代理相对路径，APK 里统一转绝对地址
      if (Array.isArray(data?.songs)) data.songs.forEach(s => { if (s) s.cover = toAbsolute(s.cover) })
      if (Array.isArray(data?.artists)) data.artists.forEach(a => { if (a) a.avatar = toAbsolute(a.avatar) })
      return data
    }
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
  // 第三方搜索的歌曲：id 是第三方 ID，platformId 是官方 ID（用于歌词）
  // 播放时需要告诉后端使用第三方 API，但播放地址需要用官方 ID 获取
  const isThirdParty = song.isThirdParty
  // 第三方歌曲播放用 platformId（官方ID），官方歌曲播放用 platformId 或 id
  const songId = isThirdParty ? (song.platformId || song.id) : (song.platformId || song.id)
  const params = new URLSearchParams({
    platform: song.platform,
    id: songId
  })
  if (isThirdParty) params.set('source', 'thirdparty')
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
      // 播放地址可能是后端代理的相对路径，APK 里需转成绝对地址
      if (detect) return { url: toAbsolute(json.data.url), availableQualities: json.data.availableQualities || ['standard'] }
      return toAbsolute(json.data.url)
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
  // 酷狗官方歌词接口需要歌曲时长（毫秒）
  if (song.platform === '酷狗音乐' && song.durationMs) params.set('timelength', song.durationMs)
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
export async function fetchLatestVersion() {
  try {
    const res = await fetch(`${API_ORIGIN}/api/version`)
    const json = await res.json()
    if (json.code === 200 && json.data?.version) {
      return {
        version: String(json.data.version),
        apkUrl: toAbsolute(json.data.apkUrl),
        notes: json.data.notes || ''
      }
    }
  } catch (e) {
    console.warn('Fetch latest version failed:', e.message)
  }
  return null
}

export async function thirdPartySearch(keyword, platform) {
  let url = `${API_BASE}/search/thirdparty?keyword=${encodeURIComponent(keyword)}`
  if (platform) url += `&platform=${encodeURIComponent(platform)}`
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.code === 200) {
      const data = json.data
      if (Array.isArray(data?.songs)) data.songs.forEach(s => { if (s) s.cover = toAbsolute(s.cover) })
      return data
    }
    return { songs: [] }
  } catch (e) {
    console.warn('Third-party search failed:', e.message)
    return { songs: [] }
  }
}

export async function getArtistSongs(platform, artistId, artistName, page = 1) {
  let url = `${API_BASE}/song/artist?platform=${encodeURIComponent(platform)}&artistId=${encodeURIComponent(artistId)}`
  if (artistName) url += `&name=${encodeURIComponent(artistName)}`
  if (page && page > 1) url += `&page=${page}`
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.code === 200) {
      // 歌手歌曲封面可能是代理相对路径，APK 里统一转绝对地址
      const data = json.data
      if (Array.isArray(data?.songs)) data.songs.forEach(s => { if (s) s.cover = toAbsolute(s.cover) })
      return data
    }
    return { songs: [], hasMore: false }
  } catch (e) {
    console.warn('Get artist songs failed:', e.message)
    return { songs: [], hasMore: false }
  }
}
