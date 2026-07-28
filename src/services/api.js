// ⚠ 纯前端模式：通过公共CORS代理直接调上游API
// 有些平台可能因CORS限制无法获取数据，可自建CORS代理或改用Nginx反代
const CORS_PROXY = 'https://corsproxy.io/?url='

async function x(url, headers = {}) {
  const r = await fetch(CORS_PROXY + encodeURIComponent(url), {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...headers }
  })
  return r.json()
}

function mapNetease(t) {
  return {
    id: `netease_${t.id}`, platformId: String(t.id),
    title: t.name, artist: (t.ar || t.artists || []).map(a => a.name).join(' / '),
    artistId: t.ar?.[0]?.id ? `netease_artist_${t.ar[0].id}` : '',
    album: t.al?.name || t.album?.name || '',
    cover: t.al?.picUrl || t.album?.picUrl || '',
    duration: fmtDurMs(t.dt || t.duration), durationMs: t.dt || t.duration || 0,
    platform: '网易云音乐', audioUrl: '', vip: t.fee === 1 || t.fee === 4
  }
}
function mapQQ(t) {
  return {
    id: `qqmusic_${t.mid || t.id}`, platformId: String(t.mid || t.id),
    title: t.title || t.name || t.songname || '',
    artist: (t.singer || []).map(s => s.name).join(' / '),
    artistId: t.singer?.[0]?.mid ? `qqmusic_artist_${t.singer[0].mid}` : '',
    album: t.album?.name || t.albumname || '',
    cover: (t.album?.mid || t.albummid) ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${t.album?.mid || t.albummid}.jpg` : '',
    duration: fmtDur(t.interval), durationMs: (t.interval || 0) * 1000,
    platform: 'QQ音乐', audioUrl: '', vip: t.pay?.pay_play === 1 || t.pay?.pay_status === 1,
    platformSongMid: t.mid || t.id, platformMediaMid: t.file?.media_mid || t.mid
  }
}
function mapBili(v) {
  return {
    id: `bilibili_au_${v.id}`, platformId: String(v.id),
    title: v.title, artist: v.author || v.uname || '未知',
    artistId: v.uid ? `bilibili_artist_${v.uid}` : '', album: '',
    cover: v.cover || v.pic || '', duration: fmtDur(parseInt(v.duration) || 0),
    durationMs: parseInt(v.duration) * 1000 || 0,
    platform: 'B站', audioUrl: '', vip: false, auid: v.id, lyricUrl: v.lyric || ''
  }
}
function mapMigu(item) {
  const s = typeof item.songData === 'string' ? JSON.parse(item.songData) : (item.songData || item)
  return {
    id: `migu_${item.contentId || item.resId || s.contentId || s.songId}`,
    platformId: item.contentId || item.resId || s.contentId || '',
    title: item.txt || item.songName || s.songName || '',
    artist: item.txt2 || s.singerList?.map(si => si.name).join(' / ') || '',
    artistId: s.singerList?.[0]?.id ? `migu_artist_${s.singerList[0].id}` : '',
    album: item.txt3 || s.album || '',
    cover: item.img?.startsWith('http') ? item.img : (s.img1?.startsWith('http') ? s.img1 : `https://d.musicapp.migu.cn${item.img || s.img1 || ''}`),
    duration: fmtDur(s.duration || 0), durationMs: (s.duration || 0) * 1000,
    platform: '咪咕音乐', audioUrl: '', vip: item.vip === '1' || s.restrictType === 1,
    contentId: item.contentId || item.resId || s.contentId || '',
    copyrightId: item.copyrightId || s.copyrightId || ''
  }
}
function fmtDur(s) { if (!s) return '0:00'; const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${String(sec).padStart(2, '0')}` }
function fmtDurMs(ms) { return fmtDur(Math.floor((ms || 0) / 1000)) }

const DEMO_SONGS = ['https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3', 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3']
function getDemoUrl(id) { let h = 0; const s = String(id); for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0 } return DEMO_SONGS[Math.abs(h) % DEMO_SONGS.length] }

// ─── Charts ───────────────────────────────────────────────
export async function fetchCharts(platform) {
  try {
    const neteaseCharts = async () => {
      const ids = [{ id: 3778678, name: '热歌榜' }, { id: 3779629, name: '新歌榜' }, { id: 19723756, name: '飙升榜' }, { id: 2884035, name: '原创榜' }]
      const r = []
      for (const list of ids) {
        const d = await x(`https://music.163.com/api/playlist/detail?id=${list.id}`)
        const tracks = d?.result?.tracks || d?.playlist?.tracks || []
        if (tracks.length) r.push({ name: list.name, cover: tracks[0]?.al?.picUrl || '', songs: tracks.map(mapNetease) })
      }
      return r
    }
    const qqCharts = async () => {
      const d = await x('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
        comm: { ct: 24, cv: 0 }, toplist: { module: 'musicToplist.ToplistInfoServer', method: 'GetAll', param: {} }
      })))
      if (!d?.toplist?.data?.group) return []
      const all = []; for (const g of d.toplist.data.group) { for (const t of g.toplist || []) all.push(t) }
      const hi = all.findIndex(t => t.topId === 26); if (hi > 0) { const h = all.splice(hi, 1)[0]; all.unshift(h) }
      const result = []
      for (const tl of all.slice(0, 3)) {
        const det = await x('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
          comm: { ct: 24, cv: 0 }, detail: { module: 'musicToplist.ToplistInfoServer', method: 'GetDetail', param: { topId: tl.topId, offset: 0, num: 100 } }
        })))
        const songs = det?.detail?.data?.songInfoList || []
        result.push({ name: tl.title, cover: tl.headPicUrl || tl.frontPicUrl, songs: songs.map(mapQQ) })
      }
      return result
    }
    const biliCharts = async () => {
      const menus = [{ sid: 10627, name: '热歌榜' }, { sid: 10624, name: '新曲推荐' }, { sid: 10628, name: '原创榜' }]
      const result = []
      for (const m of menus) {
        const d = await x(`https://api.bilibili.com/audio/music-service-c/web/song/of-menu?sid=${m.sid}&pn=1&ps=50`)
        const items = d?.data?.data || []
        if (items.length) result.push({ name: m.name, cover: items[0]?.cover || '', songs: items.map(mapBili) })
      }
      if (!result.length) {
        const d = await x('https://api.bilibili.com/x/web-interface/ranking/v2?type=3')
        const items = d?.data?.list || []
        if (items.length) result.push({ name: 'B站排行榜', cover: '', songs: items.map(v => ({ ...mapBili(v), id: `bilibili_${v.bvid}`, bvid: v.bvid })) })
      }
      return result
    }
    const dyCharts = async () => {
      const charts = [{ id: '6853972723954146568', name: '抖音热歌榜' }, { id: '6854399861215730952', name: '抖音飙升榜' }, { id: '6854399861215747336', name: '抖音原创榜' }]
      const result = []
      for (const c of charts) {
        const d = await x(`https://api3-normal-c-lf.amemv.com/aweme/v1/chart/music/list/?chart_id=${c.id}&count=100&cursor=0&aid=1128`)
        if (d?.status_code === 0 && d?.music_list?.length) {
          const songs = d.music_list.map(m => ({
            id: `douyin_${m.id_str}`, platformId: m.id_str, title: m.title || '未知歌曲',
            artist: m.author || '未知', artistId: '', album: m.album || '',
            cover: m.cover_large?.url_list?.[0] || m.cover_thumb?.url_list?.[0] || '',
            duration: fmtDur(m.duration), durationMs: (m.duration || 0) * 1000,
            platform: '抖音', audioUrl: m.play_url?.url_list?.[0] || '', sourceUrl: m.play_url?.url_list?.[0] || '', vip: false
          }))
          result.push({ name: c.name, cover: songs[0]?.cover || '', songs })
        }
      }
      return result
    }
    const mgCharts = async () => {
      const ids = [{ id: '27186466', name: '热歌榜' }, { id: '27553319', name: '新歌榜' }, { id: '27553408', name: '原创榜' }]
      const result = []
      for (const rank of ids) {
        const d = await x(`http://app.c.nf.migu.cn/bmw/rank/rank-info/v1.0?pageNo=1&rankId=${rank.id}&pageSize=50`)
        if (d?.code === '000000' && d?.data?.contents?.length) {
          result.push({ name: rank.name, cover: d.data.contents[0]?.img || '', songs: d.data.contents.map(mapMigu) })
        }
      }
      return result
    }
    const pm = { '抖音': dyCharts, 'QQ音乐': qqCharts, '网易云音乐': neteaseCharts, 'B站': biliCharts, '咪咕音乐': mgCharts }
    return (await pm[platform]?.()) || null
  } catch (e) { console.warn(`Charts ${platform} failed:`, e.message); return null }
}

