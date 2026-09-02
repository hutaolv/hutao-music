import axios from 'axios'
import { log } from '../logger.js'

// 公共请求头
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

// 将秒数转换为 "M:SS" 格式的时长字符串，供前端进度条使用
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

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
        cover: item.PIC || item.ALBUMPIC || ''
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
        cover: item.album?.mid ? `https://y.qq.com/music/photo_new/T002R300x300M000${item.album.mid}.jpg` : ''
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
// 参数：keyword - 搜索关键词，platform - 目标平台（QQ音乐/网易云音乐等）
// 根据选择的平台优先使用对应的搜索 API
// 返回：包含 title、artist、album、duration、platformId（官方ID，用于歌词）、isThirdParty 标识的歌曲数组
// 参数：keyword - 搜索关键词，platform - 目标平台，ip - 客户端IP（日志埋点用）
export async function searchWithThirdParty(keyword, platform, ip) {
  // 根据平台调整搜索 API 优先级：选择哪个平台就优先用那个平台的搜索接口
  const apiMap = {
    'QQ音乐': ['qq-official', 'kuwo', 'netease-meting'],
    '网易云音乐': ['netease-meting', 'qq-official', 'kuwo']
  }
  const order = apiMap[platform] || ['kuwo', 'qq-official', 'netease-meting']
  // 按平台指定的顺序排列 API
  const apis = order.map(name => thirdPartySearchApis.find(a => a.name === name)).filter(Boolean)
  // 补充未在 order 中列出的 API
  for (const api of thirdPartySearchApis) {
    if (!apis.includes(api)) apis.push(api)
  }
  for (const api of apis) {
    try {
      const result = await Promise.race([
        api.search(keyword, platform),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ])
      if (result?.length) {
        log(`[${ip || '-'}] [ThirdParty] search ${api.name} success for "${keyword}", got ${result.length} results`)
        // 同时搜索官方 API 获取官方 ID 与时长，用于歌词获取和时长回填
        const officialIds = await getOfficialIds(keyword, platform, result)
        // 第三方搜索源的平台：kuwo 返回的是目标平台标签，实际资源来自酷我
        const sourcePlatform = api.name === 'kuwo' ? '酷我音乐' : api.name === 'qq-official' ? 'QQ音乐' : '网易云音乐'
        // 官方 ID 来自哪个平台，请求播放/歌词就按哪个平台走，避免用网易云ID去酷狗查询
        const officialPlatform = platform === 'QQ音乐' ? 'QQ音乐' : '网易云音乐'
        return result.map((song, idx) => {
          // getOfficialIds 返回 { id, duration } 对象数组
          const matched = officialIds[idx] || {}
          const officialId = matched.id || null
          return {
            ...song,
            // platform 统一设为目标平台标签，确保前端过滤正确
            platform: platform || song.platform,
            // realPlatform 记录真实资源来源，前端请求播放/歌词时使用
            realPlatform: officialId ? officialPlatform : sourcePlatform,
            platformId: officialId || song.id,
            // meting 等第三方源不返回时长（写死 0:00）：用官方搜索匹配到的真实时长回填
            duration: (!song.duration || song.duration === '0:00') && matched.duration
              ? matched.duration
              : song.duration,
            isThirdParty: true
          }
        })
      }
    } catch {
      continue
    }
  }
  return []
}

// 通过官方 API 搜索获取官方 ID 与真实时长：ID 用于歌词获取，
// 时长用于回填（meting 等第三方源不返回时长，写死 0:00）
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
      // 同时携带官方匹配到的时长，供调用方回填
      officialIds.push({
        id: match?.platformId || match?.id || null,
        duration: match?.duration || null
      })
    }
  } catch {
    // 官方 API 搜索失败时返回空
  }
  return officialIds
}
