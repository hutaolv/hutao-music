<template>
  <div v-show="store.currentSong" class="player-bar">
    <div class="player-inner">
      <div class="player-left">
        <div v-if="store.currentSong" class="song-info">
          <div class="cover-wrap" @click="goLyrics">
            <img :src="store.currentSong.cover" :alt="store.currentSong.title" class="cover" @error="onImgError" />
            <div class="cover-expand">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </div>
          </div>
          <div class="text">
            <div class="title">{{ store.currentSong.title }}</div>
            <div class="artist" :title="store.currentSong.artist">{{ store.currentSong.artist }}</div>
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
        <div class="quality-wrap" ref="qualityWrap">
          <button class="ctrl-btn quality-btn" :class="{ boosted: quality !== 'standard' }" @click.stop="toggleQualityMenu" title="音质">{{ qualityLabel }} <span class="quality-caret">&#x25BE;</span></button>
          <transition name="fade">
            <div v-if="showQualityMenu" class="quality-menu">
              <div class="quality-menu-title">音质选择</div>
              <div v-for="o in menuOptions" :key="o.value" class="quality-option" :class="{ active: o.value === quality }" @click="setQuality(o.value)">
                <span class="quality-check">{{ o.value === quality ? '&#x2713;' : '' }}</span>
                {{ o.label }}
              </div>
            </div>
          </transition>
        </div>
        <button class="ctrl-btn" :class="{ active: store.showLyricsPanel }" @click="store.showLyricsPanel = !store.showLyricsPanel" title="歌词面板">&#x1F3B5;</button>
        <button class="ctrl-btn" :class="{ active: store.desktopLyrics }" @click="store.desktopLyrics = !store.desktopLyrics" title="桌面歌词">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/></svg>
        </button>
        <button v-if="downloadUrl" class="ctrl-btn" @click="downloadSong" title="下载歌曲">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
        <button class="ctrl-btn" @click="toggleMute">&#x1F50A;</button>
        <div class="volume-bar" ref="volumeRef" @click="seekVolume">
          <div class="volume-track">
            <div class="volume-fill" :style="{ width: store.volume * 100 + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <transition name="slide-up">
      <div v-if="store.showLyricsPanel && parsedLyrics.length" class="lyrics-panel" ref="lyricsRef">
        <div class="lyrics-content">
          <div v-for="(line, i) in parsedLyrics" :key="i"
            class="lyric-line"
            :class="{ active: store.currentLyricIndex === i }"
            :ref="el => { if (i === store.currentLyricIndex) lyricActiveEl = el }"
            @click="seekTo(line.time)">
            {{ line.text }}
          </div>
        </div>
      </div>
    </transition>

    <transition name="slide-up">
      <Playlist v-if="store.showPlaylist" />
    </transition>

    <transition name="fade">
      <div v-if="vipToast" class="vip-toast">付费音乐，暂时无法播放，2秒后自动跳过</div>
    </transition>
    <transition name="fade">
      <div v-if="playFailedToast" class="vip-toast failed-toast">胡桃暂时无法获取该歌曲，5秒后自动跳过</div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { getFavorites, addFavorite, removeFavorite } from '../utils/storage'
import { getSongUrl, getLyrics } from '../services/api'
import Playlist from './Playlist.vue'

const store = usePlayerStore()
const router = useRouter()
const progressRef = ref(null)
const volumeRef = ref(null)
const lyricsRef = ref(null)
const lyricActiveEl = ref(null)
const isFav = ref(false)
const downloadUrl = ref('')

// 音质档位：standard=标准 high=高音质 lossless=无损（本地持久化，切换时重新获取播放地址）
const qualityOptions = [
  { value: 'standard', label: '标准' },
  { value: 'high', label: '高音质' },
  { value: 'lossless', label: '无损' }
]
const quality = ref(localStorage.getItem('playQuality') || 'standard')
const showQualityMenu = ref(false)
const qualityWrap = ref(null)
// 当前歌曲实际可用的音质档位（播放时探测得到），没有的音质不显示在菜单里
const availableQualities = ref(['standard'])

