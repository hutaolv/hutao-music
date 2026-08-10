import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getPlaylist, savePlaylist, addRecentPlay, getVolume, saveVolume } from '../utils/storage'

export const usePlayerStore = defineStore('player', () => {
  const currentSong = ref(null)
  const playlist = ref(getPlaylist())
  const currentIndex = ref(-1)
  const isPlaying = ref(false)
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
    addRecentPlay(song)
    isPlaying.value = true
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
    currentSong.value = playlist.value[currentIndex.value]
    addRecentPlay(currentSong.value)
    isPlaying.value = true
  }

  function playPrev() {
    if (playlist.value.length === 0) return
    if (playMode.value === 'random') {
      currentIndex.value = Math.floor(Math.random() * playlist.value.length)
    } else {
      currentIndex.value = (currentIndex.value - 1 + playlist.value.length) % playlist.value.length
    }
    currentSong.value = playlist.value[currentIndex.value]
    addRecentPlay(currentSong.value)
    isPlaying.value = true
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

  // 播放全部：清空原播放列表并替换为传入列表，从第一首开始播放
  function playAll(songs) {
    if (!songs?.length) return
    playlist.value = [...songs]
    currentIndex.value = 0
    currentSong.value = songs[0]
    savePlaylist(playlist.value)
    addRecentPlay(currentSong.value)
    isPlaying.value = true
  }

  return {
    currentSong, playlist, currentIndex, isPlaying, volume, currentTime, duration,
    playMode,     showPlaylist, playModes, nextMode,
    rawLyrics, rawTransLyrics, currentLyricIndex, desktopLyrics, showLyricsPanel, seekTime,
    playSong, togglePlay, playNext, playPrev, addToPlaylist, removeFromPlaylist,
    clearPlaylist, setVolume, togglePlayMode, togglePlaylist, playAll
  }
})
