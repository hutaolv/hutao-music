import axios from 'axios'
import { miguThirdPartyApis, fetchWithFallback } from './thirdPartyApis.js'

const BASE = 'https://app.c.nf.migu.cn'
const SEARCH_BASE = 'http://app.c.nf.migu.cn'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://music.migu.cn/',
  'Origin': 'https://music.migu.cn',
  'Channel': '014X031'
}

const RANK_IDS = [
  { id: '27186466', name: '热歌榜' },
  { id: '27553319', name: '新歌榜' },
  { id: '27553408', name: '原创榜' }
]

function mapSong(item) {
  const s = item.songData ? (typeof item.songData === 'string' ? JSON.parse(item.songData) : item.songData) : item
  return {
    id: `migu_${item.contentId || item.resId || s.contentId || s.songId}`,
    platformId: item.contentId || item.resId || s.contentId || '',
    title: item.txt || item.songName || s.songName || '',
    artist: item.txt2 || s.singerList?.map(si => si.name).join(' / ') || '',
    artistId: s.singerList?.[0]?.id ? `migu_artist_${s.singerList[0].id}` : '',
    album: item.txt3 || s.album || '',
    cover: item.img?.startsWith('http') ? item.img : (s.img1?.startsWith('http') ? s.img1 : `https://d.musicapp.migu.cn${item.img || s.img1 || ''}`),
    duration: formatDuration((s.duration || 0)),
    durationMs: (s.duration || 0) * 1000,
    platform: '咪咕音乐',
    audioUrl: '',
    vip: item.vip === '1' || s.restrictType === 1,
    contentId: item.contentId || item.resId || s.contentId || '',
    copyrightId: item.copyrightId || s.copyrightId || ''
  }
}

export async function getToplist() {
  // 改为并行请求3个排行榜，代替原来串行
  const results = await Promise.allSettled(RANK_IDS.map(rank =>
    axios.get(`${SEARCH_BASE}/bmw/rank/rank-info/v1.0`, {
      headers, params: { pageNo: 1, rankId: rank.id, pageSize: 50 }, timeout: 10000
    }).then(({ data }) => {
      if (data?.code === '000000' && data?.data?.contents?.length) {
        const songs = data.data.contents.map(mapSong)
        return { name: rank.name, cover: data.data.contents[0]?.img || songs[0]?.cover || '', songs }
      }
      return null
    }).catch(e => { console.error(`MiGu rank ${rank.name} error:`, e.message); return null })
  ))
  const result = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
  return result.length ? result : null
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get(`${SEARCH_BASE}/bmw/search/song/v1.0`, {
      headers,
      params: { pageNo: 1, text: keyword },
      timeout: 8000
    })
    const items = data?.data?.items || []
    return items.slice(0, limit).map(item => {
      const s = item.song || item
      return {
        id: `migu_${s.contentId || s.songId}`,
        platformId: s.contentId || '',
        title: s.songName || s.txt || '',
        artist: s.singerList?.map(si => si.name).join(' / ') || s.txt2 || '',
        artistId: s.singerList?.[0]?.id ? `migu_artist_${s.singerList[0].id}` : '',
        album: s.album || s.txt3 || '',
        cover: s.img1?.startsWith('http') ? s.img1 : `https://d.musicapp.migu.cn${s.img1 || ''}`,
        duration: formatDuration(s.duration || 0),
        durationMs: (s.duration || 0) * 1000,
        platform: '咪咕音乐',
        audioUrl: '',
        vip: s.restrictType === 1 || s.showTags?.includes?.('vip'),
        contentId: s.contentId || '',
        copyrightId: s.copyrightId || ''
      }
    })
  } catch (e) {
    console.error('MiGu search error:', e.message)
    return []
  }
}

// 搜索咪咕歌手：用全能搜索接口(search_all.do)一次拿到歌手列表 + 最佳歌手完整信息，
// 其中 bestShowResultData.songCount 才是准确的单曲数（singer/info 的 txt5 是含伴奏/翻唱等全部资源，数字偏大）
export async function searchArtists(keyword, limit = 20) {
  try {
    const { data } = await axios.get('https://pd.musicapp.migu.cn/MIGUM2.0/v1.0/content/search_all.do', {
      headers,
      params: {
        text: keyword,
        pageNo: 1,
        pageSize: 20,
        // 只搜歌手并返回最佳匹配（bestShow），减少无关数据
        searchSwitch: JSON.stringify({ song: 0, album: 0, singer: 1, tagSong: 0, mvSong: 0, songlist: 0, bestShow: 1 })
      },
      timeout: 8000
    })
    const list = data?.singerResultData?.result || []
    const best = data?.bestShowResultData?.result?.[0]
    // 歌手搜索结果无粉丝数，逐个歌手并行请求 singer/info 详情补充（txt4=粉丝数）
    const stats = await Promise.allSettled(list.map(a =>
      axios.get('https://app.c.nf.migu.cn/pc/bmw/singer/info/v1.1', {
        headers,
        params: { singerId: a.id },
        timeout: 8000
      }).then(r => {
        const contents = r.data?.data?.contents || []
        for (const c of contents) {
          if (c.view === 'ZJ-SingerDetail-Scroll') {
            return { fans: c.contents?.[0]?.txt4 || '' }
          }
        }
        return {}
      })
    ))
    return list.slice(0, limit).map((a, i) => {
      const st = stats[i]?.status === 'fulfilled' ? stats[i].value : {}
      // 只有最佳歌手（bestShow）有准确的单曲数/头像/地区，其余歌手取不到则留空
      const isBest = best && String(best.id) === String(a.id)
      return {
        id: `migu_artist_${a.id}`,
        platformId: a.id,
        name: a.name || best?.singerName || '',
        avatar: isBest ? best.singerPicUrl?.[0]?.img || '' : '',
        region: isBest ? best.singerArea || '未知' : '未知',
        genre: '未知',
        fans: Number(st.fans) || 0,
        songCount: isBest ? Number(best.songCount) || 0 : 0,
        platform: '咪咕音乐'
      }
    })
  } catch (e) {
    console.error('MiGu artist search error:', e.message)
    return []
  }
}