// ─── Search ───────────────────────────────────────────────
export async function searchAll(keyword, platform) {
  if (!keyword) return { songs: [], artists: [] }
  try {
    const results = { songs: [], artists: [] }
    if (platform === '抖音') return results
    const svc = {
      '网易云音乐': async kw => {
        const d = await x(`https://music.163.com/api/search/get/web?s=${encodeURIComponent(kw)}&type=1&offset=0&total=true&limit=50`)
        if (d.code === 200 && d.result?.songs) { results.songs = d.result.songs.slice(0, 50).map(mapNetease) }
        const da = await x(`https://music.163.com/api/search/get/web?s=${encodeURIComponent(kw)}&type=100&offset=0&total=true&limit=20`)
        if (da.code === 200 && da.result?.artists) {
          results.artists = da.result.artists.map(a => ({ id: `netease_artist_${a.id}`, platformId: a.id, name: a.name, avatar: a.img1v1Url || '', region: '华语', genre: '流行', fans: 0, songCount: 0, platform: '网易云音乐' }))
        }
      },
      'QQ音乐': async kw => {
        const d = await x(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(kw)}&t=0&p=1&n=50&format=json&ct=24&cv=0&lossless=1`)
        results.songs = (d?.data?.song?.list || []).map(mapQQ)
        const da = await x('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
          comm: { ct: 24, cv: 0 }, search: { module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop', param: { num_per_page: 20, page_num: 1, query: kw, search_type: 2 } }
        })))
        results.artists = (da?.search?.data?.body?.singer?.list || []).map(a => ({ id: `qqmusic_artist_${a.mid || a.id}`, platformId: a.mid || a.id, name: a.name, avatar: `https://y.gtimg.cn/music/photo_new/T001R300x300M000${a.mid || ''}.jpg`, region: '华语', genre: '流行', fans: 0, songCount: 0, platform: 'QQ音乐' }))
      },
      'B站': async kw => {
        const d = await x(`https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(kw)}&order=click&duration=0&tids=3`)
        const items = d?.data?.result || []
        results.songs = items.filter(v => v.tag?.includes('音乐') || v.tname === '音乐' || v.title?.includes('音乐')).map(v => ({
          id: `bilibili_${v.bvid}`, platformId: v.bvid, title: v.title.replace(/<[^>]*>/g, ''),
          artist: v.author || '未知', artistId: v.mid ? `bilibili_artist_${v.mid}` : '',
          album: v.tname || '', cover: v.pic || '', duration: fmtDur(parseInt(v.duration) || 0),
          durationMs: parseInt(v.duration) * 1000 || 0, platform: 'B站', audioUrl: '', vip: false, bvid: v.bvid
        }))
      },
      '咪咕音乐': async kw => {
        const d = await x(`http://app.c.nf.migu.cn/bmw/search/song/v1.0?pageNo=1&text=${encodeURIComponent(kw)}`)
        const items = d?.data?.items || []
        results.songs = items.slice(0, 50).map(mapMigu)
      }
    }
    await svc[platform]?.(keyword)
    return results
  } catch (e) { console.warn('Search failed:', e.message); return { songs: [], artists: [] } }
}

