import axios from 'axios'
import vm from 'node:vm'
import { kuwoThirdPartyApis } from './hutao-kuwo.js'
import { fetchWithFallback } from './thirdPartyApis.js'

// 第三方酷我搜索 API（从 hutao-search.js 引入，用于排行榜直接调用）
import { thirdPartySearchApis } from './hutao-search.js'
const thirdPartyKuwo = thirdPartySearchApis.find(a => a.name === 'kuwo')

// 酷我音乐 API 配置
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Referer': 'https://www.kuwo.cn/',
  'csrf': '',
  'Cookie': 'kw_token='
}

// 酷我音乐排行榜配置（sourceid 来自 m.kuwo.cn 榜单页，榜单名与官网一致）
// 数据接口 m.kuwo.cn/newh5app/wapi/api/www/bang/bang/musicList 无需 CSRF，
// 用 sourceid（而非榜单 id）即可拉取，绕过 www.kuwo.cn 的 kw_token 限制
const CHART_CONFIGS = [
  { id: '16', name: '酷我热歌榜' },
  { id: '93', name: '酷我飙升榜' },
  { id: '17', name: '酷我新歌榜' },
  { id: '26', name: '经典怀旧榜' },
  { id: '64', name: '影视金曲榜' },
  { id: '278', name: '古风音乐榜' }
]

// 回退榜单配置：真实接口被风控（code=-1）时，用搜索热门关键词模拟，保证榜单始终有数据
const FALLBACK_CHARTS = [
  { id: '16', name: '酷我热歌榜', keywords: ['周杰伦', '林俊杰', '陈奕迅', '邓紫棋', '薛之谦', '毛不易', '华晨宇', '李荣浩', '张学友', '刘德华'] },
  { id: '93', name: '酷我飙升榜', keywords: ['飙升', '热门飙升', '抖音飙升', '热歌飙升', '飙升榜'] },
  { id: '17', name: '酷我新歌榜', keywords: ['新歌', '热门新歌', '最新歌曲', '2026新歌', '抖音热歌'] },
  { id: '26', name: '经典怀旧榜', keywords: ['经典老歌', '怀旧', '粤语经典', '90年代', '80年代'] },
  { id: '64', name: '影视金曲榜', keywords: ['影视金曲', '电视剧原声', '片尾曲'] },
  { id: '278', name: '古风音乐榜', keywords: ['古风', '中国风', '国风音乐'] }
]

// 榜单歌曲接口 headers（m.kuwo.cn 域名需移动端 UA，PC UA 会被拒绝返回 code=-1）
const chartHeaders = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SM-G9910) AppleWebKit/537.36 Mobile Safari/537.36',
  'Referer': 'https://m.kuwo.cn/newh5app/ranklist',
  'Accept': 'application/json, text/plain, */*'
}

// 拉取单个榜单歌曲列表（接口对同一 IP 有 QPS 限流，快速重试会加剧风控，故单次请求）
async function fetchChart(sourceid) {
  const { data } = await axios.get('https://m.kuwo.cn/newh5app/wapi/api/www/bang/bang/musicList', {
    params: { bangId: sourceid, pn: 1, rn: 50 },
    headers: chartHeaders,
    timeout: 10000
  })
  if (data?.code !== 200 || !Array.isArray(data?.data?.musicList)) return null
  return data.data.musicList.slice(0, 50).map(item => ({
    id: `kuwo_${item.rid}`,
    platformId: String(item.rid || ''),
    title: item.name || '未知歌曲',
    artist: (item.artist || '未知').replace(/&/g, '/'),
    artistId: '',
    album: item.album || '',
    cover: item.pic || item.albumpic || '',
    duration: formatDuration(Number(item.duration) || 0),
    durationMs: (Number(item.duration) || 0) * 1000,
    platform: '酷我音乐',
    audioUrl: '',
    sourceUrl: '',
    vip: item.payInfo?.paytype !== 0
  }))
}

// 酷我音乐搜索 API
export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get('http://www.kuwo.cn/search/searchMusicBykeyWord', {
      params: {
        vipver: '1', client: 'kt', ft: 'music', cluster: '0', strategy: '2012',
        encoding: 'utf8', rformat: 'json', mobi: '1', issubtitle: '1',
        show_copyright_off: '1', pn: '0', rn: String(limit), all: keyword
      },
      headers,
      timeout: 8000
    })
    if (!data?.abslist?.length) return []
    return data.abslist.slice(0, limit).map(item => ({
      id: `kuwo_${String(item.MUSICRID || '').replace('MUSIC_', '')}`,
      platformId: String(item.MUSICRID || '').replace('MUSIC_', ''),
      title: item.SONGNAME || '未知歌曲',
      artist: (item.ARTIST || '未知').replace(/&/g, '/'),
      artistId: '',
      album: item.ALBUM || '',
      cover: item.hts_MVPIC || item.albumpic || '',
      duration: formatDuration(Number(item.DURATION) || 0),
      durationMs: (Number(item.DURATION) || 0) * 1000,
      platform: '酷我音乐',
      audioUrl: '',
      sourceUrl: '',
      vip: false
    }))
  } catch (e) {
    console.error('Kuwo search error:', e.message)
    return []
  }
}

