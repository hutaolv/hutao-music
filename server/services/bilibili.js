import axios from 'axios'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com/',
  'Origin': 'https://www.bilibili.com'
}

const audioHeaders = {
  ...headers,
  'Referer': 'https://www.bilibili.com/audio/am10627',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cookie': 'buvid3=100A8F7B9C4D4E2F9B8A7C6D5E4F3A2Binfoc; b_nut=1700000000; _uuid=1A2B3C4D5E6F7890ABCDEF1234567890'
}

const menus = [
  { sid: 10627, name: '热歌榜' },
  { sid: 10624, name: '新曲推荐' },
  { sid: 10628, name: '原创榜' }
]

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function parseDuration(val) {
  const n = Number(val)
  if (!isNaN(n)) return n
  const parts = String(val).split(':')
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  return 0
}

function formatDurationStr(str) {
  const n = Number(str)
  if (!isNaN(n)) return formatDuration(n)
  const parts = str.split(':')
  if (parts.length === 2) return formatDuration(parseInt(parts[0]) * 60 + parseInt(parts[1]))
  return '0:00'
}

async function fetchAudioMenu(sid, name) {
  const url = `https://api.bilibili.com/audio/music-service-c/web/song/of-menu?sid=${sid}&pn=1&ps=50`
  const res = await fetch(url, {
    headers: audioHeaders,
    signal: AbortSignal.timeout(8000)
  })
  const json = await res.json()
  const items = json?.data?.data || []
  if (!items.length) {
    console.error(`Bilibili audio menu ${name}(${sid}): empty (code=${json.code})`)
    return null
  }
  console.log(`Bilibili audio menu ${name}: ${items.length} songs`)
  return items.map(v => ({
    id: `bilibili_au_${v.id}`,
    platformId: String(v.id),
    title: v.title,
    artist: v.author || v.uname || '未知',
    artistId: v.uid ? `bilibili_artist_${v.uid}` : '',
    album: '',
    cover: v.cover ? `/api/proxy/image?url=${encodeURIComponent(v.cover)}` : '',
    duration: formatDurationStr(v.duration),
    durationMs: (v.duration || 0) * 1000,
    platform: 'B站',
    audioUrl: '',
    vip: false,
    bvid: v.bvid || '',
    aid: v.aid || 0,
    auid: v.id,
    lyricUrl: v.lyric || ''
  }))
}

export async function getToplist() {
  const result = []
  for (const menu of menus) {
    try {
      const songs = await fetchAudioMenu(menu.sid, menu.name)
      if (songs) result.push({ name: menu.name, cover: songs[0]?.cover || '', songs })
    } catch (e) {
      console.error(`Bilibili audio menu ${menu.name}(${menu.sid}): ${e.message}`)
    }
  }
  if (!result.length) {
    console.log('Bilibili audio menus all failed, trying video ranking fallback...')
    try {
      const { data } = await axios.get('https://api.bilibili.com/x/web-interface/ranking/v2', {
        headers,
        params: { type: 3 },
        timeout: 8000
      })
      const items = data?.data?.list || []
      if (items.length) {
        console.log(`Bilibili video ranking fallback OK: ${items.length} songs`)
        const songs = items.map(v => ({
          id: `bilibili_${v.bvid}`,
          platformId: v.bvid,
          title: v.title.replace(/<[^>]*>/g, ''),
          artist: v.owner?.name || '未知',
          artistId: v.owner?.mid ? `bilibili_artist_${v.owner.mid}` : '',
          album: v.tname || '',
          cover: v.pic ? `/api/proxy/image?url=${encodeURIComponent(v.pic)}` : '',
          duration: formatDurationStr(v.duration),
          durationMs: parseDuration(v.duration) * 1000,
          platform: 'B站',
          audioUrl: '',
          vip: false,
          bvid: v.bvid,
          aid: v.aid
        }))
        result.push({ name: 'B站排行榜', cover: songs[0]?.cover || '', songs })
      }
    } catch (e) {
      console.error('Bilibili video ranking fallback:', e.message)
    }
  }
  return result.length ? result : null
}

export async function getSongUrl(auid) {
  if (!auid) return null
  try {
    const res = await axios.get('https://api.bilibili.com/audio/music-service-c/web/url', {
      headers: audioHeaders,
      params: { sid: auid },
      timeout: 8000
    })
    const cdns = res.data?.data?.cdns
    if (cdns?.length) return `/api/proxy/audio?url=${encodeURIComponent(cdns[0])}`
  } catch (e) {
    console.error('Bilibili getSongUrl error:', e.message)
  }
  return null
}

export async function getLyrics(id, lyricUrl) {
  if (lyricUrl) {
    try {
      const res = await axios.get(lyricUrl, { headers, timeout: 8000 })
      return { lyrics: res.data || '', transLyrics: '' }
    } catch (e) {
      console.error('Bilibili lyrics fetch error:', e.message)
    }
  }
  if (id) {
    try {
      const res = await axios.get('https://api.bilibili.com/audio/music-service-c/web/song/info', {
        headers: audioHeaders,
        params: { sid: id },
        timeout: 8000
      })
      const lrcUrl = res.data?.data?.lyric
      if (lrcUrl) {
        const lrc = await axios.get(lrcUrl, { headers, timeout: 8000 })
        return { lyrics: lrc.data || '', transLyrics: '' }
      }
    } catch (e) {
      console.error('Bilibili lyrics info error:', e.message)
    }
  }
  return null
}

export async function search(query) {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/web-interface/search/type', {
      headers,
      params: { search_type: 'video', keyword: query, order: 'click', duration: 0, tids: 3 }
    })
    const items = data?.data?.result || []
    if (!items.length) return []
    console.log(`Bilibili search OK: ${items.length} results`)
    const songs = items.filter(v => v.tag?.includes('音乐') || v.tname === '音乐' || v.title?.includes('音乐')).map(v => ({
      id: `bilibili_${v.bvid}`,
      platformId: v.bvid,
      title: v.title.replace(/<[^>]*>/g, ''),
      artist: v.author || '未知',
      artistId: v.mid ? `bilibili_artist_${v.mid}` : '',
      album: v.tname || '',
      cover: v.pic ? `/api/proxy/image?url=${encodeURIComponent(v.pic)}` : '',
      duration: formatDurationStr(v.duration),
      durationMs: parseDuration(v.duration) * 1000,
      platform: 'B站',
      audioUrl: '',
      vip: false,
      bvid: v.bvid,
      aid: v.aid,
      lyricUrl: ''
    }))
    return songs.length ? songs : []
  } catch (e) {
    console.error('Bilibili search error:', e.message)
    return []
  }
}