const qualityLabel = computed(() => {
  const o = qualityOptions.find(o => o.value === quality.value)
  return o ? o.label : '标准'
})

// 菜单只展示当前歌曲实际可用的音质
const menuOptions = computed(() => {
  return qualityOptions.filter(o => availableQualities.value.includes(o.value))
})

function toggleQualityMenu() {
  showQualityMenu.value = !showQualityMenu.value
}

// 点击音质菜单外部时关闭菜单
function onDocClick(e) {
  if (qualityWrap.value && !qualityWrap.value.contains(e.target)) showQualityMenu.value = false
}

// 切换音质：保存偏好，若正在播放则重新获取当前歌曲的对应音质地址并保持进度
async function setQuality(q) {
  showQualityMenu.value = false
  if (q === quality.value) return
  quality.value = q
  localStorage.setItem('playQuality', q)
  const song = store.currentSong
  if (song && !song.vip && audio && audio.src) {
    const t = audio.currentTime
    const wasPlaying = store.isPlaying
    const url = await getSongUrl(song, q)
    if (url) {
      audio.src = url
      audio.currentTime = t
      downloadUrl.value = url
      if (wasPlaying) audio.play().catch(() => {})
    }
  }
}

const parsedLyrics = computed(() => {
  const lines = store.rawLyrics.split('\n')
  const result = []
  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/)
    if (match) {
      const m = parseInt(match[1])
      const s = parseInt(match[2])
      const ms = parseInt(match[3].padEnd(3, '0'))
      result.push({ time: m * 60 + s + ms / 1000, text: match[4].trim() })
    }
  }
  return result.sort((a, b) => a.time - b.time)
})

function goLyrics() {
  if (router.currentRoute.value.path === '/lyrics') {
    router.back()
  } else {
    router.push('/lyrics')
  }
}

function seekTo(time) {
  store.seekTime = time
}

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

const vipToast = ref(false)
const playFailedToast = ref(false)
let vipSkipTimer = null
let playFailedTimer = null
let audio = null

// 拿不到真实音频时：提示"无法获取"，5 秒后自动跳下一首
function showPlayFailed() {
  if (playFailedTimer) clearTimeout(playFailedTimer)
  store.isPlaying = false
  playFailedToast.value = true
  playFailedTimer = setTimeout(() => {
    playFailedToast.value = false
    if (store.currentSong) store.playNext()
  }, 5000)
}

function initAudio() {
  audio = new Audio()
  audio.volume = store.volume
  audio.addEventListener('timeupdate', updateLyrics)
  audio.addEventListener('ended', onEnded)
  audio.addEventListener('loadedmetadata', () => {
    store.duration = audio.duration
  })
}

