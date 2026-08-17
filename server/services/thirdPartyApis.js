import axios from 'axios'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

const QUALITY_MAP = { standard: 'standard', high: 'exhigh', lossless: 'lossless' }
const QQ_QUALITY_MAP = { standard: '320k', high: 'flac', lossless: 'flac24bit' }

// 将秒数转换为 "M:SS" 格式的时长字符串，供前端进度条使用
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// 尝试调用单个 API，5秒超时，返回 { url, lyric, ... } 或 null
async function tryApi(name, fn) {
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])
    if (result?.url && result.url.startsWith('http')) {
      return result
    }
    return null
  } catch {
    return null
  }
}

// 依次尝试多个 API，返回第一个成功的播放地址
// 参数：apis - API 数组，songId - 歌曲ID，quality - 音质档位
export async function fetchWithFallback(apis, songId, quality) {
  for (const api of apis) {
    const result = await tryApi(api.name, () => api.fetch(songId, quality))
    if (result) {
      console.log(`[ThirdParty] ${api.name} success for ${songId}`)
      return result
    }
  }
  return null
}

// ==================== 网易云音乐第三方 API ====================
// 优先级从高到低依次尝试，每个 API 支持 standard/high/lossless 三种音质
export const neteaseThirdPartyApis = [
  // tmetu：稳定，支持歌词，响应快
  {
    name: 'tmetu',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://music.tmetu.cn/api.php`, {
        params: { miss: 'songAll', id, level: QUALITY_MAP[quality] || quality, withLyric: 'true' },
        headers, timeout: 5000
      })
      return { url: data?.data?.audioUrl, lyric: data?.data?.lyric }
    }
  },
  // bugpk：支持歌词和封面，需要忽略 SSL 证书验证
  {
    name: 'bugpk',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://api.bugpk.com/api/163_music`, {
        params: { ids: id, level: QUALITY_MAP[quality] || quality, type: 'json' },
        headers, timeout: 5000, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      })
      return { url: data?.url, lyric: data?.lyric, name: data?.name, artist: data?.ar_name, cover: data?.pic }
    }
  },
  // rrvenn：POST 请求，支持歌词和封面
  {
    name: 'rrvenn',
    fetch: async (id, quality) => {
      const { data } = await axios.post('https://music.rrvenn.cn/Song_V1',
        { url: String(id), level: QUALITY_MAP[quality] || quality, type: 'json' },
        { headers: { ...headers, 'Referer': 'https://music.rrvenn.cn/' }, timeout: 5000 }
      )
      return { url: data?.data?.url, lyric: data?.data?.lyric, name: data?.data?.name, artist: data?.data?.ar_name, cover: data?.data?.pic }
    }
  },
  // chksz：简单稳定，支持封面
  {
    name: 'chksz',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://api.chksz.top/api/163_music`, {
        params: { id, level: QUALITY_MAP[quality] || quality },
        headers: { ...headers, 'Referer': 'https://cp.chksz.top/' }, timeout: 5000
      })
      return { url: data?.data?.url, name: data?.data?.name, artist: data?.data?.artist, cover: data?.data?.picUrl }
    }
  },
  // xuanluoge：HTTP 接口，需要忽略 SSL 证书验证
  {
    name: 'xuanluoge',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`http://118.24.104.108:3456/api.php`, {
        params: { miss: 'getMusicUrl', id, level: QUALITY_MAP[quality] || quality },
        headers, timeout: 5000, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      })
      return { url: data?.data?.[0]?.url }
    }
  },
  // gdstudio：固定 br=999 获取最高音质，支持多平台
  {
    name: 'gdstudio',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://music-api.gdstudio.xyz/api.php`, {
        params: { types: 'url', id, source: 'netease', br: 999 },
        headers, timeout: 5000
      })
      return { url: data?.url }
    }
  },
  // rxtool：固定 hires 音质，支持歌词和封面
  {
    name: 'rxtool',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://api.rxtool.top/api/meteasecloudmusic.php`, {
        params: { id, level: 'hires' },
        headers: { ...headers, 'Referer': 'https://api.rxtool.top/' }, timeout: 5000
      })
      return { url: data?.url, lyric: data?.lyric, name: data?.name, artist: data?.artist, cover: data?.pic }
    }
  },
  // jfjt：POST 请求，支持封面
  {
    name: 'jfjt',
    fetch: async (id, quality) => {
      const { data } = await axios.post('https://dm.jfjt.cc/Song_V1',
        { url: String(id), level: QUALITY_MAP[quality] || quality, type: 'json' },
        { headers: { ...headers, 'Referer': 'https://dm.jfjt.cc/' }, timeout: 5000 }
      )
      return { url: data?.data?.url, name: data?.data?.name, artist: data?.data?.ar_name, cover: data?.data?.pic }
    }
  },
  // kangqiovo：POST 请求，支持歌词和封面，需要忽略 SSL 证书验证
  {
    name: 'kangqiovo',
    fetch: async (id, quality) => {
      const { data } = await axios.post('https://ncm.kangqiovo.com/Song_V1',
        { url: String(id), level: QUALITY_MAP[quality] || quality, type: 'json' },
        { headers: { ...headers, 'Referer': 'https://ncm.kangqiovo.com/' }, timeout: 5000, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
      )
      return { url: data?.data?.url, lyric: data?.data?.lyric, name: data?.data?.name, artist: data?.data?.ar_name, cover: data?.data?.pic }
    }
  },
  // haitangw：支持封面
  {
    name: 'haitangw',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://musicapi.haitangw.net/music/wy.php`, {
        params: { id, level: QUALITY_MAP[quality] || quality, type: 'json' },
        headers, timeout: 5000
      })
      return { url: data?.data?.url, name: data?.data?.name, artist: data?.data?.artist, cover: data?.data?.pic }
    }
  },
  // cgg：支持歌词和封面
  {
    name: 'cgg',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://api-v2.cenguigui.cn/api/netease/music_v1.php`, {
        params: { id, type: 'json', level: QUALITY_MAP[quality] || quality },
        headers, timeout: 5000
      })
      return { url: data?.data?.url, lyric: data?.data?.lyric, name: data?.data?.name, artist: data?.data?.artist, cover: data?.data?.pic }
    }
  },
  // cunyu：支持歌词和封面
  {
    name: 'cunyu',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://www.cunyuapi.top/163music_play`, {
        params: { id, quality: QUALITY_MAP[quality] || quality },
        headers, timeout: 5000
      })
      return { url: data?.song_file_url, lyric: data?.lyric, name: data?.name, artist: data?.ar_name, cover: data?.img }
    }
  },
  // znnu：需要先获取 keyToken，再请求歌曲，支持歌词和封面
  {
    name: 'znnu',
    fetch: async (id, quality) => {
      const { data: keyData } = await axios.get('https://music.znnu.com/api/key', { headers, timeout: 5000 })
      const { data } = await axios.post('https://music.znnu.com/api/song',
        { act: 'song', id: String(id), level: QUALITY_MAP[quality] || quality },
        { headers: { ...headers, 'X-Key-Token': keyData?.data?.keyToken }, timeout: 5000 }
      )
      return { url: data?.url, lyric: data?.lrc, name: data?.name, artist: data?.artist, cover: data?.cover }
    }
  },
  // bileizhen：支持封面
  {
    name: 'bileizhen',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://api.bileizhen.top/api/netease`, {
        params: { id, level: QUALITY_MAP[quality] || quality },
        headers, timeout: 5000
      })
      return { url: data?.data?.url, name: data?.data?.name, artist: data?.data?.artists, cover: data?.data?.pic }
    }
  }
]

