import axios from 'axios'
import https from 'https'

// 公共请求头
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

// 酷狗 tom/jbsou/90svip 公共解析：POST 表单拿 data[0]，url 为相对地址需拼 base。
// 该 url 是第三方站的 http/https 中转地址，浏览器直连会因混合内容/证书问题失败，
// 故保留中转地址返回，由 song.js 走 /api/proxy/audio 服务端代理（代理会跟随重定向到真实 CDN）
async function parseKugouFormApi(id, baseUrl) {
  const { data } = await axios.post(baseUrl, new URLSearchParams({ input: id, filter: 'id', type: 'kugou', page: '1' }), {
    headers: {
      ...headers,
      Referer: baseUrl,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout: 5000
  })
  const item = data?.data?.[0]
  if (!item?.url) return { url: null }
  return { url: new URL(item.url, baseUrl).href, name: item.name, artist: item.artist, cover: item.cover, lyric: item.lrc }
}

// ==================== 酷狗音乐第三方 API ====================
// 酷狗官方 playInfo 对免费歌曲返回直链，付费（VIP）歌曲 url 为空。
// 以下第三方 API 用于解析 VIP 歌曲的真实播放地址，优先级参考 musicdl 项目：
// l1（svip）：xuanluoge / 317ak；l2（vip）：baka / tom / jbsou / 90svip；l3：cocodownloader / haitangw
export const kugouThirdPartyApis = [
  // xuanluoge：支持多档音质，需忽略 SSL 证书验证
  {
    name: 'xuanluoge-kugou',
    fetch: async (id, quality) => {
      const qMap = { standard: '320', high: 'flac', lossless: 'viper_clear' }
      const { data } = await axios.get('http://118.24.104.108:3456/api.php', {
        params: { miss: 'getMusicUrl', source: 'kugou', id, level: qMap[quality] || 'flac' },
        headers: { ...headers, Referer: 'http://118.24.104.108:3456/' },
        timeout: 5000, httpsAgent: new https.Agent({ rejectUnauthorized: false })
      })
      return { url: data?.data?.[0]?.url }
    }
  },
  // 317ak：需要解密 ckey（base64），br 6=无损 5=高品 3=标准
  {
    name: '317ak-kugou',
    fetch: async (id, quality) => {
      const brMap = { standard: '3', high: '5', lossless: '6' }
      const keys = [
        'charlespikachuUE9WTUhLSklYOEE3SUdIMkZNMVA=',
        'charlespikachuWE1VS0lBSjNQOExQWDNQOTcxS1U=',
        'charlespikachuN0tUSTUyVDdWTE9EUjZTVDM3UFQ='
      ]
      const key = keys[Math.floor(Math.random() * keys.length)]
      const ckey = Buffer.from(key.slice(14), 'base64').toString('utf8')
      const { data } = await axios.get('https://api.317ak.cn/api/yinyue/kugou', {
        params: { ckey, i: id, br: brMap[quality] || '5', type: 'json', lrc: 1 },
        headers, timeout: 5000, httpsAgent: new https.Agent({ rejectUnauthorized: false })
      })
      return { url: data?.url, lyric: data?.lyric, name: data?.songName, artist: data?.artistName, cover: data?.cover }
    }
  },
  // baka：meting 接口，302 重定向到真实音频地址，直接读取 Location 不下载整首
  {
    name: 'baka-kugou',
    fetch: async (id) => {
      const resp = await axios.get(`https://api.baka.plus/meting/?server=kugou&type=url&id=${id}&br=2000`, {
        headers, timeout: 5000, maxRedirects: 0, validateStatus: s => s < 400
      })
      if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
        return { url: resp.headers.location }
      }
      return { url: resp.data?.url }
    }
  },
  // tom：POST 表单解析，返回相对地址需拼域名
  {
    name: 'tom-kugou',
    fetch: async (id) => parseKugouFormApi(id, 'https://music.tom.moe/')
  },
  // jbsou：POST 表单解析
  {
    name: 'jbsou-kugou',
    fetch: async (id) => parseKugouFormApi(id, 'https://www.jbsou.cn/')
  },
  // 90svip：POST 表单解析
  {
    name: '90svip-kugou',
    fetch: async (id) => parseKugouFormApi(id, 'https://music.90svip.cn/')
  },
  // cocodownloader：简单 GET，返回 JSON
  {
    name: 'cocodownloader-kugou',
    fetch: async (id) => {
      const { data } = await axios.get(`https://cocodownloader.markqq.com/api/url?id=${id}&provider=kugou`, {
        headers, timeout: 5000
      })
      return { url: data?.url }
    }
  },
  // haitangw：支持多档音质（hires/lossless/exhigh），作为兜底
  {
    name: 'haitangw-kugou',
    fetch: async (id, quality) => {
      const qMap = { standard: 'exhigh', high: 'lossless', lossless: 'hires' }
      try {
        const { data } = await axios.get('https://musicapi.haitangw.net/kgqq/kg.php', {
          params: { type: 'json', id, level: qMap[quality] || 'lossless' },
          headers, timeout: 5000
        })
        return { url: data?.data?.url }
      } catch {
        const { data } = await axios.get('https://music.haitangw.cc/kgqq/kg.php', {
          params: { type: 'json', id, level: qMap[quality] || 'lossless' },
          headers, timeout: 5000
        })
        return { url: data?.data?.url }
      }
    }
  }
]
