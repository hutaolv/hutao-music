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
    // 用音乐区视频搜索按作者聚合出"歌手"：保证每个歌手都有可播放的音乐作品，
    // 避免 bili_user 搜出的有声书/影视 UP 主（无音乐作品）混入歌手列表
    const songs = await search(keyword)
    if (!songs.length) return []
    const map = new Map()
    for (const s of songs) {
      if (!s.artist || s.artist === '未知') continue
      const artistId = s.artistId || `bilibili_artist_${s.artist}`
      if (!map.has(artistId)) {
        map.set(artistId, {
          id: artistId,
          platformId: String(artistId.replace('bilibili_artist_', '')),
          name: s.artist,
          avatar: s.cover,
          region: '音乐区',
          genre: '翻唱/原创',
          fans: 0,
          songCount: 0,
          platform: 'B站'
        })
      }
    }
    const artists = [...map.values()].slice(0, limit)
    // 并发查询每个作者的音频馆真实作品数（totalSize）作为"单曲"数量，
    // 与歌手详情页 getArtistSongs 展示的数量保持一致；音频馆为空时置 0（前端退回地区/流派）
    await Promise.allSettled(artists.map(async (a) => {
      const uid = a.platformId
      if (!uid) { a.songCount = 0; return }
      try {
        const res = await axios.get('https://api.bilibili.com/audio/music-service/web/song/upper', {
          headers: buildBiliHeaders('https://www.bilibili.com/audio/am10627'),
          params: { uid, pn: 1, ps: 50 },
          timeout: 8000
        })
        a.songCount = res.data?.data?.totalSize || 0
      } catch {
        a.songCount = 0
      }
    }))
    return artists
  } catch (e) {
    console.error('Bilibili artist search error:', e.message)
    return []
  }
}

// 获取指定 UP 主（uid）在音频馆上传的作品。
// 通过 audio/music-service/web/song/upper 拉取音频列表，再用 song/info 并行补充时长与歌词
// 获取 B站歌手歌曲：音频区接口 song/upper 支持 pn(页)/ps(每页) 分页（每页 50 条），
// 返回的 pagecount 用于判断是否还有下一页
export async function getArtistSongs(artistId, artistName, page = 1) {
  const uid = artistId || ''
  if (!uid) return { songs: [], hasMore: false }
  try {
    const res = await axios.get('https://api.bilibili.com/audio/music-service/web/song/upper', {
      headers: buildBiliHeaders('https://www.bilibili.com/audio/am10627'),
      params: { uid, pn: page, ps: 50 },
      timeout: 8000
    })
    const d = res.data?.data || {}
    const list = d.data || []
    // 音频馆无作品时，回退到按 UP 主名搜索音乐区视频（tids=3 + typeid 白名单），
    // 按作者名过滤，保证歌手详情页有内容可看
    if (!list.length) {
      if (artistName && page <= 1) {
        const videoSongs = await search(artistName)
        const filtered = videoSongs.filter(s => s.artist === artistName || s.artist.includes(artistName))
        console.log(`Bilibili artist fallback: ${filtered.length} video songs for ${artistName}`)
        return { songs: filtered, hasMore: false }
      }
      return { songs: [], hasMore: false }
    }
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

// 获取 B站视频歌曲的真实音频：搜索到的音乐视频没有音频馆 sid，
// 按 bvid 拿 cid 后请求 playurl 的 dash 音频流，经代理播放（带 Referer 防盗链）
export async function getVideoUrl(bvid) {
  if (!bvid) return null
  try {
    const view = await axios.get('https://api.bilibili.com/x/web-interface/view', {
      headers: buildBiliHeaders(`https://www.bilibili.com/video/${bvid}`),
      params: { bvid },
      timeout: 8000
    })
    const cid = view.data?.data?.cid
    if (!cid) return null
    const pl = await axios.get('https://api.bilibili.com/x/player/playurl', {
      headers: buildBiliHeaders(`https://www.bilibili.com/video/${bvid}`),
      params: { bvid, cid, fnval: 16, fourk: 1 },
      timeout: 8000
    })
    const baseUrl = pl.data?.data?.dash?.audio?.[0]?.baseUrl
    if (baseUrl) return `/api/proxy/audio?url=${encodeURIComponent(baseUrl)}`
  } catch (e) {
    console.error('Bilibili getVideoUrl error:', e.message)
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
    // 搜索到的视频歌曲没有音频馆 sid：按 bvid 取 cid 后把视频弹幕转成 LRC 歌词（尽力而为）
    try {
      const view = await axios.get('https://api.bilibili.com/x/web-interface/view', {
        headers: buildBiliHeaders(`https://www.bilibili.com/video/${id}`),
        params: { bvid: id },
        timeout: 8000
      })
      const cid = view.data?.data?.cid
      if (cid) {
        const dm = await axios.get('https://api.bilibili.com/x/v1/dm/list.so', {
          headers: buildBiliHeaders(`https://www.bilibili.com/video/${id}`),
          params: { oid: cid },
          timeout: 8000,
          responseType: 'text'
        })
        const xml = typeof dm.data === 'string' ? dm.data : Buffer.from(dm.data).toString('utf8')
        const lines = []
        const re = /<d p="([^"]*)">([\s\S]*?)<\/d>/g
        let m
        while ((m = re.exec(xml))) {
          const t = parseFloat(m[1].split(',')[0])
          const text = m[2].replace(/&[^;]+;/g, '').trim()
          if (!text) continue
          const mm = Math.floor(t / 60)
          const ss = Math.floor(t % 60)
          const ms = Math.round((t - Math.floor(t)) * 100)
          lines.push(`[${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${text}`)
        }
        if (lines.length) return { lyrics: lines.join('\n'), transLyrics: '' }
      }
    } catch (e) {
      console.error('Bilibili danmaku lyrics error:', e.message)
    }
  }
  return null
}