// ==================== QQ音乐第三方 API ====================
// 使用 QQ_QUALITY_MAP 映射音质：standard=320k, high=flac, lossless=flac24bit
export const qqThirdPartyApis = [
  // vkeys：简单稳定，直接返回播放地址
  {
    name: 'vkeys',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://api.vkeys.cn/music/tencent/song/link`, {
        params: { mid: id, quality: QQ_QUALITY_MAP[quality] || quality },
        headers, timeout: 5000
      })
      return { url: data?.data?.url }
    }
  },
  // xingmian-qq：支持歌词和封面，需要忽略 SSL 证书验证
  {
    name: 'xingmian-qq',
    fetch: async (id, quality) => {
      const qMap = { standard: '低音质', high: '高音质', lossless: '无损' }
      const { data } = await axios.get(`https://api.xingmian.bbroot.com/API/qqmusicparse.php`, {
        params: { id, quality: qMap[quality] || '无损' },
        headers, timeout: 5000, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
      })
      return { url: data?.data?.url, lyric: data?.data?.lyric, name: data?.data?.name, artist: data?.data?.author, cover: data?.data?.pic }
    }
  },
  // 317ak：支持歌词和封面，br 参数控制音质
  {
    name: '317ak',
    fetch: async (id, quality) => {
      const brMap = { standard: '5', high: '8', lossless: '10' }
      const { data } = await axios.get(`https://api.317ak.com/api/yinyue/qqyinyue`, {
        params: { i: id, br: brMap[quality] || '10', type: 'json', lrc: 1 },
        headers, timeout: 5000
      })
      return { url: data?.url, lyric: data?.lyric, name: data?.songName, artist: data?.artistName, cover: data?.cover }
    }
  },
  // lxmusic：需要特殊 User-Agent 和 X-Request-Key 头
  {
    name: 'lxmusic',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://lxmusicapi.onrender.com/url/tx/${id}/${QQ_QUALITY_MAP[quality] || 'flac'}`, {
        headers: { 'User-Agent': 'lx-music-request/2.6.0', 'X-Request-Key': 'share-v3' },
        timeout: 5000
      })
      if (data?.msg?.includes('无法获取')) return { url: null }
      return { url: data?.url }
    }
  },
  // xcvts-qq：支持歌词和封面
  {
    name: 'xcvts-qq',
    fetch: async (id, quality) => {
      const qMap = { standard: '普通', high: 'HQ高品质', lossless: 'SQ无损' }
      const { data } = await axios.get(`https://api.xcvts.cn/api/music/qq`, {
        params: { mid: id, type: qMap[quality] || 'SQ无损' },
        headers, timeout: 5000
      })
      return { url: data?.data?.music, lyric: data?.data?.lyric, name: data?.data?.title, artist: data?.data?.singer, cover: data?.data?.cover }
    }
  },
  // gdstudio-qq：固定 br=999 获取最高音质
  {
    name: 'gdstudio-qq',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://music-api.gdstudio.xyz/api.php`, {
        params: { types: 'url', id, source: 'qq', br: 999 },
        headers, timeout: 5000
      })
      return { url: data?.url }
    }
  }
]

