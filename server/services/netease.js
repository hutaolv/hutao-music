import axios from 'axios'
import { neteaseThirdPartyApis } from './hutao-netease.js'
import { fetchWithFallback } from './thirdPartyApis.js'

const BASE = 'https://music.163.com/api'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://music.163.com/',
  'Origin': 'https://music.163.com'
}

// 网易云CDN支持 ?param=WxH 缩略参数：服务端按需缩放，避免下载原图。
// 原图常见几千像素（几百KB~2MB），500px 足以覆盖歌词页320px大封面@2x屏的清晰度，
// 单张体积可降约85%。已带查询参数的 URL 不重复处理
function thumb(picUrl) {
  if (!picUrl) return ''
  return picUrl.includes('?') ? picUrl : `${picUrl}?param=500y500`
}

const KNOWN_LISTS = [
  { id: 3778678, name: '云音乐热歌榜' },
  { id: 3779629, name: '云音乐新歌榜' },
  { id: 19723756, name: '云音乐飙升榜' },
  { id: 2884035, name: '云音乐原创榜' },
  { id: 6723173524, name: '网络热歌榜' },
  { id: 71385702, name: '网易云ACG榜' },
  { id: 2809513713, name: '网易云欧美热歌榜' }
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
      cover: thumb(track.al?.picUrl || track.album?.picUrl || ''),
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

export async function getToplist(order, sublistIndex) {
  try {
    // 无 sublistIndex：只返回元数据，不拉歌曲
    if (sublistIndex == null) {
      return KNOWN_LISTS.map(l => ({ name: l.name, cover: '', songs: [] }))
    }

    // 有 sublistIndex：只拉该子榜单的歌曲
    const idx = Math.min(sublistIndex, KNOWN_LISTS.length - 1)
    const list = KNOWN_LISTS[idx]
    const songs = await getPlaylist(list.id)
    const result = KNOWN_LISTS.map(l => ({ name: l.name, cover: '', songs: [] }))
    if (songs?.length) {
      result[idx].songs = songs
      result[idx].cover = songs[0]?.cover || ''
    }
    return result
  } catch (e) {
    console.error('NetEase toplist error:', e.message)
    return null
  }
}

export async function searchSongs(keyword, limit = 50) {
  try {
    // 用 cloudsearch 接口：返回歌曲带 al.picUrl 封面（search/get/web 的 album 只有 name 没有图）
    const { data } = await axios.post(`${BASE}/cloudsearch/pc?type=1&s=${encodeURIComponent(keyword)}&offset=0&limit=${limit}`, {}, {
      headers: { ...headers, 'Cookie': 'appver=2.0.2' },
      timeout: 8000
    })
    if (data.code !== 200 || !data.result?.songs) return []
    return data.result.songs.slice(0, limit).map(track => {
      // cloudsearch 返回 al/ar（小写），老接口才用 album/artists，这里做兼容
      const al = track.al || track.album || {}
      const ar = track.ar || track.artists || []
      return {
        id: `netease_${track.id}`,
        platformId: String(track.id),
        title: track.name,
        artist: ar.map(a => a.name).join(' / '),
        artistId: ar[0]?.id ? `netease_artist_${ar[0].id}` : '',
        album: al.name || '',
        cover: thumb(al.picUrl || ''),
        duration: formatDuration(track.duration || track.dt),
        durationMs: track.duration || track.dt || 0,
        platform: '网易云音乐',
        audioUrl: '',
        vip: track.fee === 1 || track.fee === 4,
        platformIdNum: track.id
      }
    })
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
// 因此改用歌曲搜索接口(cloudsearch)按歌手名分页（每页 50 首）；无歌手名时退回详情接口取前 50 首
export async function getArtistSongs(artistId, artistName, page = 1) {
  try {
    let tracks = []
    let hasMore = false
    const offset = (page - 1) * 50
    if (artistName) {
      // 用歌曲搜索代替歌手详情接口，支持 offset 翻页；返回按歌手名过滤确保准确性
      const { data } = await axios.post(`${BASE}/cloudsearch/pc?type=1&s=${encodeURIComponent(artistName)}&offset=${offset}&limit=50`, {}, {
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
        cover: thumb(al.picUrl || ''),
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

// 网易云音质档位映射：br 参数 128000=标准 320000=高音质 999000=无损（该曲无无损时接口自动回落）
const BR_MAP = { standard: 128000, high: 320000, lossless: 999000 }

export async function getSongUrl(id, quality = 'standard') {
  // 官方 API + 第三方 API 同时发起，第一个返回有效URL的立即胜出
  const officialPromise = axios.get(`https://music.163.com/api/song/enhance/player/url`, {
    headers: cookieHeaders,
    params: { ids: `[${id}]`, br: BR_MAP[quality] || 128000 },
    timeout: 5000
  }).then(({ data }) => {
    if (data.code === 200 && data.data?.[0]?.url) return data.data[0].url
    return null
  }).catch(() => null)

  const thirdPartyPromise = fetchWithFallback(neteaseThirdPartyApis, id, quality).then(r => r?.url || null)

  return new Promise(resolve => {
    let settled = false
    let officialDone = false, thirdDone = false, officialUrl = null, thirdUrl = null
    const check = () => {
      if (settled) return
      if (officialUrl) { settled = true; resolve(officialUrl) }
      else if (thirdUrl) { settled = true; resolve(thirdUrl) }
      else if (officialDone && thirdDone) { settled = true; resolve(null) }
    }
    officialPromise.then(u => { officialUrl = u; officialDone = true; check() })
    thirdPartyPromise.then(u => { thirdUrl = u; thirdDone = true; check() })
  })
}

// 探测歌曲实际可用的音质档位：无损需接口返回 level 为 lossless/hires，
// 否则 999000 只是回落到高音质，不视为有真无损
export async function detectQualities(id) {
  const probes = [
    { q: 'lossless', br: 999000, needLevel: ['lossless', 'hires', 'jyeffect', 'jymaster'] },
    { q: 'high', br: 320000 },
    { q: 'standard', br: 128000 }
  ]

  // 官方 API 并行探测
  const officialResults = await Promise.allSettled(probes.map(p =>
    axios.get(`https://music.163.com/api/song/enhance/player/url`, {
      headers: cookieHeaders,
      params: { ids: `[${id}]`, br: p.br },
      timeout: 5000
    }).then(({ data }) => {
      const u = data?.data?.[0]
      return { q: p.q, ok: u?.url && (!p.needLevel || p.needLevel.includes(u.level)) }
    }).catch(() => ({ q: p.q, ok: false }))
  ))
  const result = officialResults.map(r => r.value).filter(r => r.ok).map(r => r.q)

  if (result.length >= 2) return result

  // 官方 API 探测结果不足时，用第三方 API 补充探测（并行）
  const thirdPartyProbes = [
    { q: 'lossless', level: 'lossless' },
    { q: 'high', level: 'exhigh' },
    { q: 'standard', level: 'standard' }
  ].filter(p => !result.includes(p.q))

  if (thirdPartyProbes.length) {
    const tpResults = await Promise.allSettled(thirdPartyProbes.map(p =>
      Promise.race([
        fetchWithFallback(neteaseThirdPartyApis, id, p.level),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]).then(r => ({ q: p.q, ok: !!r?.url })).catch(() => ({ q: p.q, ok: false }))
    ))
    result.push(...tpResults.map(r => r.value).filter(r => r.ok).map(r => r.q))
  }

  return result.length ? result : ['standard']
}

export async function getLyrics(id) {
  try {
    const { data } = await axios.get(`https://music.163.com/api/song/lyric`, {
      headers: cookieHeaders,
      // os=pc + lv=-1 才能取到歌词；lv=1 对部分歌曲（如翻唱/有声内容）会返回空
      params: { id, os: 'pc', lv: -1, kv: -1, tv: -1 }
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
