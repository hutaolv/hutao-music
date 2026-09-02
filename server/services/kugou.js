import axios from 'axios'

// 酷狗音乐 API（官方接口，无需签名）：
// - 榜单：m.kugou.com/rank/info/?rankid=X&page=1&json=true
// - 搜索：songsearch.kugou.com/song_search_v2
// - 播放：m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=X（免费歌曲返回 url，付费歌曲 url 为空）
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Referer': 'https://www.kugou.com/'
}

// 酷狗排行榜配置：8888=热歌榜 6666=飙升榜（来自官网榜单页 rankid）
const RANK_IDS = [
  { id: 8888, name: '热歌榜' },
  { id: 6666, name: '飙升榜' },
  { id: 52767, name: '收藏榜' },
  { id: 74534, name: '新歌榜' },
  { id: 31310, name: '欧美榜' }
]

// 部分榜单移动端接口查不到（如蜂鸟流行榜），改抓 PC 网页版内嵌 JSON
const PC_RANK_IDS = [
  { id: 59703, name: '流行榜' }
]

// 抓取 PC 网页版榜单（www.kugou.com/yy/rank/home/1-{rankid}.html），解析 global.features 内嵌 JSON
async function fetchRankPage(rankid) {
  const url = `https://www.kugou.com/yy/rank/home/1-${rankid}.html?from=rank`
  try {
    const { data } = await axios.get(url, { headers, timeout: 10000 })
    const i1 = data.indexOf('global.features')
    if (i1 < 0) return null
    const i2 = data.indexOf('[', i1)
    const i3 = data.indexOf('];', i2)
    if (i2 < 0 || i3 < 0) return null
    let list
    try { list = JSON.parse(data.slice(i2, i3 + 1)) } catch { return null }
    if (!Array.isArray(list) || !list.length) return null
    // PC 页面内嵌数据只有 album_id 没有封面 URL，拼 /stdmusic/{id}.jpg 是默认占位图；
    // 需逐个调 getSongInfo 拿真实专辑封面（album_img）
    const songs = await Promise.all(list.slice(0, 30).map(async (s) => {
      let cover = ''
      try {
        const gi = await axios.get('http://m.kugou.com/app/i/getSongInfo.php', {
          params: { cmd: 'playInfo', hash: s.Hash }, headers, timeout: 8000
        })
        if (gi.data?.album_img) cover = gi.data.album_img.replace(/\{size\}/i, '240')
      } catch {}
      return {
        id: `kugou_${s.Hash}`,
        platformId: s.Hash || '',
        // 内嵌文件名格式"歌手 - 歌名"，按第一个" - "拆分出歌名
        title: (s.FileName || '').split(' - ').slice(1).join(' - ') || s.FileName || '未知歌曲',
        artist: (s.author_name || '').replace(/&/g, '/'),
        artistId: '',
        album: '',
        cover,
        duration: formatDuration(Number(s.timeLen) || 0),
        durationMs: (Number(s.timeLen) || 0) * 1000,
        platform: '酷狗音乐',
        audioUrl: '',
        vip: Number(s.privilege) === 10
      }
    }))
    return songs
  } catch (e) {
    console.error(`KuGou pc rank ${rankid} error:`, e.message)
    return null
  }
}

// 用尺寸占位符的图片地址替换尺寸：{size} -> 240，并强制 https（避免 https 页面混合内容被拦）
function sizedImg(url) {
  if (!url || typeof url !== 'string') return ''
  return url.replace(/\{size\}/i, '240').replace(/^http:/i, 'https:')
}







// 所有酷狗榜单配置（统一列表，用于返回元数据）
// 全部走 PC 网页版抓取，mobile API 在海外 IP 不返回歌曲数据
const ALL_KUGOU_RANKS = [
  ...RANK_IDS.map(r => ({ ...r })),
  ...PC_RANK_IDS.map(r => ({ ...r }))
]