// ==================== 咪咕音乐第三方 API ====================
export const miguThirdPartyApis = [
  // gdstudio-migu：固定 br=999 获取最高音质
  {
    name: 'gdstudio-migu',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://music-api.gdstudio.xyz/api.php`, {
        params: { types: 'url', id, source: 'migu', br: 999 },
        headers, timeout: 5000
      })
      return { url: data?.url }
    }
  }
]

// ==================== 酷我音乐第三方 API ====================
// 音质映射：standard=128k, high=320k, lossless=flac
const KUWO_QUALITY_MAP = { standard: '128kmp3', high: '320kmp3', lossless: '2000kflac' }
export const kuwoThirdPartyApis = [
  // nxinxz：真正按音质分档返回（M500=标准/M800=高音质/F000=无损），故放最前支持音质切换
  {
    name: 'nxinxz-kuwo',
    fetch: async (id, quality) => {
      const qMap = { standard: 'standard', high: 'exhigh', lossless: 'lossless' }
      const { data } = await axios.get(`http://music.nxinxz.com/kw.php`, {
        params: { id, level: qMap[quality] || 'lossless', type: 'json' },
        headers, timeout: 5000
      })
      return { url: data?.data?.url, name: data?.data?.name, artist: data?.data?.artist, cover: data?.data?.pic }
    }
  },
  // haitangw：稳定，支持歌词和封面（不区分音质，固化为高音质档），作兜底
  {
    name: 'haitangw-kuwo',
    fetch: async (id, quality) => {
      const qMap = { standard: '128k', high: '320k', lossless: 'flac' }
      const { data } = await axios.get(`https://musicapi.haitangw.net/music/kw.php`, {
        params: { id, level: qMap[quality] || 'flac', type: 'json' },
        headers, timeout: 5000
      })
      return { url: data?.data?.url, name: data?.data?.name, artist: data?.data?.artist, cover: data?.data?.pic }
    }
  },
  // nobb：简单稳定（固定标准音质）
  {
    name: 'nobb-kuwo',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://api.nobb.cc/kuwo.music/index.php`, {
        params: { id },
        headers, timeout: 5000
      })
      return { url: data?.url }
    }
  }
]

