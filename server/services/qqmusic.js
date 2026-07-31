import axios from 'axios'

const BASE = 'https://u.y.qq.com/cgi-bin/musicu.fcg'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.1 Safari/537.36',
  'Referer': 'https://y.qq.com/',
  'Origin': 'https://y.qq.com'
}

export async function getToplist() {
  try {
    const { data } = await axios.get(BASE, {
      headers,
      params: {
        format: 'json',
        data: JSON.stringify({
          comm: { ct: 24, cv: 0 },
          toplist: {
            module: 'musicToplist.ToplistInfoServer',
            method: 'GetAll',
            param: {}
          }
        })
      }
    })

    if (!data?.toplist?.data?.group) return null

    const allToplists = []
    for (const group of data.toplist.data.group) {
      for (const t of group.toplist || []) {
        allToplists.push(t)
      }
    }
    const hotIdx = allToplists.findIndex(t => t.topId === 26)
    if (hotIdx > 0) {
      const hot = allToplists.splice(hotIdx, 1)[0]
      allToplists.unshift(hot)
    }
    const targets = allToplists.slice(0, 3)
    // 改为并行请求3个榜单详情，代替原来串行
    const details = await Promise.allSettled(targets.map(t => getToplistDetail(t.topId)))
    const result = []
    for (let i = 0; i < targets.length; i++) {
      const r = details[i]
      if (r.status === 'fulfilled' && r.value) {
        result.push({ name: targets[i].title, cover: targets[i].headPicUrl || targets[i].frontPicUrl, songs: r.value })
      }
    }
    return result.length ? result : null
  } catch (e) {
    console.error('QQ toplist error:', e.message)
    return null
  }
}

