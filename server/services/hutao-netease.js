import axios from 'axios'
import https from 'https'

// 公共请求头
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

// 音质映射：standard=标准, high=高音质, lossless=无损
const QUALITY_MAP = { standard: 'standard', high: 'exhigh', lossless: 'lossless' }

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
        headers, timeout: 5000, httpsAgent: new https.Agent({ rejectUnauthorized: false })
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
        headers, timeout: 5000, httpsAgent: new https.Agent({ rejectUnauthorized: false })
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
        { headers: { ...headers, 'Referer': 'https://ncm.kangqiovo.com/' }, timeout: 5000, httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
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
