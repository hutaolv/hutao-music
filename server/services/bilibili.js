import axios from 'axios'

// 轮换使用的浏览器 UA 列表，降低被识别为同一爬虫的概率
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
]

// 生成指定长度的随机十六进制字符串（用于构造设备指纹）
function randomHex(len) {
  let s = ''
  for (let i = 0; i < len; i++) s += '0123456789ABCDEF'[Math.floor(Math.random() * 16)]
  return s
}

// 每次调用生成一组全新的设备指纹 Cookie（buvid3/buvid4/_uuid 等）+ 随机 UA，
// 让每个请求都像是来自不同访客，避免 B 站按固定指纹/IP 高频触发 412 风控
function buildBiliHeaders(referer) {
  const now = Math.floor(Date.now() / 1000)
  return {
    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    'Referer': referer,
    'Origin': 'https://www.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cookie': [
      `buvid3=${randomHex(32)}infoc`,
      `buvid4=${randomHex(32)}infoc`,
      `b_nut=${now}`,
      `_uuid=${randomHex(32)}`,
      `b_lsid=${randomHex(8)}`,
      `b_magic=${randomHex(32)}`
    ].join('; ')
  }
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
    headers: buildBiliHeaders('https://www.bilibili.com/audio/am10627'),
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
  // 改为并行请求3个音频菜单，代替原来串行
  const results = await Promise.allSettled(menus.map(m =>
    fetchAudioMenu(m.sid, m.name).then(songs => songs ? { name: m.name, cover: songs[0]?.cover || '', songs } : null)
  ))
  const result = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)

  if (!result.length) {
    console.log('Bilibili audio menus all failed, trying video ranking fallback...')
    try {
      const { data } = await axios.get('https://api.bilibili.com/x/web-interface/ranking/v2', {
        headers: buildBiliHeaders('https://www.bilibili.com/'),
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

// 搜索 B 站 UP 主作为"歌手"（bili_user 类型），头像经 /api/proxy/image 代理加载
export async function searchArtists(keyword, limit = 20) {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/web-interface/search/type', {
      headers: buildBiliHeaders(`https://www.bilibili.com/search?keyword=${encodeURIComponent(keyword)}`),
      params: { search_type: 'bili_user', keyword },
      timeout: 8000
    })
    const items = data?.data?.result || []
    if (!items.length) return []
    return items.slice(0, limit).map(u => ({
      id: `bilibili_artist_${u.mid}`,
      platformId: String(u.mid),
      name: u.uname || '',
      avatar: u.upic ? `/api/proxy/image?url=${encodeURIComponent('https:' + u.upic)}` : '',
      region: '未知',
      genre: '未知',
      fans: u.fans || 0,
      songCount: u.videos || 0,
      platform: 'B站'
    }))
  } catch (e) {
    console.error('Bilibili artist search error:', e.message)
    return []
  }
}

// 获取指定 UP 主（uid）在音频馆上传的作品。
// 通过 audio/music-service/web/song/upper 拉取音频列表，再用 song/info 并行补充时长与歌词
// 获取 B站歌手歌曲：音频区接口 song/upper 支持 pn(页)/ps(每页) 分页，
// 返回的 pagecount 用于判断是否还有下一页
export async function getArtistSongs(artistId, artistName, page = 1) {
  const uid = artistId || ''
  if (!uid) return { songs: [], hasMore: false }
  try {
    const res = await axios.get('https://api.bilibili.com/audio/music-service/web/song/upper', {
      headers: buildBiliHeaders('https://www.bilibili.com/audio/am10627'),
      params: { uid, pn: page, ps: 20 },
      timeout: 8000
    })
    const d = res.data?.data || {}
    const list = d.data || []
    if (!list.length) return { songs: [], hasMore: false }
    // 并行补充时长信息
    const enriched = await Promise.allSettled(list.map(v =>
      axios.get('https://api.bilibili.com/audio/music-service-c/web/song/info', {
        headers: buildBiliHeaders('https://www.bilibili.com/audio/am10627'),
        params: { sid: v.id },
        timeout: 8000
      }).then(r => r.data?.data)
    ))
    const songs = list.map((v, i) => {
      const info = enriched[i]?.status === 'fulfilled' ? enriched[i].value : null
      const duration = info?.duration || v.duration || 0
      return {
        id: `bilibili_au_${v.id}`,
        platformId: String(v.id),
        title: v.title || '',
        artist: info?.author || v.uname || '未知',
        artistId: `bilibili_artist_${v.uid || uid}`,
        album: '',
        cover: v.cover ? `/api/proxy/image?url=${encodeURIComponent(v.cover)}` : '',
        duration: formatDuration(duration),
        durationMs: (duration || 0) * 1000,
        platform: 'B站',
        audioUrl: '',
        vip: false,
        bvid: v.bvid || '',
        aid: v.aid || 0,
        auid: v.id,
        lyricUrl: info?.lyric || v.lyric || ''
      }
    })
    // pagecount 为总页数，当前页小于总页数则还有下一页
    return { songs, hasMore: page < (d.pagecount || 1) }
  } catch (e) {
    console.error('Bilibili artist songs error:', e.message)
    return { songs: [], hasMore: false }
  }
}

export async function getSongUrl(auid) {
  if (!auid) return null
  try {
    const res = await axios.get('https://api.bilibili.com/audio/music-service-c/web/url', {
      headers: buildBiliHeaders('https://www.bilibili.com/audio/am10627'),
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
      const res = await axios.get(lyricUrl, { headers: buildBiliHeaders('https://www.bilibili.com/audio/am10627'), timeout: 8000 })
      return { lyrics: res.data || '', transLyrics: '' }
    } catch (e) {
      console.error('Bilibili lyrics fetch error:', e.message)
    }
  }
  if (id) {
    try {
      const res = await axios.get('https://api.bilibili.com/audio/music-service-c/web/song/info', {
        headers: buildBiliHeaders('https://www.bilibili.com/audio/am10627'),
        params: { sid: id },
        timeout: 8000
      })
      const lrcUrl = res.data?.data?.lyric
      if (lrcUrl) {
        const lrc = await axios.get(lrcUrl, { headers: buildBiliHeaders('https://www.bilibili.com/audio/am10627'), timeout: 8000 })
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
      headers: buildBiliHeaders(`https://www.bilibili.com/search?keyword=${encodeURIComponent(query)}`),
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
