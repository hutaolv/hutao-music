import axios from 'axios'

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

export async function getSongUrl(contentId, copyrightId) {
  try {
    const { data } = await axios.get(`${BASE}/MIGUM3.0/strategy/pc/listen/v1.0`, {
      headers,
      params: { contentId, copyrightId, resourceType: '2', toneFlag: 'PQ' },
      timeout: 10000
    })
    if (data?.code === '000000' && data?.data?.url) {
      return data.data.url
    }
    return null
  } catch (e) {
    console.error('MiGu song URL error:', e.message)
    return null
  }
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
