import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { getPlaylist, savePlaylist, addRecentPlay, getVolume, saveVolume, getDesktopLyricsColor, getCurrentSong, saveCurrentSong } from '../utils/storage'

// 收藏/历史改用 IndexedDB 后 addRecentPlay 为异步，播放流程不等待返回值，静默失败即可
function recordRecent(song) {
  addRecentPlay(song).catch(() => {})
}

export const usePlayerStore = defineStore('player', () => {
  const currentSong = ref(null)
  const playlist = ref(getPlaylist())
  const currentIndex = ref(-1)
  const isPlaying = ref(false)
  // 用户主动播放意图标记：playAll/playNext 等设置为 true，
  // currentSong watcher 中发现此标记时保留 isPlaying=true，异步获取 URL 后自动播放
  const pendingUserPlay = ref(false)
  const volume = ref(getVolume())
  const currentTime = ref(0)
  const duration = ref(0)
  const playMode = ref('sequence')
  const showPlaylist = ref(false)
  const rawLyrics = ref('')
  const rawTransLyrics = ref('')
  const currentLyricIndex = ref(-1)
  const desktopLyrics = ref(false)
  const showLyricsPanel = ref(false)
  const seekTime = ref(-1)
  // 收藏变更版本号：任意入口（播放条/榜单/歌曲卡）收藏变动后 +1，首页据此刷新"我的喜欢"列表
  const favVersion = ref(0)
  // 音质切换信号：歌词页切换音质时 +1，PlayerBar 监听后立即重新获取对应音质的播放地址
  const qualityVersion = ref(0)
  // 歌词颜色：桌面歌词/歌词页共享，修改任一处同步生效
  const lyricColor = ref(getDesktopLyricsColor())

  const playModes = ['sequence', 'loop', 'random']

  const nextMode = computed(() => playModes[(playModes.indexOf(playMode.value) + 1) % playModes.length])

  function playSong(song) {
    currentSong.value = song
    const idx = playlist.value.findIndex(s => s.id === song.id)
    if (idx === -1) {
      playlist.value.unshift(song)
      currentIndex.value = 0
    } else {
      currentIndex.value = idx
    }
    savePlaylist(playlist.value)
    recordRecent(song)
    pendingUserPlay.value = true
  }

  function togglePlay() {
    if (currentSong.value) {
      isPlaying.value = !isPlaying.value
    }
  }

  function playNext() {
    if (playlist.value.length === 0) return
    if (playMode.value === 'random') {
      currentIndex.value = Math.floor(Math.random() * playlist.value.length)
    } else {
      currentIndex.value = (currentIndex.value + 1) % playlist.value.length
    }
    pendingUserPlay.value = true
    currentSong.value = playlist.value[currentIndex.value]
    recordRecent(currentSong.value)
  }

  function playPrev() {
    if (playlist.value.length === 0) return
    if (playMode.value === 'random') {
      currentIndex.value = Math.floor(Math.random() * playlist.value.length)
    } else {
      currentIndex.value = (currentIndex.value - 1 + playlist.value.length) % playlist.value.length
    }
    pendingUserPlay.value = true
    currentSong.value = playlist.value[currentIndex.value]
    recordRecent(currentSong.value)
  }

  function addToPlaylist(song) {
    if (!playlist.value.find(s => s.id === song.id)) {
      playlist.value.push(song)
      savePlaylist(playlist.value)
    }
  }

  function removeFromPlaylist(songId) {
    const idx = playlist.value.findIndex(s => s.id === songId)
    if (idx === -1) return
    if (idx === currentIndex.value) {
      if (playlist.value.length === 1) {
        currentSong.value = null
        currentIndex.value = -1
        isPlaying.value = false
      } else {
        currentIndex.value = idx % (playlist.value.length - 1)
        currentSong.value = playlist.value[currentIndex.value]
      }
    } else if (idx < currentIndex.value) {
      currentIndex.value--
    }
    playlist.value.splice(idx, 1)
    savePlaylist(playlist.value)
  }

  function clearPlaylist() {
    playlist.value = []
    currentSong.value = null
    currentIndex.value = -1
    isPlaying.value = false
    savePlaylist(playlist.value)
  }

  function setVolume(v) {
    volume.value = v
    saveVolume(v)
  }

  function togglePlayMode() {
    playMode.value = nextMode.value
  }

  function togglePlaylist() {
    showPlaylist.value = !showPlaylist.value
  }

  // 关闭播放列表面板（供面板内关闭按钮使用）
  function closePlaylist() {
    showPlaylist.value = false
  }

  // 播放全部：清空原播放列表并替换为传入列表，从第一首开始播放
  function playAll(songs) {
    if (!songs?.length) return
    playlist.value = [...songs]
    currentIndex.value = 0
    currentSong.value = songs[0]
    savePlaylist(playlist.value)
    recordRecent(currentSong.value)
    pendingUserPlay.value = true
  }

  // 通知收藏列表变更（首页据此刷新"我的喜欢"）
  function touchFavVersion() {
    favVersion.value++
  }

  // 通知音质切换（歌词页切音质后调用，PlayerBar 监听后立即切换播放地址）
  function touchQualitySwitch() {
    qualityVersion.value++
  }

  // === 跨标签页同步 ===
  // 当前标签页修改时写入 localStorage，其他标签页通过 storage 事件感知变化
  let skipPlaylistSave = false
  let skipSongSave = false

  watch(currentSong, (song) => {
    if (!skipSongSave) saveCurrentSong(song)
    skipSongSave = false
  })
  watch(playlist, (list) => {
    if (!skipPlaylistSave) savePlaylist(list)
    skipPlaylistSave = false
  })

  // 监听其他标签页的 localStorage 变化，同步播放列表和当前歌曲
  window.addEventListener('storage', (e) => {
    if (e.key === 'musichub_playlist') {
      skipPlaylistSave = true
      playlist.value = getPlaylist()
    } else if (e.key === 'musichub_current_song') {
      const song = getCurrentSong()
      if (song?.id !== currentSong.value?.id) {
        skipSongSave = true
        currentSong.value = song
      }
    }
  })

  return {
    currentSong, playlist, currentIndex, isPlaying, pendingUserPlay, volume, currentTime, duration,
    playMode,     showPlaylist, playModes, nextMode,
    rawLyrics, rawTransLyrics, currentLyricIndex, desktopLyrics, showLyricsPanel, seekTime, favVersion, qualityVersion, lyricColor,
    playSong, togglePlay, playNext, playPrev, addToPlaylist, removeFromPlaylist,
    clearPlaylist, setVolume, togglePlayMode, togglePlaylist, closePlaylist, playAll, touchFavVersion, touchQualitySwitch
  }
})
