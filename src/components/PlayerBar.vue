<template>
  <div class="player-bar" :class="{ 'has-song': store.currentSong }">
    <div class="player-inner">
      <div class="player-left">
        <div v-if="store.currentSong" class="song-info">
          <img :src="store.currentSong.cover" :alt="store.currentSong.title" class="cover" @error="onImgError" />
          <div class="text">
            <div class="title">{{ store.currentSong.title }}</div>
            <div class="artist">{{ store.currentSong.artist }}</div>
          </div>
          <button class="fav-btn" :class="{ favorited: isFav }" @click="toggleFav">&#x2665;</button>
        </div>
        <div v-else class="song-info empty">
          <div class="text">
            <div class="title">未播放</div>
            <div class="artist">选择一首歌曲开始播放</div>
          </div>
        </div>
      </div>

      <div class="player-center">
        <div class="controls">
          <button class="ctrl-btn" @click="store.togglePlayMode" :title="playModeText">
            <span v-if="store.playMode === 'sequence'">&#x1F503;</span>
            <span v-else-if="store.playMode === 'loop'">&#x1F501;</span>
            <span v-else>&#x1F500;</span>
          </button>
          <button class="ctrl-btn" @click="store.playPrev">&#x23EE;</button>
          <button class="ctrl-btn play-btn" @click="store.togglePlay">
            <span v-if="store.isPlaying">&#x23F8;</span>
            <span v-else>&#x25B6;</span>
          </button>
          <button class="ctrl-btn" @click="store.playNext">&#x23ED;</button>
          <button class="ctrl-btn" @click="store.togglePlaylist" :class="{ active: store.showPlaylist }">&#x2630;</button>
        </div>
        <div class="progress-area">
          <span class="time">{{ formatTime(store.currentTime) }}</span>
          <div class="progress-bar" ref="progressRef" @click="seekProgress">
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
              <div class="progress-thumb" :style="{ left: progressPercent + '%' }"></div>
            </div>
          </div>
          <span class="time">{{ formatTime(durationSec) }}</span>
        </div>
      </div>

      <div class="player-right">
        <button class="ctrl-btn" @click="toggleMute">&#x1F50A;</button>
        <div class="volume-bar" ref="volumeRef" @click="seekVolume">
          <div class="volume-track">
            <div class="volume-fill" :style="{ width: store.volume * 100 + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <transition name="slide-up">
      <Playlist v-if="store.showPlaylist" />
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../stores/player'
import { getFavorites, addFavorite, removeFavorite } from '../utils/storage'
import { getSongUrl } from '../services/api'
import Playlist from './Playlist.vue'

const store = usePlayerStore()
const progressRef = ref(null)
const volumeRef = ref(null)
const audioEl = ref(null)
const isFav = ref(false)

const durationSec = computed(() => {
  if (!store.currentSong) return 0
  const parts = store.currentSong.duration.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
})

const progressPercent = computed(() => {
  if (durationSec.value === 0) return 0
  return (store.currentTime / durationSec.value) * 100
})

const playModeText = computed(() => {
  switch (store.playMode) {
    case 'sequence': return '顺序播放'
    case 'loop': return '单曲循环'
    case 'random': return '随机播放'
    default: return ''
  }
})

let audio = null
let intervalId = null

function initAudio() {
  audio = new Audio()
  audio.volume = store.volume
  audio.addEventListener('timeupdate', () => {
    store.currentTime = audio.currentTime
  })
  audio.addEventListener('ended', onEnded)
  audio.addEventListener('loadedmetadata', () => {
    store.duration = audio.duration
  })
}

function onEnded() {
  if (store.playMode === 'loop') {
    audio.currentTime = 0
    audio.play()
  } else {
    store.playNext()
  }
}