// ==================== 第三方搜索 API ====================
// 按优先级依次尝试，每个 API 支持搜索并返回标准化的歌曲列表
export const thirdPartySearchApis = [
  // 酷我音乐搜索：稳定快速，返回结果丰富，platform 为目标平台（用于后续播放）
  {
    name: 'kuwo',
    search: async (keyword, platform) => {
      const { data } = await axios.get('http://search.kuwo.cn/r.s', {
        params: {
          client: 'kt', all: keyword, pn: 0, rn: 30,
          uid: '794762570', ver: 'kwplayer_ar_9.2.2.1', vipver: '1',
          show_copyright_off: '1', newver: '1', ft: 'music', cluster: '0',
          strategy: '2012', encoding: 'utf8', rformat: 'json', vermerge: '1',
          mobi: '1', issubtitle: '1'
        },
        headers, timeout: 8000
      })
      const list = data?.abslist || []
      if (!list.length) return []
      return list.map(item => ({
        id: String(item.MUSICRID || '').replace('MUSIC_', ''),
        title: item.SONGNAME || '',
        artist: (item.ARTIST || '').replace(/&/g, '/'),
        album: item.ALBUM || '',
        duration: formatDuration(Number(item.DURATION) || 0),
        platform: platform || '酷我音乐',
        cover: ''
      }))
    }
  },
  // QQ音乐官方搜索接口：使用 musicu.fcg 接口，返回结果包含完整的歌曲信息
  {
    name: 'qq-official',
    search: async (keyword, platform) => {
      const { data } = await axios.post('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        req_1: {
          method: 'DoSearchForQQMusicDesktop',
          module: 'music.search.SearchCgiService',
          param: { num_per_page: 30, page_num: 1, query: keyword, search_type: '0' }
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Referer': 'https://y.qq.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
          'Cookie': 'uin='
        },
        timeout: 8000
      })
      const songs = data?.req_1?.data?.body?.song?.list || []
      if (!songs.length) return []
      return songs.map(item => ({
        id: String(item.mid || ''),
        title: item.name || '',
        artist: item.singer?.map(s => s.name).join('/') || '',
        album: item.album?.name || '',
        duration: formatDuration(item.interval || 0),
        platform: 'QQ音乐',
        cover: item.album?.pic ? `https://y.qq.com/music/photo_new/T002R300x300M000${item.album.pic}.jpg` : ''
      }))
    }
  },
  // 网易云聚合搜索：使用 meting 接口，返回结果包含封面图
  {
    name: 'netease-meting',
    search: async (keyword, platform) => {
      const { data } = await axios.get(`https://api.qijieya.cn/meting/?server=netease&type=search&id=${encodeURIComponent(keyword)}`, {
        headers, timeout: 8000
      })
      if (!Array.isArray(data) || !data.length) return []
      return data.map(item => ({
        id: String(item.url?.match(/id=(\d+)/)?.[1] || ''),
        title: item.name || '',
        artist: item.artist || '',
        album: '',
        duration: '0:00',
        platform: '网易云音乐',
        cover: item.pic || ''
      }))
    }
  }
]

// 第三方搜索：依次尝试多个第三方搜索 API，返回标准化的歌曲列表
// 参数：keyword - 搜索关键词，platform - 目标平台（网易云音乐/QQ音乐）
// 返回：包含 title、artist、album、duration、platformId（官方ID，用于歌词）、isThirdParty 标识的歌曲数组
export async function searchWithThirdParty(keyword, platform) {
  for (const api of thirdPartySearchApis) {
    try {
      const result = await Promise.race([
        api.search(keyword, platform),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ])
      if (result?.length) {
        console.log(`[ThirdParty] search ${api.name} success for "${keyword}", got ${result.length} results`)
        // 同时搜索官方 API 获取官方 ID，用于歌词获取
        const officialIds = await getOfficialIds(keyword, platform, result)
        return result.map((song, idx) => ({
          ...song,
          platformId: officialIds[idx] || song.id,
          isThirdParty: true
        }))
      }
    } catch {
      continue
    }
  }
  return []
}

// 通过官方 API 搜索获取官方 ID，用于歌词获取
async function getOfficialIds(keyword, platform, songs) {
  const officialIds = []
  try {
    const searchModule = platform === 'QQ音乐' 
      ? await import('./qqmusic.js')
      : await import('./netease.js')
    const searchFn = searchModule.searchSongs
    const results = await searchFn(keyword)
    // 匹配歌曲名称和歌手
    for (const song of songs) {
      const match = results.find(r => 
        r.title === song.title && 
        (r.artist.includes(song.artist.split('/')[0]) || song.artist.includes(r.artist.split('/')[0]))
      )
      officialIds.push(match?.platformId || match?.id || null)
    }
  } catch {
    // 官方 API 搜索失败时返回空
  }
  return officialIds
}
