import axios from 'axios'
import { kuwoThirdPartyApis, fetchWithFallback } from './thirdPartyApis.js'

// 酷我音乐 API 配置
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Referer': 'https://www.kuwo.cn/',
  'csrf': '',
  'Cookie': 'kw_token='
}

// 酷我音乐排行榜配置
// 官方 API 需要 kw_token CSRF 认证（浏览器端 JavaScript 生成），服务端无法获取
// 因此通过搜索热门歌手/关键词来模拟获取排行榜歌曲
const CHART_CONFIGS = [
  {
    id: '93',
    name: '酷我热歌榜',
    keywords: ['周杰伦', '林俊杰', '陈奕迅', '邓紫棋', '薛之谦', '毛不易', '华晨宇', '李荣浩', '张学友', '刘德华']
  },
  {
    id: '17',
    name: '酷我新歌榜',
    keywords: ['新歌', '热门新歌', '最新歌曲', '2024新歌', '抖音热歌']
  },
  {
    id: '16',
    name: '酷我飙升榜',
    keywords: ['飙升', '热门飙升', '抖音飙升', '热歌飙升', '飙升榜']
  },
  {
    id: '26',
    name: '酷我欧美榜',
    keywords: ['Taylor Swift', 'Ed Sheeran', 'Adele', 'Billie Eilish', 'The Weeknd']
  },
  {
    id: '22',
    name: '酷我韩语榜',
    keywords: ['BTS', 'BLACKPINK', 'EXO', 'TWICE', 'aespa']
  },
  {
    id: '23',
    name: '酷我日语榜',
    keywords: ['YOASOBI', 'King Gnu', 'Official髭男dism', '米津玄師', 'Ado']
  }
]

// 酷我音乐搜索 API
export async function searchSongs(keyword, limit = 30) {
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

// 获取酷我音乐排行榜
// 通过搜索多个热门关键词来模拟排行榜数据
export async function getToplist() {
  const result = []
  for (const chart of CHART_CONFIGS) {
    try {
      const allSongs = []
      const seen = new Set()
      // 并行搜索多个关键词，提高效率
      const searchResults = await Promise.allSettled(
        chart.keywords.map(kw => searchSongs(kw, 5))
      )
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
        result.push({
          name: chart.name,
          cover: allSongs[0]?.cover || '',
          songs: allSongs.slice(0, 50)
        })
      }
    } catch (e) {
      console.error(`Kuwo chart ${chart.name} error:`, e.message)
    }
  }
  return result.length ? result : null
}

// 格式化时长：秒 -> M:SS
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default { searchSongs, getToplist }
