import axios from 'axios'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com/',
  'Origin': 'https://www.bilibili.com'
}

const cookieHeaders = {
  ...headers,
  'Cookie': 'buvid3=26E3B8D0-3C4D-4A7E-9B2E-5F4A2D1C6B8E12345infoc; b_nut=1700000000; _uuid=A1B2C3D4-1234-5678-9ABC-DEF012345678; buvid_fp=cl5w; buvid4=26E3B8D0-3C4D-4A7E-9B2E-5F4A2D1C6B8E12345-20240101-123456-A1B2C3D4'
}

export async function getToplist() {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/copyright-music-publicity/toplist/all_period', {
      headers: cookieHeaders,
      params: { list_type: 1 }
    })
    if (data.code !== 0 || !data.data?.list?.length) return null

    const latestPeriod = data.data.list[0]
    const listId = latestPeriod.id

    const { data: detail } = await axios.get('https://api.bilibili.com/x/copyright-music-publicity/toplist/music_list', {
      headers: cookieHeaders,
      params: { list_id: listId }
    })
    if (detail.code !== 0 || !detail.data?.list?.length) return null

    const songs = detail.data.list.slice(0, 50).map((item, i) => ({
      id: `bilibili_${item.music_id || item.creation_bvid || i}`,
      platformId: item.music_id || item.creation_bvid || '',
      title: item.music_title || item.creation_title || '未知歌曲',
      artist: item.singer || item.creation_nickname || '未知',
      artistId: item.creation_up ? `bilibili_artist_${item.creation_up}` : '',
      album: item.album || '',
      cover: item.mv_cover || item.creation_cover || item.cover_url || '',
      duration: formatDuration(item.creation_duration),
      durationMs: parseDuration(item.creation_duration) * 1000,
      platform: 'B站',
      audioUrl: '',
      vip: false,
      bvid: item.creation_bvid || item.mv_bvid || '',
      aid: item.creation_aid || item.mv_aid || 0,
      musicId: item.music_id
    }))

    return [{
      name: `B站音乐热榜 · ${latestPeriod.name || latestPeriod.year || ''}`,
      cover: songs[0]?.cover || detail.data.cover_url || '',
      songs
    }]
  } catch (e) {
    console.error('Bilibili music toplist error:', e.message)
    return null
  }
}

export async function searchSongs(keyword, limit = 50) {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/web-interface/search/type', {
      headers: cookieHeaders,
      params: { search_type: 'video', keyword, page: 1, order: 'click' }
    })
    const results = data?.data?.result || []
    const musicResults = results.filter(v =>
      v.tag === '音乐' || v.tname === '音乐' || v.tname?.includes('音乐')
    )
    const finalList = musicResults.length > 5 ? musicResults : results.slice(0, limit)
    return finalList.slice(0, limit).map(v => ({
      id: `bilibili_${v.bvid}`,
      platformId: v.bvid,
      title: v.title.replace(/<[^>]*>/g, ''),
      artist: v.author || '未知',
      artistId: v.mid ? `bilibili_artist_${v.mid}` : '',
      album: v.tname || '',
      cover: v.pic || '',
      duration: formatDuration(v.duration),
      durationMs: parseDuration(v.duration) * 1000,
      platform: 'B站',
      audioUrl: '',
      bvid: v.bvid,
      aid: v.aid
    }))
  } catch (e) {
    console.error('Bilibili search error:', e.message)
    return []
  }
}

export async function getSongUrl(bvid, cid, musicId) {
  try {
    let rawUrl = null

    if (musicId) {
      const { data } = await axios.get('https://api.bilibili.com/x/audio/music/playurl', {
        headers,
        params: { music_id: musicId, privilege: 2, quality: 2 }
      })
      rawUrl = data?.data?.cdns?.[0] || data?.data?.url || null
    } else {
      let realCid = cid
      if (!realCid && bvid) {
        const { data } = await axios.get('https://api.bilibili.com/x/player/pagelist', {
          headers, params: { bvid }
        })
        realCid = data?.data?.[0]?.cid
      }
      if (realCid) {
        const { data } = await axios.get('https://api.bilibili.com/x/player/playurl', {
          headers,
          params: { bvid, cid: realCid, qn: 16, type: 'mp4', platform: 'web' }
        })
        const audio = data?.data?.dash?.audio
        if (audio?.length) {
          const best = audio.sort((a, b) => b.bandwidth - a.bandwidth)[0]
          rawUrl = best.baseUrl || best.backupUrl?.[0] || null
        }
        if (!rawUrl) rawUrl = data?.data?.durl?.[0]?.url || null
      }
    }

    if (rawUrl) {
      const proxyUrl = new URL('/api/proxy/audio', 'http://localhost:3001')
      proxyUrl.searchParams.set('url', rawUrl)
      return proxyUrl.toString()
    }
    return null
  } catch (e) {
    console.error('Bilibili audio URL error:', e.message)
    return null
  }
}

function parseDuration(s) {
  if (!s) return 0
  if (typeof s === 'number') return s
  const parts = s.split(':')
  if (parts.length >= 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  return parseInt(s) || 0
}

function formatDuration(s) {
  const total = parseDuration(s)
  const m = Math.floor(total / 60)
  const sec = Math.floor(total % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
