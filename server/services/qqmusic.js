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

    const groups = data.toplist.data.group
    const result = []
    for (const group of groups) {
      for (const toplist of group.toplist || []) {
        if (result.length >= 3) break
        const detail = await getToplistDetail(toplist.topId)
        if (detail) {
          result.push({
            name: toplist.title,
            cover: toplist.headPicUrl || toplist.frontPicUrl,
            songs: detail
          })
        }
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
            param: { topId, offset: 0, num: 50 }
          }
        })
      }
    })
    const songList = data?.detail?.data?.songInfoList || []
    return songList.slice(0, 50).map((track, i) => ({
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

export async function searchArtists(keyword) {
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
    return artists.map(a => ({
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

export async function getArtistSongs(artistMid) {
  try {
    const { data } = await axios.get('https://c.y.qq.com/v8/fcg-bin/fcg_v8_singer_track_cp.fcg', {
      headers,
      params: {
        singermid: artistMid,
        order: 'listen',
        begin: 0,
        num: 10,
        songstatus: 1
      }
    })
    const songs = data?.data?.list || []
    return songs.map(item => {
      const track = item.musicData || item
      return {
        id: `qqmusic_${track.id || track.mid}`,
        platformId: String(track.mid || track.id),
        title: track.title || track.name,
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
    const { data } = await axios.get('https://api.qq.com/api/v2/lyric', {
      headers,
      params: { songmid: mid }
    })
    if (data?.code === 0 && data?.lyric) return { lyrics: data.lyric, transLyrics: '' }
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