// 获取咪咕歌手歌曲：使用咪咕官方歌手歌曲接口（app.c.nf.migu.cn），
// 支持分页（pageNo），每页 50 首；hasMore 依据接口返回的 nextPageUrl 判断
export async function getArtistSongs(singerId, artistName, pageNo = 1) {
  if (!singerId) return { songs: [], hasMore: false }
  try {
    const { data } = await axios.get('https://app.c.nf.migu.cn/pc/bmw/singer/song/v1.0', {
      headers,
      params: { pageNo, singerId, type: 1 },
      timeout: 8000
    })
    const contents = data?.data?.contents || []
    let items = []
    for (const c of contents) {
      if (c.view === 'ZJ-Singer-Song-Scroll') {
        items = (c.contents || []).filter(x => x.view === 'ZJ-Singer-Song-Item')
        break
      }
    }
    const songs = items.map(item => {
      const s = item.songItem || item
      return {
        id: `migu_${s.contentId || item.resId}`,
        platformId: s.contentId || item.resId || '',
        title: s.songName || item.txt || '',
        artist: s.singerList?.map(si => si.name).join(' / ') || item.txt2 || '',
        artistId: s.singerList?.[0]?.id ? `migu_artist_${s.singerList[0].id}` : '',
        album: s.album || item.txt3 || '',
        cover: (s.img1?.startsWith('http') ? s.img1 : `https://d.musicapp.migu.cn${s.img1 || item.img || ''}`),
        duration: formatDuration(s.duration || 0),
        durationMs: (s.duration || 0) * 1000,
        platform: '咪咕音乐',
        audioUrl: '',
        vip: s.showTags?.includes?.('vip') || s.restrictType === 1,
        contentId: s.contentId || '',
        copyrightId: s.copyrightId || ''
      }
    })
    // 存在 nextPageUrl 说明还有下一页
    return { songs, hasMore: !!data?.data?.header?.nextPageUrl }
  } catch (e) {
    console.error('MiGu artist songs error:', e.message)
    return { songs: [], hasMore: false }
  }
}

// 咪咕音质档位映射：PQ=标准 HQ=高音质 SQ=无损（HQ/SQ 一般需要会员，获取失败时由路由回退标准）
const TONE_MAP = { standard: 'PQ', high: 'HQ', lossless: 'SQ' }

export async function getSongUrl(contentId, copyrightId, quality = 'standard') {
  // 1. 先尝试官方 API
  try {
    const { data } = await axios.get(`${BASE}/MIGUM3.0/strategy/pc/listen/v1.0`, {
      headers,
      params: { contentId, copyrightId, resourceType: '2', toneFlag: TONE_MAP[quality] || 'PQ' },
      timeout: 10000
    })
    if (data?.code === '000000' && data?.data?.url) {
      return data.data.url
    }
  } catch (e) {
    console.error('MiGu official API error:', e.message)
  }

  // 2. 官方 API 失败时，使用第三方 API
  console.log(`[MiGu] Official API failed for ${contentId}, trying third-party APIs...`)
  const result = await fetchWithFallback(miguThirdPartyApis, contentId, quality)
  return result?.url || null
}

// 探测歌曲可用音质：接口返回 dialogInfo（如"会员专属音质，请先登录"）视为该音质不可用
export async function detectQualities(contentId, copyrightId) {
  const result = []
  try {
    const probes = [
      { q: 'lossless', tone: 'SQ' },
      { q: 'high', tone: 'HQ' },
      { q: 'standard', tone: 'PQ' }
    ]
    for (const p of probes) {
      const { data } = await axios.get(`${BASE}/MIGUM3.0/strategy/pc/listen/v1.0`, {
        headers,
        params: { contentId, copyrightId, resourceType: '2', toneFlag: p.tone },
        timeout: 10000
      })
      const d = data?.data
      if (data?.code === '000000' && d && !d.dialogInfo) {
        result.push(p.q)
      }
    }
  } catch (e) {
    console.error('MiGu detect qualities error:', e.message)
  }
  return result.length ? result : ['standard']
}

export async function getLyrics(contentId) {
  try {
    const { data } = await axios.get(`${BASE}/resource/song/by-contentids/v2.0`, {
      headers,
      params: { contentId },
      timeout: 8000
    })
    if (data?.code === '000000' && data?.data?.[0]?.lrcUrl) {
      const lrcUrl = data.data[0].lrcUrl
      const { data: lrcContent } = await axios.get(lrcUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000
      })
      return { lyrics: lrcContent, transLyrics: '' }
    }
    return null
  } catch (e) {
    console.error('MiGu lyrics error:', e.message)
    return null
  }
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
