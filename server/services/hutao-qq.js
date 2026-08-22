import axios from 'axios'
import https from 'https'

// 公共请求头
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

// QQ音乐音质映射：standard=320k, high=flac, lossless=flac24bit
const QQ_QUALITY_MAP = { standard: '320k', high: 'flac', lossless: 'flac24bit' }

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
        headers, timeout: 5000, httpsAgent: new https.Agent({ rejectUnauthorized: false })
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
  },

  // ==================== 以下为从 musicdl 补充的新接口 ====================

  // xianyuw：VIP 级，需要 apiKey 参数
  {
    name: 'xianyuw',
    fetch: async (id, quality) => {
      const qMap = { standard: 'standard', high: 'exhigh', lossless: 'lossless' }
      const { data } = await axios.get(`https://apii.xianyuw.cn/api/v1/qq-music-search`, {
        params: { id, key: 'hutao', no_url: 0, br: qMap[quality] || 'exhigh' },
        headers, timeout: 5000
      })
      return { url: data?.data?.url || data?.data?.music }
    }
  },
  // nki：VIP 级，支持歌词
  {
    name: 'nki',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://api.nki.pw/API/music_open_api.php`, {
        params: { mid: id, apikey: 'hutao' },
        headers, timeout: 5000
      })
      return { url: data?.data?.url, lyric: data?.data?.lyric, name: data?.data?.title, artist: data?.data?.singer, cover: data?.data?.cover }
    }
  },
  // hk0：VIP 级
  {
    name: 'hk0',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://api.hk0.cc/api/qqmusic`, {
        params: { mid: id },
        headers, timeout: 5000
      })
      return { url: data?.data?.url, name: data?.data?.title, artist: data?.data?.singer, cover: data?.data?.cover }
    }
  },
  // tang：VIP 级
  {
    name: 'tang',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://tang.api.s01s.cn/music_open_api.php`, {
        params: { mid: id },
        headers, timeout: 5000
      })
      return { url: data?.data?.url, name: data?.data?.title, artist: data?.data?.singer, cover: data?.data?.cover }
    }
  },
  // cyapi：VIP 账号级，支持无损
  {
    name: 'cyapi',
    fetch: async (id, quality) => {
      const qMap = { standard: '128', high: '320', lossless: 'lossless' }
      const { data } = await axios.get(`https://cyapi.top/API/qq_music.php`, {
        params: { apikey: 'hutao', type: 'json', mid: id, quality: qMap[quality] || 'lossless' },
        headers, timeout: 5000
      })
      return { url: data?.url, lyric: data?.lyric, name: data?.songName, artist: data?.artistName, cover: data?.cover }
    }
  },
  // xunhuisi：VIP 账号级
  {
    name: 'xunhuisi',
    fetch: async (id, quality) => {
      const qMap = { standard: '128', high: '320', lossless: 'flac' }
      const { data } = await axios.get(`https://api.xunhuisi.store/API/QQMusic/Song.php`, {
        params: { mid: id, type: 'json', br: qMap[quality] || 'flac' },
        headers, timeout: 5000
      })
      return { url: data?.url, lyric: data?.lrc, name: data?.songName, artist: data?.artistName, cover: data?.cover }
    }
  }
]
