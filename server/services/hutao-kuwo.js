import axios from 'axios'

// 公共请求头
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

// ==================== 酷我音乐第三方 API ====================
// 音质映射：standard=128k, high=320k, lossless=flac
const KUWO_QUALITY_MAP = { standard: '128kmp3', high: '320kmp3', lossless: '2000kflac' }
export { KUWO_QUALITY_MAP }

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