function updateLyrics() {
  store.currentTime = audio.currentTime
  if (!parsedLyrics.value.length) return
  const t = audio.currentTime
  let idx = -1
  for (let i = parsedLyrics.value.length - 1; i >= 0; i--) {
    if (t >= parsedLyrics.value[i].time) { idx = i; break }
  }
  if (idx !== store.currentLyricIndex) {
    store.currentLyricIndex = idx
    if (idx >= 0) {
      nextTick(() => {
        lyricActiveEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  }
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
  if (vipSkipTimer) { clearTimeout(vipSkipTimer); vipSkipTimer = null }
  if (playFailedTimer) { clearTimeout(playFailedTimer); playFailedTimer = null }
  vipToast.value = false
  playFailedToast.value = false
  store.showLyricsPanel = false
  store.rawLyrics = ''
  store.rawTransLyrics = ''
  store.currentLyricIndex = -1
  downloadUrl.value = ''
  if (song) {
    if (song.vip) {
      store.isPlaying = false
      audio.pause()
      audio.src = ''
      vipToast.value = true
      vipSkipTimer = setTimeout(() => {
        vipToast.value = false
        store.playNext()
      }, 2000)
      return
    }
    isFav.value = getFavorites().some(s => s.id === song.id)
    let url = song.audioUrl || song.sourceUrl || ''
    if (!url) {
      // 探测该歌曲可用音质，并确保使用实际可用的音质（用户偏好不可用时回退到可用最高档）
      const res = await getSongUrl(song, quality.value, true)
      availableQualities.value = res.availableQualities || ['standard']
      if (!availableQualities.value.includes(quality.value)) {
        const prefer = ['lossless', 'high', 'standard'].find(q => availableQualities.value.includes(q))
        if (prefer && prefer !== quality.value) {
          quality.value = prefer
          url = await getSongUrl(song, prefer)
        } else {
          url = res.url
        }
      } else {
        url = res.url
      }
    }
    if (url) {
      audio.src = url
      audio.play().catch(() => {})
      store.isPlaying = true
      downloadUrl.value = url
      const lrc = await getLyrics(song)
      if (lrc) {
        store.rawLyrics = lrc.lyrics || ''
        store.rawTransLyrics = lrc.transLyrics || ''
      }
    } else {
      // 拿不到真实音频：提示并 5 秒后自动跳下一首
      showPlayFailed()
    }
  }
}, { immediate: true })

watch(() => store.isPlaying, (playing) => {
  if (!audio || store.currentSong?.vip) return
  if (playing && audio.src) {
    audio.play().catch(() => {})
  } else {
    audio.pause()
  }
})

watch(() => store.volume, (v) => {
  if (audio) audio.volume = v
})

watch(() => store.seekTime, (t) => {
  if (t >= 0 && audio && audio.src) {
    audio.currentTime = t
    store.currentTime = t
    store.seekTime = -1
  }
})

async function downloadSong() {
  if (!store.currentSong) return
  if (!downloadUrl.value) return
  try {
    const res = await fetch(downloadUrl.value)
    const blob = await res.blob()
    const ext = blob.type.includes('mpeg') ? '.mp3' : blob.type.includes('aac') ? '.aac' : '.mp3'
    const filename = `${store.currentSong.title} - ${store.currentSong.artist}${ext}`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  } catch (e) {
    console.warn('Download failed:', e.message)
    const a = document.createElement('a')
    a.href = downloadUrl.value
    a.download = `${store.currentSong.title} - ${store.currentSong.artist}.mp3`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
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
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  if (playFailedTimer) clearTimeout(playFailedTimer)
  if (vipSkipTimer) clearTimeout(vipSkipTimer)
  document.removeEventListener('click', onDocClick)
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

.player-left { width: 280px; flex-shrink: 0; }

.song-info { display: flex; align-items: center; gap: 12px; }
.cover-wrap { position: relative; width: 48px; height: 48px; flex-shrink: 0; cursor: pointer; border-radius: 8px; overflow: hidden; }
.cover-wrap:hover .cover-expand { opacity: 1; }
.song-info .cover { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; display: block; }
.cover-expand {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.45); opacity: 0; transition: opacity 0.2s;
  border-radius: 8px; color: white;
}
.song-info .text .title { font-size: 14px; font-weight: 600; color: var(--text-primary); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.song-info .text .artist { font-size: 12px; color: var(--text-secondary); margin-top: 2px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.song-info.empty .text .title { color: var(--text-muted); }

.fav-btn { font-size: 18px; color: var(--text-muted); transition: color 0.2s, transform 0.2s; margin-left: auto; }
.fav-btn:hover { color: var(--text-secondary); }
.fav-btn.favorited { color: #ef4444; }

.player-center { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.controls { display: flex; align-items: center; gap: 16px; }

.ctrl-btn { font-size: 18px; color: var(--text-secondary); transition: color 0.2s; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; cursor: pointer; }
.ctrl-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.ctrl-btn.active { color: var(--accent-light); }

.play-btn { width: 40px; height: 40px; background: var(--accent); color: white; font-size: 16px; }
.play-btn:hover { background: var(--accent-light); color: white; }

/* 音质选择：按钮 + 上浮菜单（强调视觉） */
.quality-wrap { position: relative; }
.quality-btn {
  font-size: 12px;
  width: auto;
  min-width: 52px;
  height: 28px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  color: var(--text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s;
}
.quality-btn:hover { border-color: var(--accent); color: var(--text-primary); }
/* 非标准音质时按钮高亮，提示当前正在用高音质/无损 */
.quality-btn.boosted { border-color: var(--accent); color: var(--accent-light); }
.quality-caret { font-size: 9px; opacity: 0.75; }

.quality-menu {
  position: absolute;
  bottom: 44px;
  right: -8px;
  background: #181830;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  padding: 6px;
  min-width: 124px;
  z-index: 100;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.55);
}
/* 指向按钮的小箭头 */
.quality-menu::before {
  content: '';
  position: absolute;
  top: -5px;
  right: 20px;
  width: 10px;
  height: 10px;
  background: #181830;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  border-left: 1px solid rgba(255, 255, 255, 0.14);
  transform: rotate(45deg);
}
.quality-menu-title {
  font-size: 11px;
  color: var(--text-muted);
  padding: 4px 10px 6px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 4px;
}
.quality-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  white-space: nowrap;
  transition: all 0.2s;
}
.quality-check {
  display: inline-block;
  width: 14px;
  text-align: center;
  font-weight: 700;
}
.quality-option:hover { background: rgba(99, 102, 241, 0.15); color: var(--text-primary); }
.quality-option.active { background: var(--accent); color: #fff; font-weight: 600; }

.progress-area { width: 100%; max-width: 520px; display: flex; align-items: center; gap: 12px; }
.time { font-size: 11px; color: var(--text-muted); min-width: 35px; text-align: center; font-variant-numeric: tabular-nums; }
.progress-bar { flex: 1; height: 20px; display: flex; align-items: center; cursor: pointer; }
.progress-track { width: 100%; height: 4px; background: var(--border-color); border-radius: 2px; position: relative; }
.progress-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.1s linear; }
.progress-thumb { position: absolute; top: 50%; width: 12px; height: 12px; background: white; border-radius: 50%; transform: translate(-50%, -50%); opacity: 0; transition: opacity 0.2s; pointer-events: none; }
.progress-bar:hover .progress-thumb { opacity: 1; }
.progress-bar:hover .progress-track { height: 6px; }
.progress-bar:hover .progress-fill { height: 6px; }

.player-right { width: 200px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; justify-content: flex-end; }

.volume-bar { width: 100px; height: 20px; display: flex; align-items: center; cursor: pointer; }
.volume-track { width: 100%; height: 4px; background: var(--border-color); border-radius: 2px; }
.volume-fill { height: 100%; background: var(--accent-light); border-radius: 2px; }

.lyrics-panel {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600px;
  max-height: 300px;
  overflow: hidden;
  background: rgba(12, 12, 20, 0.96);
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: 12px 12px 0 0;
  padding: 20px;
}

.lyrics-content {
  height: 100%;
  max-height: 260px;
  overflow-y: auto;
  scroll-behavior: smooth;
}

.lyric-line {
  font-size: 14px;
  line-height: 2;
  color: var(--text-muted);
  text-align: center;
  transition: color 0.3s, font-size 0.3s;
  padding: 4px 0;
  cursor: pointer;
}

.lyric-line.active {
  color: var(--accent-light);
  font-size: 16px;
  font-weight: 600;
}

.lyrics-content::-webkit-scrollbar { width: 4px; }
.lyrics-content::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }

.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.3s, opacity 0.3s; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(20px); opacity: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.vip-toast {
  position: absolute;
  top: -48px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(239, 68, 68, 0.92);
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  z-index: 300;
  pointer-events: none;
}

/* 拿不到真实音频时的提示样式 */
.failed-toast { background: rgba(249, 115, 22, 0.92); }

@media (max-width: 768px) {
  .player-left { width: 180px; }
  .player-right { width: 120px; }
  .volume-bar { width: 60px; }
}
</style>
