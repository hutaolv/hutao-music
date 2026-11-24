import axios from 'axios'
// 目前只有被注释掉的 xuanluoge / 317ak 两个源用到（需忽略证书校验），
// 保留导入是为了源恢复时取消注释即可直接用，不必再补 import
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
  // 实测（90svip）：无效 hash 也会返回一条形如 api.php?get=url&id=xxx 的地址，
  // 但没有歌名；真歌一定会带 name。不校验就会把死链当成功，
  // 后果是前端拿到播不了的地址，而且这条死链还会写进 10 分钟地址缓存。
  if (!item.name && !item.artist) return { url: null }
  return { url: new URL(item.url, baseUrl).href, name: item.name, artist: item.artist, cover: item.cover, lyric: item.lrc }
}



// 该 cookie 有效期 12 小时，取一次缓存复用；真过期了接口会再回 403，此时刷新重试一次。
// 注意：它返回的中转地址 api.php?get=url... 无需 cookie 即可 302 到酷狗 CDN，服务端代理直接跟即可。
const JBSOU_BASE = 'https://www.jbsou.cn/'
const JBSOU_COOKIE_TTL = 6 * 60 * 60 * 1000
let jbsouCookie = ''
let jbsouCookieAt = 0
let jbsouCookieTask = null

function fetchJbsouCookie() {
  if (jbsouCookie && Date.now() - jbsouCookieAt < JBSOU_COOKIE_TTL) return Promise.resolve(jbsouCookie)
  // 并发场景下只取一次，避免字幕式重复请求
  if (jbsouCookieTask) return jbsouCookieTask
  jbsouCookieTask = axios.get(JBSOU_BASE, { headers, timeout: 5000 })
    .then(({ data }) => {
      const m = String(data).match(/mk_visit=([^;"]+)/)
      if (!m) throw new Error('challenge cookie not found')
      jbsouCookie = `mk_visit=${m[1]}`
      jbsouCookieAt = Date.now()
      return jbsouCookie
    })
    .finally(() => { jbsouCookieTask = null })
  return jbsouCookieTask
}

async function parseJbsouApi(id) {
  const call = async () => {
    const cookie = await fetchJbsouCookie()
    const { data } = await axios.post(JBSOU_BASE, new URLSearchParams({ input: id, filter: 'id', type: 'kugou', page: '1' }), {
      headers: {
        ...headers,
        Cookie: cookie,
        Referer: JBSOU_BASE,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 5000
    })
    return data
  }
  let data = await call()
  if (data?.code === 403) {
    jbsouCookie = ''
    jbsouCookieAt = 0
    data = await call()
  }
  const item = data?.data?.[0]
  if (!item?.url) return { url: null }
  if (!item.name && !item.artist) return { url: null }
  return { url: new URL(item.url, JBSOU_BASE).href, name: item.name, artist: item.artist, cover: item.cover, lyric: item.lrc }
}

// ==================== 酷狗音乐第三方 API ====================
// 酷狗官方 playInfo 对免费歌曲返回直链，付费（VIP）歌曲 url 为空。
// 以下第三方 API 用于解析 VIP 歌曲的真实播放地址。
// 注意：原 musicdl 的分层顺序（l1 xuanluoge/317ak、l2 baka/tom/jbsou/90svip、
// l3 cocodownloader/haitangw）已随源大面积失效而失去意义，现由 jbsou + 90svip 并行兜底。
export const kugouThirdPartyApis = [
  /* ===== 以下 6 个源于 2026-11-24 逐个实测不可用，先注释保留、暂不删除 =====
     xuanluoge        ECONNABORTED 5s（118.24.104.108:3456 端口已关闭，TCP 直连也超时）
     317ak            HTTP 403（nginx 默认拒绝页，疑似 WAF/UA 拦截）
     baka             HTTP 503「Temporarily unavailable」
     tom              POST 405（接口不接受 POST，GET 返回的是首页，接口路径已变）
     cocodownloader   站点公告「线上演示已关闭」
     haitangw         code 201 error（musicapi / music 两个域名均如此）
     接口恢复后把这段外层注释去掉即可复原，无需改动其他代码。
  */
  /*
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
  // jbsou：原实现，直连不带 cookie，会被反爬层 403 拦掉，仅留作记录
  {
    name: 'jbsou-kugou',
    fetch: async (id) => parseKugouFormApi(id, 'https://www.jbsou.cn/')
  },
  */
  // jbsou：站点有 JS 反爬，需先拿 mk_visit cookie；parseJbsouApi 内部处理并缓存
  {
    name: 'jbsou-kugou',
    fetch: async (id) => parseJbsouApi(id)
  },
  // 90svip：实测可用（726ms 拿到 VIP 歌地址）
  // POST 表单解析
  {
    name: '90svip-kugou',
    fetch: async (id) => parseKugouFormApi(id, 'https://music.90svip.cn/')
  },
  /* ===== cocodownloader / haitangw 同上，2026-11-24 实测不可用，注释保留 =====
     cocodownloader   站点公告「线上演示已关闭」
     haitangw         code 201 error（musicapi / music 两个域名均如此）
  */
  /*
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
  */
]