// 获取酷狗音乐排行榜（全部走 PC 网页版）
// sublistIndex=null 只返回榜单名+封面（元数据），指定索才拉歌曲
export async function getToplist(page = 1, sublistIndex) {
  // 无 sublistIndex：只返回元数据
  if (sublistIndex == null) {
    return ALL_KUGOU_RANKS.map(r => ({ name: r.name, cover: '', songs: [] }))
  }

  // 有 sublistIndex：只拉该榜单的歌曲
  const idx = Math.min(sublistIndex, ALL_KUGOU_RANKS.length - 1)
  const rank = ALL_KUGOU_RANKS[idx]
  const result = ALL_KUGOU_RANKS.map(r => ({ name: r.name, cover: '', songs: [] }))

  try {
    const songs = await fetchRankPage(rank.id)
    if (songs) {
      result[idx].songs = songs
      result[idx].cover = songs[0]?.cover || ''
    }
  } catch (e) {
    console.error(`KuGou rank ${rank.name} error:`, e.message)
  }
  return result
}

// 酷狗音乐搜索（mobilecdn 新版搜索接口：带真实封面 union_cover 和付费标识 pay_type，
// 老接口 song_search_v2 的 Privilege/PayType 恒为 0 无法识别 VIP，且按专辑ID拼出的封面是占位图。
// 接口固定每页 30 条，前端按 50 条/批翻页，这里拼多页返回，数组上挂 hasMore）
export async function searchSongs(keyword, limit = 50, page = 1) {
  const offset = (page - 1) * limit
  const start = Math.floor(offset / 30) + 1
  const end = Math.ceil((offset + limit) / 30)
  try {
    const chunks = await Promise.all(Array.from({ length: end - start + 1 }, (_, i) =>
      axios.get('http://mobilecdn.kugou.com/api/v3/search/song', {
        params: { format: 'json', keyword, page: start + i, pagesize: 30, showtype: 1 },
        headers,
        timeout: 8000
      })
    ))
    let lists = chunks.flatMap(c => c.data?.data?.info || [])
    const total = Number(chunks[0]?.data?.data?.total) || 0
    lists = lists.slice(offset % 30, offset % 30 + limit)
    const songs = lists.map(s => ({
      id: `kugou_${s.hash || s.FileHash}`,
      platformId: s.hash || s.FileHash || '',
      title: s.songname || s.SongName || '未知歌曲',
      artist: (s.singername || s.SingerName || '').replace(/&/g, '/'),
      artistId: '',
      album: s.album_name || '',
      cover: sizedImg(s.trans_param?.union_cover || s.cover || s.Image),
      duration: formatDuration(Number(s.duration) || 0),
      durationMs: (Number(s.duration) || 0) * 1000,
      platform: '酷狗音乐',
      audioUrl: '',
      vip: Number(s.pay_type) > 0 || Number(s.privilege) > 0
    }))
    songs.hasMore = offset + limit < total
    return songs
  } catch (e) {
    console.error('KuGou search error:', e.message)
    return []
  }
}

// 获取播放地址：免费歌曲返回直链，付费歌曲 url 为空返回 null，由前端提示并跳过
export async function getSongUrl(hash) {
  if (!hash) return null
  try {
    const { data } = await axios.get('http://m.kugou.com/app/i/getSongInfo.php', {
      params: { cmd: 'playInfo', hash },
      headers,
      timeout: 10000
    })
    return data?.url || null
  } catch (e) {
    console.error('KuGou song url error:', e.message)
    return null
  }
}

// 获取歌词：m.kugou.com/app/i/krc.php 直接返回明文 LRC（需带 timelength 毫秒），
// 付费歌曲同样有歌词。timelength 缺失时前端会传 durationMs，取不到则返回 null
export async function getLyrics(hash, timelength) {
  if (!hash || !timelength) return null
  try {
    const { data } = await axios.get('http://m.kugou.com/app/i/krc.php', {
      params: { cmd: 100, hash, timelength: Number(timelength) },
      headers: { ...headers, Referer: 'http://m.kugou.com/' },
      timeout: 10000
    })
    const text = typeof data === 'string' ? data : String(data)
    if (!text || text.length < 20 || !/\[\d{2}:\d{2}\.\d{2}/.test(text)) return null
    const lrc = text.replace(/^\uFEFF/, '')
    return { lyrics: lrc, transLyrics: '' }
  } catch (e) {
    console.error('KuGou lyrics error:', e.message)
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

export default { searchSongs, getToplist, getSongUrl, getLyrics }