watch(() => store.currentSong, async (song) => {
  if (!audio) return
  if (song) {
    isFav.value = getFavorites().some(s => s.id === song.id)
    let url = song.audioUrl || song.sourceUrl || ''
    if (!url) {
      url = await getSongUrl(song)
    }
    if (url) {
      audio.src = url
      audio.play().catch(() => {})
      store.isPlaying = true
    } else {
      simulatePlayback()
    }
  }
}, { immediate: true })

watch(() => store.isPlaying, (playing) => {
  if (!audio) return
  if (playing && audio.src) {
    audio.play().catch(() => {})
  } else {
    audio.pause()
  }
})

watch(() => store.volume, (v) => {
  if (audio) audio.volume = v
})

function simulatePlayback() {
  clearInterval(intervalId)
  if (!store.currentSong || !store.isPlaying) return
  store.currentTime = 0
  intervalId = setInterval(() => {
    if (store.isPlaying) {
      store.currentTime += 1
      if (store.currentTime >= durationSec.value) {
        onEnded()
      }
    }
  }, 1000)
}

function seekProgress(e) {
  if (!progressRef.value || !durationSec.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  store.currentTime = pct * durationSec.value
  if (audio && audio.src) {
    audio.currentTime = store.currentTime
  }
}

function seekVolume(e) {
  if (!volumeRef.value) return
  const rect = volumeRef.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  store.setVolume(pct)
}

function toggleMute() {
  store.setVolume(store.volume > 0 ? 0 : 0.7)
}

function toggleFav() {
  if (!store.currentSong) return
  if (isFav.value) {
    removeFavorite(store.currentSong.id)
  } else {
    addFavorite(store.currentSong)
  }
  isFav.value = !isFav.value
}

function formatTime(t) {
  if (!t || isNaN(t)) return '0:00'
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function onImgError(e) {
  e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect fill="%23333" width="200" height="200"/><text fill="%23666" font-size="14" text-anchor="middle" x="100" y="105">暂无图片</text></svg>'
}

onMounted(() => {
  initAudio()
})

onUnmounted(() => {
  clearInterval(intervalId)
  if (audio) {
    audio.pause()
    audio = null
  }
})
</script>

<style scoped>
.player-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--player-height);
  background: rgba(12, 12, 20, 0.98);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--border-color);
  z-index: 200;
}

.player-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 32px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 24px;
}

.player-left {
  width: 280px;
  flex-shrink: 0;
}

.song-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.song-info .cover {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
}

.song-info .text .title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-info .text .artist {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.song-info.empty .text .title {
  color: var(--text-muted);
}

.fav-btn {
  font-size: 18px;
  color: var(--text-muted);
  transition: color 0.2s, transform 0.2s;
  margin-left: auto;
}

.fav-btn:hover { color: var(--text-secondary); }
.fav-btn.favorited { color: #ef4444; }

.player-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.ctrl-btn {
  font-size: 18px;
  color: var(--text-secondary);
  transition: color 0.2s;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.ctrl-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.ctrl-btn.active { color: var(--accent-light); }

.play-btn {
  width: 40px;
  height: 40px;
  background: var(--accent);
  color: white;
  font-size: 16px;
}

.play-btn:hover { background: var(--accent-light); color: white; }

.progress-area {
  width: 100%;
  max-width: 520px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.time {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 35px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.progress-bar {
  flex: 1;
  height: 20px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.progress-track {
  width: 100%;
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.progress-bar:hover .progress-thumb { opacity: 1; }
.progress-bar:hover .progress-track { height: 6px; }
.progress-bar:hover .progress-fill { height: 6px; }

.player-right {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
}

.volume-bar {
  width: 100px;
  height: 20px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.volume-track {
  width: 100%;
  height: 4px;
  background: var(--border-color);
  border-radius: 2px;
}

.volume-fill {
  height: 100%;
  background: var(--accent-light);
  border-radius: 2px;
}

@media (max-width: 768px) {
  .player-left { width: 180px; }
  .player-right { width: 120px; }
  .volume-bar { width: 60px; }
}
</style>