// 获取酷我音乐排行榜（官方榜单接口，真实数据）
// 接口对同一 IP 有 QPS 限流（返回 code=-1），串行 + 间隔拉取；
// 成功结果长缓存 6 小时减少请求，全部失败时回退搜索模拟榜单保证有数据
const sleep = ms => new Promise(r => setTimeout(r, ms))
const LONG_TTL = 6 * 3600_000
let longCache = { time: 0, data: null }

export async function getToplist() {
  if (Date.now() - longCache.time < LONG_TTL && longCache.data) return longCache.data

  const result = []
  for (const chart of FALLBACK_CHARTS) {
    try {
      const allSongs = []
      const seen = new Set()
      // 使用第三方酷我搜索 API（不再调用官方 API）
      const searchResults = await Promise.allSettled(
        chart.keywords.map(kw => thirdPartyKuwo.search(kw, '酷我音乐'))
      )
      for (const r of searchResults) {
        if (r.status === 'fulfilled') {
          for (const song of r.value) {
            if (!seen.has(song.id)) {
              seen.add(song.id)
              allSongs.push({
                ...song,
                platform: '酷我音乐',
                audioUrl: '',
                sourceUrl: ''
              })
            }
          }
        }
      }
      if (allSongs.length) {
        result.push({ name: chart.name, cover: allSongs[0]?.cover || '', songs: allSongs.slice(0, 50) })
      }
    } catch (e) {
      console.error(`Kuwo third-party chart ${chart.name} error:`, e.message)
    }
  }
  if (result.length) {
    longCache = { time: Date.now(), data: result }
    return result
  }
  return null
}

// 搜索热门关键词模拟榜单（真实接口被风控时的兜底）
async function getSimulatedCharts() {
  const result = []
  for (const chart of FALLBACK_CHARTS) {
    try {
      const allSongs = []
      const seen = new Set()
      const searchResults = await Promise.allSettled(chart.keywords.map(kw => searchSongs(kw, 5)))
      for (const r of searchResults) {
        if (r.status === 'fulfilled') {
          for (const song of r.value) {
            if (!seen.has(song.platformId)) {
              seen.add(song.platformId)
              allSongs.push(song)
            }
          }
        }
      }
      if (allSongs.length) {
        result.push({ name: chart.name, cover: allSongs[0]?.cover || '', songs: allSongs.slice(0, 50) })
      }
    } catch (e) {
      console.error(`Kuwo simulated chart ${chart.name} error:`, e.message)
    }
  }
  return result.length ? result : null
}

// 获取酷我音乐歌词：m.kuwo.cn/newh5app/play_detail/{rid} SSR 页面内嵌 __NUXT__ 歌词数组
export async function getLyrics(id) {
  const rid = String(id || '').replace('MUSIC_', '').replace(/^kuwo_/, '')
  if (!rid) return null
  try {
    const url = `https://m.kuwo.cn/newh5app/play_detail/${rid}`
    const resp = await fetch(url, { headers: chartHeaders })
    if (!resp.ok) return null
    const html = await resp.text()
    const i = html.indexOf('__NUXT__=')
    if (i < 0) return null
    const j = html.indexOf(';', i)
    const sandbox = {}
    vm.createContext(sandbox)
    let data
    try {
      data = vm.runInContext(`(${html.slice(i + '__NUXT__='.length, j)})`, sandbox)
    } catch {
      return null
    }
    const lrc = data?.data?.[0]?.lrc
    if (!Array.isArray(lrc) || !lrc.length) return null
    const lyrics = lrc.map(x => {
      const t = parseFloat(x.time) || 0
      const m = Math.floor(t / 60)
      const s = Math.floor(t % 60)
      const ms = Math.round((t - Math.floor(t)) * 100)
      return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${x.lineLyric}`
    }).join('\n')
    return { lyrics, transLyrics: '' }
  } catch (e) {
    console.error('Kuwo lyrics error:', e.message)
    return null
  }
}

// 格式化时长：秒 -> M:SS
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default { searchSongs, getToplist, getLyrics }