// B站音乐分区 typeid 白名单（3=音乐主区，28音乐综合/29现场/30VOCALOID/31翻唱/59演奏/62MV/193教学/224原创/244说唱），
// 过滤掉混入的影视(243)、资讯(130)等非音乐视频；接口返回的 typeid 是字符串，白名单用字符串比较
const MUSIC_TIDS = new Set(['3', '28', '29', '30', '31', '59', '62', '193', '224', '244'])

// 全站搜索（scope=all）时保留的音乐特征词：视频可能发布在非音乐分区，但内容属于音乐
// 注：目前 scope=all 不过滤，以下逻辑仅在需要时启用

// B站搜索单页大小（接口支持最大 50）
const BILI_PAGE_SIZE = 50

export async function search(query, scope = 'music', page = 1) {
  try {
    // scope=music 限定音乐分区（tids=3），结果按音乐分区白名单过滤；
    // scope=all 去掉分区限定做全站视频搜索，结果不过滤，直接全部返回
    // page 支持翻页，配合前端"加载更多"（每页 50 条）
    const params = { search_type: 'video', keyword: query, order: 'click', duration: 0, page, page_size: BILI_PAGE_SIZE }
    if (scope === 'music') params.tids = 3
    const { data } = await axios.get('https://api.bilibili.com/x/web-interface/search/type', {
      headers: buildBiliHeaders(`https://www.bilibili.com/search?keyword=${encodeURIComponent(query)}`),
      params
    })
    const items = data?.data?.result || []
    if (!items.length) return { songs: [], hasMore: false }
    console.log(`Bilibili search OK: ${items.length} results (scope=${scope}, page=${page})`)
    // 分区搜索只保留音乐分区白名单；全站搜索不过滤，全部返回
    const kept = scope === 'all' ? items : items.filter(v => MUSIC_TIDS.has(v.typeid))
    const songs = kept
      .map(v => ({
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
    // 用接口返回的总结果数判断是否还有下一页
    const total = Number(data.data?.numResults) || items.length
    return { songs, hasMore: page * BILI_PAGE_SIZE < total }
  } catch (e) {
    console.error('Bilibili search error:', e.message)
    return { songs: [], hasMore: false }
  }
}
