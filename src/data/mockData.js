const platforms = ['抖音', 'QQ音乐', '网易云音乐', 'B站', '汽水音乐']

const platformColors = {
  '抖音': '#000000',
  'QQ音乐': '#00D4FF',
  '网易云音乐': '#D43C33',
  'B站': '#FB7299',
  '汽水音乐': '#FF6B35'
}

const platformIcons = {
  '抖音': 'douyin',
  'QQ音乐': 'qqmusic',
  '网易云音乐': 'netease',
  'B站': 'bilibili',
  '汽水音乐': 'qishui'
}

const artistPool = [
  { id: 'a1', name: '周杰伦', region: '华语', genre: '流行', fans: 5250, avatar: '' },
  { id: 'a2', name: '林俊杰', region: '华语', genre: '流行', fans: 4800, avatar: '' },
  { id: 'a3', name: '邓紫棋', region: '华语', genre: '流行', fans: 4200, avatar: '' },
  { id: 'a4', name: '陈奕迅', region: '华语', genre: '流行', fans: 5100, avatar: '' },
  { id: 'a5', name: 'Taylor Swift', region: '欧美', genre: '流行', fans: 6800, avatar: '' },
  { id: 'a6', name: '薛之谦', region: '华语', genre: '流行', fans: 3800, avatar: '' },
  { id: 'a7', name: '李荣浩', region: '华语', genre: '流行', fans: 2900, avatar: '' },
  { id: 'a8', name: '蔡徐坤', region: '华语', genre: '流行', fans: 3500, avatar: '' },
  { id: 'a9', name: '王菲', region: '华语', genre: '流行', fans: 4600, avatar: '' },
  { id: 'a10', name: '许嵩', region: '华语', genre: '流行', fans: 3100, avatar: '' },
  { id: 'a11', name: '毛不易', region: '华语', genre: '民谣', fans: 2700, avatar: '' },
  { id: 'a12', name: 'Jay Chou', region: '华语', genre: 'R&B', fans: 5250, avatar: '' },
  { id: 'a13', name: 'Eminem', region: '欧美', genre: '说唱', fans: 5500, avatar: '' },
  { id: 'a14', name: 'Ed Sheeran', region: '欧美', genre: '流行', fans: 5200, avatar: '' },
  { id: 'a15', name: 'Adele', region: '欧美', genre: '流行', fans: 5800, avatar: '' },
  { id: 'a16', name: '周深', region: '华语', genre: '流行', fans: 3300, avatar: '' },
  { id: 'a17', name: '张杰', region: '华语', genre: '流行', fans: 3600, avatar: '' },
  { id: 'a18', name: '华晨宇', region: '华语', genre: '流行', fans: 3400, avatar: '' },
  { id: 'a19', name: 'BTS', region: '日韩', genre: '流行', fans: 7200, avatar: '' },
  { id: 'a20', name: 'BLACKPINK', region: '日韩', genre: '流行', fans: 6500, avatar: '' },
  { id: 'a21', name: '李健', region: '华语', genre: '民谣', fans: 2100, avatar: '' },
  { id: 'a22', name: '刘德华', region: '华语', genre: '流行', fans: 5500, avatar: '' },
  { id: 'a23', name: '张学友', region: '华语', genre: '流行', fans: 5300, avatar: '' },
  { id: 'a24', name: '汪苏泷', region: '华语', genre: '流行', fans: 2600, avatar: '' },
  { id: 'a25', name: '陈雪凝', region: '华语', genre: '民谣', fans: 1800, avatar: '' }
]

