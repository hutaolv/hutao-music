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
  { id: 6666, name: '飙升榜' }
]

// 用尺寸占位符的图片地址替换尺寸：{size} -> 240
function sizedImg(url) {
  if (!url || typeof url !== 'string') return ''
  return url.replace(/\{size\}/i, '240')
}

// 获取歌曲封面：优先歌手头像，其次按专辑ID拼酷狗专辑封面，都没有留空由前端占位
function coverOf(s) {
  const av = s.authors?.[0]?.sizable_avatar
  if (av) return sizedImg(av)
  if (s.album_id || s.AlbumID) return `http://imgessl.kugou.com/stdmusic/240/${s.album_id || s.AlbumID}.jpg`
  return ''
}

// 归一化歌曲对象（榜单接口字段）
function toSong(s) {
  return {
    id: `kugou_${s.hash}`,
    platformId: s.hash || '',
    title: s.songname || '未知歌曲',
    artist: (s.authors?.[0]?.author_name || '').replace(/&/g, '/'),
    artistId: '',
    album: '',
    cover: coverOf(s),
    duration: formatDuration(Number(s.duration) || 0),
    durationMs: (Number(s.duration) || 0) * 1000,
    platform: '酷狗音乐',
    audioUrl: '',
    vip: false
  }
}

// 获取酷狗音乐排行榜
export async function getToplist() {
  const results = await Promise.allSettled(RANK_IDS.map(rank =>
    axios.get(`https://m.kugou.com/rank/info/?rankid=${rank.id}&page=1&json=true`, { headers, timeout: 10000 })
      .then(({ data }) => {
        const list = data?.songs?.list
        if (!Array.isArray(list) || !list.length) return null
        const songs = list.slice(0, 30).map(toSong)
        return { name: rank.name, cover: songs[0]?.cover || '', songs }
      })
      .catch(e => { console.error(`KuGou rank ${rank.name} error:`, e.message); return null })
  ))
  const result = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
  return result.length ? result : null
}

// 酷狗音乐搜索
export async function searchSongs(keyword, limit = 30) {
  try {
    const { data } = await axios.get('http://songsearch.kugou.com/song_search_v2', {
      params: { keyword, page: 1, pagesize: limit },
      headers,
      timeout: 8000
    })
    const lists = data?.data?.lists || []
    return lists.slice(0, limit).map(s => ({
      id: `kugou_${s.FileHash || s.MvHash}`,
      platformId: s.FileHash || '',
      title: s.SongName || '未知歌曲',
      artist: (s.SingerName || '').replace(/&/g, '/'),
      artistId: '',
      album: s.AlbumName || '',
      cover: s.AlbumID ? `http://imgessl.kugou.com/stdmusic/240/${s.AlbumID}.jpg` : '',
      duration: formatDuration(Number(s.Duration) || 0),
      durationMs: (Number(s.Duration) || 0) * 1000,
      platform: '酷狗音乐',
      audioUrl: '',
      vip: Number(s.Privilege) <= 0 || (s.pay_type === 3)
    }))
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

// 格式化时长：秒 -> M:SS
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default { searchSongs, getToplist, getSongUrl }