export async function searchSongs(keyword) { const r = await searchAll(keyword, '网易云音乐'); return r.songs }
export async function searchArtists(keyword) { const r = await searchAll(keyword, '网易云音乐'); return r.artists }

// ─── Song URL ────────────────────────────────────────────
export async function getSongUrl(song) {
  try {
    let url = null
    switch (song.platform) {
      case '网易云音乐': {
        const d = await x(`https://music.163.com/api/song/enhance/player/url?ids=[${song.platformId}]&br=128000`)
        if (d.code === 200 && d.data?.[0]?.url) url = d.data[0].url
        break
      }
      case 'QQ音乐': {
        const mid = song.platformSongMid || song.platformId
        const d = await x('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
          comm: { ct: 24, cv: 0 }, url: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: String(Math.floor(Math.random() * 10000000000)), songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' } }
        })))
        const purl = d?.url?.data?.midurlinfo?.[0]?.purl
        if (purl) url = `https://dl.stream.qqmusic.qq.com/${purl}`
        break
      }
      case 'B站': {
        if (song.auid) { const d = await x(`https://api.bilibili.com/audio/music-service-c/web/url?sid=${song.auid}`); const cdns = d?.data?.cdns; if (cdns?.length) url = cdns[0] }
        break
      }
      case '抖音': { url = song.sourceUrl || null; break }
      case '咪咕音乐': {
        if (song.contentId && song.copyrightId) { const d = await x(`https://app.c.nf.migu.cn/MIGUM3.0/strategy/pc/listen/v1.0?contentId=${song.contentId}&copyrightId=${song.copyrightId}&resourceType=2&toneFlag=PQ`); if (d?.code === '000000' && d?.data?.url) url = d.data.url }
        break
      }
    }
    return url || getDemoUrl(song.platformId || song.id)
  } catch (e) { console.warn('Get song URL failed:', e.message); return getDemoUrl(song.platformId || song.id) }
}