const songTemplates = [
  { title: '七里香', artistId: 'a1', album: '七里香' },
  { title: '告白气球', artistId: 'a1', album: '周杰伦的床边故事' },
  { title: '晴天', artistId: 'a1', album: '叶惠美' },
  { title: '稻香', artistId: 'a1', album: '魔杰座' },
  { title: '夜曲', artistId: 'a1', album: '十一月的萧邦' },
  { title: '江南', artistId: 'a2', album: '第二天堂' },
  { title: '修炼爱情', artistId: 'a2', album: '因你而在' },
  { title: '可惜没如果', artistId: 'a2', album: '新地球' },
  { title: '光年之外', artistId: 'a3', album: '光年之外' },
  { title: '泡沫', artistId: 'a3', album: 'Xposed' },
  { title: '倒数', artistId: 'a3', album: '倒数' },
  { title: '十年', artistId: 'a4', album: '黑白灰' },
  { title: '浮夸', artistId: 'a4', album: 'U87' },
  { title: 'K歌之王', artistId: 'a4', album: '打得火热' },
  { title: 'Love Story', artistId: 'a5', album: 'Fearless' },
  { title: 'Shake It Off', artistId: 'a5', album: '1989' },
  { title: '丑八怪', artistId: 'a6', album: '意外' },
  { title: '演员', artistId: 'a6', album: '演员' },
  { title: '刚刚好', artistId: 'a6', album: '初学者' },
  { title: '年少有为', artistId: 'a7', album: '耳朵' },
  { title: '麻雀', artistId: 'a7', album: '麻雀' },
  { title: '情人', artistId: 'a8', album: '情人' },
  { title: 'Home', artistId: 'a8', album: 'Home' },
  { title: '红豆', artistId: 'a9', album: '唱游' },
  { title: '匆匆那年', artistId: 'a9', album: '匆匆那年' },
  { title: '素颜', artistId: 'a10', album: '素颜' },
  { title: '灰色头像', artistId: 'a10', album: '寻雾启示' },
  { title: '消愁', artistId: 'a11', album: '平凡的一天' },
  { title: '像我这样的人', artistId: 'a11', album: '平凡的一天' },
  { title: 'Lose Yourself', artistId: 'a13', album: '8 Mile' },
  { title: 'Shape of You', artistId: 'a14', album: 'Divide' },
  { title: 'Someone Like You', artistId: 'a15', album: '21' },
  { title: '大鱼', artistId: 'a16', album: '大鱼' },
  { title: '天下', artistId: 'a17', album: '明天过后' },
  { title: '齐天', artistId: 'a18', album: '齐天' },
  { title: 'Dynamite', artistId: 'a19', album: 'BE' },
  { title: 'How You Like That', artistId: 'a20', album: 'THE ALBUM' },
  { title: '传奇', artistId: 'a21', album: '传奇' },
  { title: '忘情水', artistId: 'a22', album: '忘情水' },
  { title: '吻别', artistId: 'a23', album: '吻别' },
  { title: '有点甜', artistId: 'a24', album: '万有引力' },
  { title: '绿色', artistId: 'a25', album: '绿色' },
  { title: '明明就', artistId: 'a1', album: '十二新作' },
  { title: '不潮不用花钱', artistId: 'a2', album: 'JJ陆' },
  { title: '来自天堂的魔鬼', artistId: 'a3', album: '新的心跳' },
  { title: '富士山下', artistId: 'a4', album: 'What\'s Going On' },
  { title: 'Blank Space', artistId: 'a5', album: '1989' },
  { title: '你还要我怎样', artistId: 'a6', album: '意外' },
  { title: '作曲家', artistId: 'a7', album: '作曲家' },
  { title: 'Wait Wait Wait', artistId: 'a8', album: 'Wait Wait Wait' },
  { title: '容易受伤的女人', artistId: 'a9', album: 'Coming Home' },
  { title: '如果当时', artistId: 'a10', album: '自定义' },
  { title: '不染', artistId: 'a11', album: '不染' },
  { title: 'Love The Way You Lie', artistId: 'a13', album: 'Recovery' },
  { title: 'Perfect', artistId: 'a14', album: 'Divide' },
  { title: 'Hello', artistId: 'a15', album: '25' },
  { title: '达拉崩吧', artistId: 'a16', album: '达拉崩吧' },
  { title: '这，就是爱', artistId: 'a17', album: '这，就是爱' },
  { title: '烟火里的尘埃', artistId: 'a18', album: '烟火里的尘埃' },
  { title: 'Butter', artistId: 'a19', album: 'Butter' },
  { title: 'Ice Cream', artistId: 'a20', album: 'Ice Cream' },
  { title: '贝加尔湖畔', artistId: 'a21', album: '贝加尔湖畔' },
  { title: '冰雨', artistId: 'a22', album: '冰雨' },
  { title: '一千个伤心的理由', artistId: 'a23', album: '真爱' },
  { title: '不分手的恋爱', artistId: 'a24', album: '不分手的恋爱' },
  { title: '假装', artistId: 'a25', album: '假装' }
]

