import axios from 'axios'

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com/'
}

export async function getToplist() {
  try {
    const { data } = await axios.get('https://api.bilibili.com/x/copyright-music-publicity/toplist/all_period', {
      headers,
      params: { list_type: 1 }
    })
    if (data.code !== 0 || !data.data?.list?.length) return null

    const latestPeriod = data.data.list[0]
    const listId = latestPeriod.id

    const { data: detail } = await axios.get('https://api.bilibili.com/x/copyright-music-publicity/toplist/music_list', {
      headers,
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
      durationMs: (item.creation_duration || 0) * 1000,
      platform: 'B站',
      audioUrl: '',
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
      headers,
      params: { search_type: 'music', keyword, page: 1 }
    })
    const results = data?.data?.result || []
    return results.slice(0, limit).map(v => ({
      id: `bilibili_${v.bvid || v.music_id || v.id}`,
      platformId: v.bvid || v.music_id || '',
      title: (v.title || v.music_title || '').replace(/<[^>]*>/g, ''),
      artist: v.author || v.singer || v.uname || '未知',
      artistId: v.mid || v.up_mid ? `bilibili_artist_${v.mid || v.up_mid}` : '',
      album: '',
      cover: v.pic || v.cover || v.music_cover || '',
      duration: formatDuration(v.duration),
      durationMs: (v.duration || 0) * 1000,
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

export async function getSongUrl(bvid, cid) {
  try {
    let realCid = cid
    if (!realCid && bvid) {
      const { data } = await axios.get('https://api.bilibili.com/x/player/pagelist', {
        headers, params: { bvid }
      })
      realCid = data?.data?.[0]?.cid
    }
    if (!realCid) return null

    const { data } = await axios.get('https://api.bilibili.com/x/player/playurl', {
      headers,
      params: { bvid, cid: realCid, qn: 16, type: 'mp4', platform: 'web' }
    })
    const audio = data?.data?.dash?.audio
    if (audio?.length) {
      const best = audio.sort((a, b) => b.bandwidth - a.bandwidth)[0]
      return best.baseUrl || best.backupUrl?.[0] || null
    }
    return data?.data?.durl?.[0]?.url || null
  } catch (e) {
    console.error('Bilibili audio URL error:', e.message)
    return null
  }
}

function formatDuration(s) {
  if (!s) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