// ─── Lyrics ──────────────────────────────────────────────
export async function getLyrics(song) {
  try {
    let result = null
    switch (song.platform) {
      case '网易云音乐': {
        const d = await x(`https://music.163.com/api/song/lyric?id=${song.platformId}&lv=1&kv=1&tv=-1`)
        if (d.code === 200) result = { lyrics: d.lrc?.lyric || '', transLyrics: d.tlyric?.lyric || '' }
        break
      }
      case 'QQ音乐': {
        const mid = song.platformSongMid || song.platformId
        const d = await x('https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
          comm: { ct: 24, cv: 0 }, lyric: { module: 'music.musichallSong.PlayLyricInfo', method: 'GetPlayLyricInfo', param: { songmid: mid } }
        })))
        if (d?.lyric?.code === 0 && d?.lyric?.data?.lyric) {
          const b64decode = str => { try { return decodeURIComponent(Array.from(atob(str), c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')) } catch { return atob(str) } }
          const lyrics = b64decode(d.lyric.data.lyric)
          const transLyrics = d.lyric.data.trans ? b64decode(d.lyric.data.trans) : ''
          result = { lyrics, transLyrics }
        }
        break
      }
      case 'B站': {
        const lrcUrl = song.lyricUrl
        if (lrcUrl) { const r = await fetch(CORS_PROXY + encodeURIComponent(lrcUrl)); result = { lyrics: await r.text(), transLyrics: '' } }
        break
      }
      case '抖音': {
        if (song.lyricUrl) {
          const r = await fetch(CORS_PROXY + encodeURIComponent(song.lyricUrl))
          const data = await r.json()
          if (Array.isArray(data)) {
            const lrc = data.map(line => { const t = parseFloat(line.timeId); const m = Math.floor(t / 60); const s = Math.floor(t % 60); const ms = Math.round((t - Math.floor(t)) * 100); return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}]${line.text}` }).join('\n')
            result = { lyrics: lrc, transLyrics: '' }
          }
        }
        break
      }
      case '咪咕音乐': {
        const d = await x(`https://app.c.nf.migu.cn/resource/song/by-contentids/v2.0?contentId=${song.contentId || song.platformId}`)
        if (d?.code === '000000' && d?.data?.[0]?.lrcUrl) {
          const lr = await fetch(CORS_PROXY + encodeURIComponent(d.data[0].lrcUrl))
          result = { lyrics: await lr.text(), transLyrics: '' }
        }
        break
      }
    }
    return result || { lyrics: '', transLyrics: '' }
  } catch (e) { console.warn('Get lyrics failed:', e.message); return { lyrics: '', transLyrics: '' } }
}

// ─── Artist Songs ────────────────────────────────────────
export async function getArtistSongs(platform, artistId) {
  try {
    let songs = []
    switch (platform) {
      case '网易云音乐': {
        const id = artistId.split('_').pop()
        const d = await x(`https://music.163.com/api/artist/${id}`)
        if (d.code === 200 && d.hotSongs) songs = d.hotSongs.slice(0, 10).map(mapNetease)
        break
      }
      case 'QQ音乐': {
        const mid = artistId.split('_').pop()
        const d = await x(`https://c.y.qq.com/v8/fcg-bin/fcg_v8_singer_track_cp.fcg?singermid=${mid}&order=listen&begin=0&num=10&songstatus=1`)
        songs = (d?.data?.list || []).map(item => mapQQ(item.musicData || item))
        break
      }
    }
    return { songs }
  } catch (e) { console.warn('Get artist songs failed:', e.message); return { songs: [] } }
}