async function getToplistDetail(topId) {
  try {
    const { data } = await axios.get(BASE, {
      headers,
      params: {
        format: 'json',
        data: JSON.stringify({
          comm: { ct: 24, cv: 0 },
          detail: {
            module: 'musicToplist.ToplistInfoServer',
            method: 'GetDetail',
            param: { topId, offset: 0, num: 100 }
          }
        })
      }
    })
    const songList = data?.detail?.data?.songInfoList || []
    return songList.map((track, i) => ({
      id: `qqmusic_${track.id || track.mid}`,
      platformId: String(track.mid || track.id),
      title: track.title || track.name,
      artist: (track.singer || []).map(s => s.name).join(' / '),
      artistId: track.singer?.[0]?.mid ? `qqmusic_artist_${track.singer[0].mid}` : '',
      album: track.album?.name || track.album?.title || '',
      cover: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${track.album?.mid || ''}.jpg`,
      duration: formatDuration(track.interval),
      durationMs: (track.interval || 0) * 1000,
      platform: 'QQ音乐',
      audioUrl: '',
      vip: track.pay?.pay_play === 1 || track.pay?.pay_status === 1,
      platformSongMid: track.mid || track.id,
      platformMediaMid: track.file?.media_mid || track.mid
    }))
  } catch (e) {
    return null
  }
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.1 Safari/537.36',
        'Referer': 'https://y.qq.com/'
      },
      params: {
        w: keyword,
        t: 0,
        p: 1,
        n: limit,
        format: 'json',
        ct: 24,
        cv: 0,
        lossless: 1
      }
    })
    const songs = data?.data?.song?.list || []
    return songs.map(track => ({
      id: `qqmusic_${track.id || track.mid}`,
      platformId: String(track.mid || track.id),
      title: track.title || track.name || track.songname || '',
      artist: (track.singer || []).map(s => s.name).join(' / '),
      artistId: track.singer?.[0]?.mid ? `qqmusic_artist_${track.singer[0].mid}` : '',
      album: track.album?.name || track.albumname || '',
      cover: track.album?.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${track.album.mid}.jpg` : (track.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${track.albummid}.jpg` : ''),
      duration: formatDuration(track.interval),
      durationMs: (track.interval || 0) * 1000,
      platform: 'QQ音乐',
      audioUrl: '',
      vip: track.pay?.pay_play === 1 || track.pay?.pay_status === 1,
      platformSongMid: track.mid || track.id,
      platformMediaMid: track.file?.media_mid || track.mid
    }))
  } catch (e) {
    console.error('QQ search error:', e.message)
    return []
  }
}

// 搜索歌手。QQ 音乐的歌手专用接口（search_type=2）近期经常被风控限制返回空，
// 所以优先从歌曲搜索结果中提取歌手（接口稳定），提取不到时才退回歌手搜索接口。
export async function searchArtists(keyword, limit = 20) {
  // 方案一：从歌曲搜索结果的 artistId 去重提取歌手
  try {
    const songs = await searchSongs(keyword, 50)
    const map = new Map()
    for (const s of songs) {
      if (!s.artist || !s.artistId) continue
      if (!map.has(s.artistId)) {
        map.set(s.artistId, {
          id: s.artistId,
          platformId: s.artistId.replace('qqmusic_artist_', ''),
          name: s.artist.split(' / ')[0],
          avatar: s.cover,
          region: '未知',
          genre: '未知',
          fans: 0,
          songCount: 0,
          platform: 'QQ音乐'
        })
      }
    }
    const derived = Array.from(map.values()).slice(0, limit)
    if (derived.length) return derived
  } catch (e) {
    console.error('QQ derive artists error:', e.message)
  }
  // 方案二（兜底）：调用音乐库歌手搜索接口
  try {
    const { data } = await axios.get(BASE, {
      headers,
      params: {
        format: 'json',
        data: JSON.stringify({
          comm: { ct: 24, cv: 0 },
          search: {
            module: 'music.search.SearchCgiService',
            method: 'DoSearchForQQMusicDesktop',
            param: { num_per_page: 20, page_num: 1, query: keyword, search_type: 2 }
          }
        })
      }
    })
    const artists = data?.search?.data?.body?.singer?.list || []
    return artists.slice(0, limit).map(a => ({
      id: `qqmusic_artist_${a.mid || a.id}`,
      platformId: a.mid || a.id,
      name: a.name,
      avatar: `https://y.gtimg.cn/music/photo_new/T001R300x300M000${a.mid || ''}.jpg`,
      region: a.country || '未知',
      genre: '流行',
      fans: 0,
      songCount: 0,
      platform: 'QQ音乐'
    }))
  } catch (e) {
    console.error('QQ artist search error:', e.message)
    return []
  }
}

// 获取歌手的热门歌曲。原 fcg_v8_singer_track_cp.fcg 接口已失效（返回 404），
// 改用 musichall.song_list_server 模块的 GetSingerSongList 接口。
export async function getArtistSongs(artistMid) {
  try {
    const { data } = await axios.get(BASE, {
      headers,
      params: {
        format: 'json',
        data: JSON.stringify({
          comm: { ct: 24, cv: 0 },
          singerTrack: {
            module: 'musichall.song_list_server',
            method: 'GetSingerSongList',
            param: { singerMid: artistMid, begin: 0, num: 20, order: 2 }
          }
        })
      }
    })
    const songs = data?.singerTrack?.data?.songList || []
    return songs.map(item => {
      const track = item.songInfo || item
      return {
        id: `qqmusic_${track.id || track.mid}`,
        platformId: String(track.mid || track.id),
        title: track.title || track.name || track.songname || '',
        artist: (track.singer || []).map(s => s.name).join(' / '),
        artistId: `qqmusic_artist_${track.singer?.[0]?.mid || ''}`,
        album: track.album?.name || track.album?.title || '',
        cover: track.album?.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${track.album.mid}.jpg` : '',
        duration: formatDuration(track.interval),
        durationMs: (track.interval || 0) * 1000,
        platform: 'QQ音乐',
        audioUrl: '',
        vip: track.pay?.pay_play === 1 || track.pay?.pay_status === 1,
        platformSongMid: track.mid || track.id,
        platformMediaMid: track.file?.media_mid || track.mid
      }
    })
  } catch (e) {
    console.error('QQ artist songs error:', e.message)
    return []
  }
}

export async function getSongUrl(mid, mediaMid) {
  const guid = String(Math.floor(Math.random() * 10000000000))
  const useMid = mediaMid || mid
  try {
    const { data } = await axios.get('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.1 Safari/537.36',
        'Referer': 'https://y.qq.com/'
      },
      params: {
        format: 'json',
        data: JSON.stringify({
          comm: { ct: 24, cv: 0 },
          url: {
            module: 'vkey.GetVkeyServer',
            method: 'CgiGetVkey',
            param: {
              guid,
              songmid: [useMid],
              songtype: [0],
              uin: '0',
              loginflag: 1,
              platform: '20'
            }
          }
        })
      }
    })
    const urlInfo = data?.url?.data?.midurlinfo?.[0]
    if (urlInfo?.purl) {
      return `https://dl.stream.qqmusic.qq.com/${urlInfo.purl}`
    }
    return null
  } catch (e) {
    console.error('QQ song URL error:', e.message)
    return null
  }
}

export async function getLyrics(mid) {
  try {
    const { data } = await axios.get(BASE, {
      headers,
      params: {
        format: 'json',
        data: JSON.stringify({
          comm: { ct: 24, cv: 0 },
          lyric: {
            module: 'music.musichallSong.PlayLyricInfo',
            method: 'GetPlayLyricInfo',
            param: { songmid: mid }
          }
        })
      }
    })
    if (data?.lyric?.code === 0 && data?.lyric?.data?.lyric) {
      const lyrics = Buffer.from(data.lyric.data.lyric, 'base64').toString('utf-8')
      let transLyrics = ''
      if (data.lyric.data.trans) {
        transLyrics = Buffer.from(data.lyric.data.trans, 'base64').toString('utf-8')
      }
      return { lyrics, transLyrics }
    }
    return null
  } catch (e) {
    console.error('QQ lyrics error:', e.message)
    return null
  }
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