function randomDuration() {
  const min = 180
  const max = 320
  const total = Math.floor(Math.random() * (max - min) + min)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function randomCover(title) {
  return `https://picsum.photos/seed/${encodeURIComponent(title)}/400/400`
}

function getAvatar(name) {
  return `https://picsum.photos/seed/${encodeURIComponent(name)}/200/200`
}

const artists = artistPool.map(a => ({
  ...a,
  avatar: getAvatar(a.name),
  songCount: Math.floor(Math.random() * 30 + 10)
}))

function generatePlatformSongs(platform, startIdx, count) {
  const songs = []
  for (let i = 0; i < count; i++) {
    const idx = (startIdx + i) % songTemplates.length
    const tpl = songTemplates[idx]
    const artist = artists.find(a => a.id === tpl.artistId)
    songs.push({
      id: `${platform}_${i + 1}`,
      title: tpl.title,
      artist: artist ? artist.name : '未知',
      artistId: tpl.artistId,
      album: tpl.album,
      cover: randomCover(tpl.title),
      duration: randomDuration(),
      platform,
      audioUrl: '',
      lyrics: '',
      vip: (platform === '网易云音乐' || platform === 'QQ音乐') ? Math.random() < 0.2 : false
    })
  }
  return songs
}

const platformSongs = {
  '抖音': generatePlatformSongs('抖音', 0, 50),
  'QQ音乐': generatePlatformSongs('QQ音乐', 5, 50),
  '网易云音乐': generatePlatformSongs('网易云音乐', 10, 50),
  'B站': generatePlatformSongs('B站', 15, 50),
  '汽水音乐': generatePlatformSongs('汽水音乐', 20, 50)
}

const hotSearchTags = ['周杰伦', '七里香', '邓紫棋', '泡沫', '十年', '陈奕迅', 'Taylor Swift', '薛之谦', '告白气球', '稻香']

const banners = [
  { id: 1, title: '全网热歌榜 TOP50', subtitle: '汇聚五大平台最热单曲', color: '#1a1a2e' },
  { id: 2, title: '华语流行精选', subtitle: '周杰伦/林俊杰/邓紫棋 经典连放', color: '#16213e' },
  { id: 3, title: '欧美热单推荐', subtitle: 'Taylor Swift / Ed Sheeran / Adele', color: '#0f3460' },
  { id: 4, title: '日韩潮流风向', subtitle: 'BTS / BLACKPINK 最新回归', color: '#533483' }
]

export {
  platforms,
  platformColors,
  platformIcons,
  artists,
  platformSongs,
  hotSearchTags,
  banners,
  getArtistById,
  getSongsByArtist,
  searchSongs,
  searchArtists
}

function getArtistById(id) {
  return artists.find(a => a.id === id)
}

function getSongsByArtist(artistId) {
  const results = []
  for (const [platform, songs] of Object.entries(platformSongs)) {
    for (const song of songs) {
      if (song.artistId === artistId) results.push(song)
    }
  }
  return results.slice(0, 10)
}

function searchSongs(keyword) {
  if (!keyword) return []
  const kw = keyword.toLowerCase()
  const results = []
  for (const [platform, songs] of Object.entries(platformSongs)) {
    for (const song of songs) {
      if (song.title.toLowerCase().includes(kw) || song.artist.toLowerCase().includes(kw)) {
        results.push(song)
      }
    }
  }
  return results
}

function searchArtists(keyword) {
  if (!keyword) return []
  const kw = keyword.toLowerCase()
  return artists.filter(a => a.name.toLowerCase().includes(kw) || a.region.includes(kw) || a.genre.includes(kw))
}

export function getAllSongs() {
  const all = []
  for (const songs of Object.values(platformSongs)) {
    all.push(...songs)
  }
  return all
}
