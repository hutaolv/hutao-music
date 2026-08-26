import axios from 'axios'
import crypto from 'crypto'

// B站图床支持 @WxH.webp 后缀：服务端按需缩放并转 WebP 格式，
// 比原图 JPEG 体积更小。已带尺寸后缀的不重复处理
function biliThumb(picUrl) {
  if (!picUrl) return ''
  return picUrl.includes('@') ? picUrl : `${picUrl}@500w_500h.webp`
}

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
  { sid: 10628, name: '原创榜' },
  { sid: 109568, name: '入站曲' },
  { sid: 48955, name: '日语歌' },
  { sid: 87556, name: '流行曲' }
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
      cover: v.cover ? `/api/proxy/image?url=${encodeURIComponent(biliThumb(v.cover))}` : '',
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

export async function getToplist(order, sublistIndex) {
  // 无 sublistIndex：只返回元数据
  if (sublistIndex == null) {
    return [...menus.map(m => ({ name: m.name, cover: '', songs: [] })), { name: 'B站排行榜', cover: '', songs: [] }]
  }

  // 有 sublistIndex：只拉该菜单的歌曲
  const allMenus = [...menus, { sid: null, name: 'B站排行榜' }]
  const idx = Math.min(sublistIndex, allMenus.length - 1)
  const menu = allMenus[idx]
  const result = allMenus.map(m => ({ name: m.name, cover: '', songs: [] }))

  try {
    if (menu.sid) {
      const songs = await fetchAudioMenu(menu.sid, menu.name)
      if (songs) {
        result[idx].songs = songs
        result[idx].cover = songs[0]?.cover || ''
      }
    } else {
      // B站排行榜（视频排行兜底）
      const { data } = await axios.get('https://api.bilibili.com/x/web-interface/ranking/v2', {
        headers: buildBiliHeaders('https://www.bilibili.com/'),
        params: { type: 3 },
        timeout: 8000
      })
      const items = data?.data?.list || []
      if (items.length) {
        result[idx].songs = items.map(v => ({
          id: `bilibili_${v.bvid}`,
          platformId: v.bvid,
          title: v.title.replace(/<[^>]*>/g, ''),
          artist: v.owner?.name || '未知',
            artistId: v.owner?.mid ? `bilibili_artist_${v.owner.mid}` : '',
            album: v.tname || '',
            cover: v.pic ? `/api/proxy/image?url=${encodeURIComponent(biliThumb(v.pic))}` : '',
          duration: formatDurationStr(v.duration),
          durationMs: parseDuration(v.duration) * 1000,
          platform: 'B站',
          audioUrl: '',
          vip: false,
          bvid: v.bvid,
          aid: v.aid
        }))
        result[idx].cover = result[idx].songs[0]?.cover || ''
      }
    }
  } catch (e) {
    console.error(`Bilibili menu ${menu.name} error:`, e.message)
  }
  return result
}

// 搜索 B 站 UP 主作为"歌手"（bili_user 类型），头像经 /api/proxy/image 代理加载
export async function searchArtists(keyword, limit = 20) {
  try {
    // 用音乐区视频搜索按作者聚合出"歌手"：保证每个歌手都有可播放的音乐作品，
    // 避免 bili_user 搜出的有声书/影视 UP 主（无音乐作品）混入歌手列表
    const { songs } = await search(keyword)
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
          cover: v.cover ? `/api/proxy/image?url=${encodeURIComponent(biliThumb(v.cover))}` : '',
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

// 秒转 LRC 时间戳 [mm:ss.xx]
function formatLrcTime(t) {
  const mm = Math.floor(t / 60)
  const ss = Math.floor(t % 60)
  const ms = Math.round((t - Math.floor(t)) * 100)
  return `[${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`
}

// B站 WBI 签名：mixin key 由 img_key/sub_key 按固定置换表打乱后取前 32 位
function getMixinKey(imgKey, subKey) {
  const MIXIN_KEY_ENC_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52]
  const orig = imgKey + subKey
  let key = ''
  for (const i of MIXIN_KEY_ENC_TAB) key += orig[i]
  return key.slice(0, 32)
}

// 从 nav 接口拿 wbi 密钥，对参数做 WBI 签名返回带 wts/w_rid 的参数对象
async function wbiSign(params) {
  const { data } = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
    headers: buildBiliHeaders('https://www.bilibili.com/'),
    timeout: 8000
  })
  const img = data?.data?.wbi_img?.img_url || ''
  const sub = data?.data?.wbi_img?.sub_url || ''
  const imgKey = img.slice(img.lastIndexOf('/') + 1, img.lastIndexOf('.'))
  const subKey = sub.slice(sub.lastIndexOf('/') + 1, sub.lastIndexOf('.'))
  const mixinKey = getMixinKey(imgKey, subKey)
  const wts = Math.floor(Date.now() / 1000)
  const signed = { ...params, wts }
  const query = Object.keys(signed).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(signed[k])}`).join('&')
  const wRid = crypto.createHash('md5').update(query + mixinKey).digest('hex')
  signed.w_rid = wRid
  return signed
}

// 获取视频 CC 字幕并转成 LRC（优先 AI 已生成字幕），取不到返回 null
async function fetchVideoSubtitle(bvid, aid, cid) {
  try {
    const signed = await wbiSign({ aid, cid })
    const res = await axios.get('https://api.bilibili.com/x/player/wbi/v2', {
      headers: buildBiliHeaders(`https://www.bilibili.com/video/${bvid}`),
      params: signed,
      timeout: 8000
    })
    const subtitles = res.data?.data?.subtitle?.subtitles || []
    if (!subtitles.length) return null
    const sub = subtitles.find(s => s.ai_status === 2) || subtitles[0]
    const url = sub.subtitle_url.startsWith('//') ? 'https:' + sub.subtitle_url : sub.subtitle_url
    const { data: subBody } = await axios.get(url, {
      headers: buildBiliHeaders(`https://www.bilibili.com/video/${bvid}`),
      timeout: 8000
    })
    if (!Array.isArray(subBody?.body) || !subBody.body.length) return null
    const lines = []
    for (const l of subBody.body) {
      const content = String(l.content || '').trim()
      if (content) lines.push(formatLrcTime(Number(l.from) || 0) + content)
    }
    return lines.length ? lines.join('\n') : null
  } catch (e) {
    console.error('Bilibili subtitle error:', e.message)
    return null
  }
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
    // 搜索到的视频歌曲没有音频馆 sid：优先取视频 CC 字幕，再回退把弹幕转成 LRC 歌词
    try {
      const view = await axios.get('https://api.bilibili.com/x/web-interface/view', {
        headers: buildBiliHeaders(`https://www.bilibili.com/video/${id}`),
        params: { bvid: id },
        timeout: 8000
      })
      const vinfo = view.data?.data
      const cid = vinfo?.cid
      if (cid) {
        const subtitleLrc = await fetchVideoSubtitle(id, vinfo?.aid, cid)
        if (subtitleLrc) return { lyrics: subtitleLrc, transLyrics: '' }
        // 字幕不可用时回退弹幕
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
          lines.push(formatLrcTime(t) + text)
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
          cover: v.pic ? `/api/proxy/image?url=${encodeURIComponent(biliThumb(v.pic))}` : '',
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
