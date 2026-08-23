<template>
  <div v-show="store.currentSong" class="player-bar" @click="onPlayerBarClick">
    <div class="progress-area" ref="progressRef" :class="{ dragging: isDragging }" @click="seekProgress" @mousedown.prevent="startDrag" @touchstart.prevent="startDragTouch">
      <span class="time">{{ formatTime(store.currentTime) }}</span>
      <div class="progress-bar">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: displayPercent + '%' }"></div>
          <div class="progress-thumb" :style="{ left: displayPercent + '%' }"></div>
        </div>
      </div>
      <span class="time">{{ formatTime(durationSec) }}</span>
    </div>
    <div class="player-inner">
      <div class="player-left">
        <div v-if="store.currentSong" class="song-info">
          <div class="cover-wrap" @click="onCoverClick">
            <img :src="store.currentSong.cover" :alt="store.currentSong.title" class="cover" @error="onImgError" />
            <canvas ref="miniSpecRef" class="mini-spectrum"></canvas>
            <div class="cover-expand">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </div>
          </div>
          <div class="text">
            <div class="title">{{ store.currentSong.title }}</div>
            <div class="artist" :title="store.currentSong.artist">{{ store.currentSong.artist }}</div>
          </div>
          <button class="fav-btn desktop-only" :class="favClass" @click="toggleFav"><span class="fav-heart">&#x2665;</span></button>
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
            <!-- 顺序播放：列表+播放箭头 -->
            <svg v-if="store.playMode === 'sequence'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            <!-- 单曲循环：圆形箭头+1 -->
            <svg v-else-if="store.playMode === 'loop'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              <text x="12" y="15" font-size="8" text-anchor="middle" fill="currentColor" stroke="none" font-weight="bold">1</text>
            </svg>
            <!-- 随机播放：交叉箭头 -->
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
          </button>
          <button class="ctrl-btn" @click="store.playPrev">&#x23EE;</button>
          <button class="ctrl-btn play-btn" @click="store.togglePlay">
            <span v-if="store.isPlaying">&#x23F8;</span>
            <span v-else>&#x25B6;</span>
          </button>
          <button class="ctrl-btn" @click="store.playNext">&#x23ED;</button>
          <button class="ctrl-btn spectrum-btn" :class="{ active: showSpectrum }" @click="toggleSpectrum" title="频谱开关">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <rect x="4" y="14" width="3" height="6" rx="1"/>
              <rect x="9" y="10" width="3" height="10" rx="1"/>
              <rect x="14" y="6" width="3" height="14" rx="1"/>
              <rect x="19" y="2" width="3" height="18" rx="1"/>
            </svg>
          </button>
          <template v-if="showSpectrum">
            <button class="ctrl-btn style-btn" :class="{ active: spectrumStyle === 'waveform' }" @click="setSpectrumStyle('waveform')" title="波形频谱">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 12h2l2-6 3 12 3-8 2 4h2l2-2 2 4h2"/>
              </svg>
            </button>
            <button class="ctrl-btn style-btn" :class="{ active: spectrumStyle === 'circle' }" @click="setSpectrumStyle('circle')" title="环形频谱">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="8"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="ctrl-btn color-btn" :class="{ active: spectrumColor === 'rainbow' }" @click="setSpectrumColor('rainbow')" title="彩虹色">
              <span class="color-dot rainbow"></span>
            </button>
            <button class="ctrl-btn color-btn" :class="{ active: spectrumColor === 'amber' }" @click="setSpectrumColor('amber')" title="琥珀色">
              <span class="color-dot amber"></span>
            </button>
          </template>
          <button class="ctrl-btn playlist-toggle-btn" @click="store.togglePlaylist" :class="{ active: store.showPlaylist }">&#x2630;</button>
        </div>
      </div>

      <div class="player-right">
        <button class="fav-btn mobile-only" :class="favClass" @click="toggleFav"><span class="fav-heart">&#x2665;</span></button>
        <button class="ctrl-btn lyrics-btn" :class="{ active: store.showLyricsPanel }" @click="store.showLyricsPanel = !store.showLyricsPanel" title="歌词面板">&#x1F3B5;</button>
        <button class="ctrl-btn desktop-lyrics-btn" :class="{ active: store.desktopLyrics }" @click="store.desktopLyrics = !store.desktopLyrics" title="桌面歌词">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/></svg>
        </button>
        <div class="volume-wrap" ref="volumeWrapRef">
          <button class="ctrl-btn" @click.stop="toggleVolumePopup" @mouseenter="showVolumePopup = true">&#x1F50A;</button>
          <transition name="fade">
            <div v-if="showVolumePopup" class="volume-popup" @mouseenter="showVolumePopup = true" @mouseleave="showVolumePopup = false" @click.stop>
              <div class="volume-popup-track" ref="volumeRef" @mousedown.prevent="startVolumeDrag" @touchstart.prevent="startVolumeDragTouch">
                <div class="volume-popup-fill" :style="{ height: store.volume * 100 + '%' }"></div>
                <div class="volume-popup-thumb" :style="{ bottom: store.volume * 100 + '%' }"></div>
              </div>
            </div>
          </transition>
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

    <!-- 频谱可视化：根据样式切换波形或环形 -->
    <transition name="fade">
      <div v-if="store.currentSong && showSpectrum" class="spectrum-overlay" :class="'style-' + spectrumStyle">
        <!-- 波形线条频谱 -->
        <AudioVisualizer
          v-if="spectrumStyle === 'waveform'"
          :is-playing="store.isPlaying"
          spectrum-style="waveform"
          :bar-count="120"
          :colors="COLOR_PRESETS[spectrumColor]"
          :glow="true"
          :line-width="2"
          :taper="0.85"
        />
        <!-- 环形LED频谱 -->
        <AudioVisualizer
          v-else
          :is-playing="store.isPlaying"
          spectrum-style="circle"
          :bar-count="72"
          :colors="COLOR_PRESETS[spectrumColor]"
          :glow="true"
          :mirror="true"
          :segments="10"
          :gap-ratio="0.35"
        />
      </div>
    </transition>

    <transition name="fade">
      <div v-if="playFailedToast" class="vip-toast failed-toast">胡桃暂时无法获取该歌曲，2秒后自动跳过</div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { getFavorites, addFavorite, removeFavorite } from '../utils/storage'
import { getSongUrl, getLyrics } from '../services/api'
import { toAbsolute } from '../services/api'
import { initAudioGraph, enableSpectrumGraph, setGraphVolume, resumeAudio, setSpectrumActive, registerCanvas, isGraphActive } from '../utils/spectrum'
import Playlist from './Playlist.vue'
import AudioVisualizer from './AudioVisualizer.vue'

const store = usePlayerStore()
const router = useRouter()
const progressRef = ref(null)
const volumeRef = ref(null)
const lyricsRef = ref(null)
const lyricActiveEl = ref(null)
const miniSpecRef = ref(null)
const isFav = ref(false)
const anim = ref('')
// 拖动时的进度百分比（独立于 store.currentTime，避免 timeupdate 覆盖拖动位置）
const dragPercent = ref(0)
// 播放条LED频谱开关，持久化到 localStorage
const showSpectrum = ref(localStorage.getItem('playerSpectrum') !== 'off')
// 播放条频谱颜色，持久化到 localStorage
const spectrumColor = ref(localStorage.getItem('playerSpectrumColor') || 'rainbow')
// 播放条频谱样式：waveform=波形线条，circle=环形LED，持久化到 localStorage
const spectrumStyle = ref(localStorage.getItem('playerSpectrumStyle') || 'waveform')
// 颜色配置映射
const COLOR_PRESETS = {
  rainbow: ['#22d3ee', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb923c'],
  amber: ['#fbbf24', '#f59e0b', '#d97706', '#b45309', '#f97316', '#fb923c']
}

// 切换并保存播放条频谱开关状态
function toggleSpectrum() {
  showSpectrum.value = !showSpectrum.value
  localStorage.setItem('playerSpectrum', showSpectrum.value ? 'on' : 'off')
  // 开启频谱时若图尚未接入，在此点击手势内尝试激活（手势内创建 AudioContext 才不会被挂起）
  if (showSpectrum.value && !graphEnabled) {
    const graph = enableSpectrumGraph()
    if (graph) {
      graphEnabled = true
      if (audio) audio.volume = 1
      setGraphVolume(store.volume)
    }
  }
}

// 切换并保存播放条频谱颜色
function setSpectrumColor(color) {
  spectrumColor.value = color
  localStorage.setItem('playerSpectrumColor', color)
}

// 切换并保存播放条频谱样式
function setSpectrumStyle(style) {
  spectrumStyle.value = style
  localStorage.setItem('playerSpectrumStyle', style)
}
let animTimer = null
const isDragging = ref(false)

const favClass = computed(() => {
  const c = { favorited: isFav.value }
  if (anim.value) c[anim.value] = true
  return c
})

// 音质档位（本地持久化，供切换时使用）
const quality = ref(localStorage.getItem('playQuality') || 'standard')
// 当前歌曲实际可用的音质档位（播放时探测得到），用于选择最佳音质
const availableQualities = ref(['standard'])
// 音量弹出面板
const showVolumePopup = ref(false)
const volumeWrapRef = ref(null)

function toggleVolumePopup() {
  showVolumePopup.value = !showVolumePopup.value
}

// 点击外部时关闭菜单
function onDocClick(e) {
  if (volumeWrapRef.value && !volumeWrapRef.value.contains(e.target)) showVolumePopup.value = false
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

// 点击封面：先关闭播放列表，再打开歌词界面
function onCoverClick() {
  if (store.showPlaylist) {
    store.closePlaylist()
  }
  goLyrics()
}

// 点击播放条区域：如果点击的不是播放列表内部或播放列表按钮，关闭播放列表
function onPlayerBarClick(e) {
  if (!store.showPlaylist) return
  // 检查点击目标是否在播放列表内部
  const playlistEl = document.querySelector('.playlist-panel')
  if (playlistEl && playlistEl.contains(e.target)) return
  // 检查点击目标是否是播放列表按钮（包含 ☰ 图标的按钮）
  if (e.target.closest('.playlist-toggle-btn')) return
  // 点击的是播放列表外部，关闭播放列表
  store.closePlaylist()
}

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

// 进度条显示值：拖动时用 dragPercent，否则用 progressPercent
const displayPercent = computed(() => isDragging.value ? dragPercent.value : progressPercent.value)

const playModeText = computed(() => {
  switch (store.playMode) {
    case 'sequence': return '顺序播放'
    case 'loop': return '单曲循环'
    case 'random': return '随机播放'
    default: return ''
  }
})

const playFailedToast = ref(false)
let playFailedTimer = null
let audio = null
let unregisterMiniSpec = null

// 拿不到真实音频时：提示"无法获取"，2 秒后自动跳下一首
function showPlayFailed() {
  if (playFailedTimer) clearTimeout(playFailedTimer)
  store.isPlaying = false
  playFailedToast.value = true
  playFailedTimer = setTimeout(() => {
    playFailedToast.value = false
    if (store.currentSong) store.playNext()
  }, 2000)
}

function initAudio() {
  audio = new Audio()
  // 默认不接管 Web Audio：先按原生 audio 直出（audio.volume 控音量），保证一定有声音。
  // 仅当用户开启频谱且首次手势成功激活图时才切换为 GainNode 控音（见 onFirstGesture / enableSpectrumGraph）
  initAudioGraph(audio)
  audio.volume = store.volume
  setGraphVolume(store.volume)
  setSpectrumActive(store.isPlaying)
  audio.addEventListener('timeupdate', updateLyrics)
  audio.addEventListener('ended', onEnded)
  audio.addEventListener('loadedmetadata', () => {
    store.duration = audio.duration
  })
  // 后台回来时若状态是播放中但音频暂停（如后台切歌被系统打断/拒绝），自动恢复
  document.addEventListener('visibilitychange', onVisibilityChange)
}

// 是否希望显示频谱：播放条频谱开关 或 歌词页环形频谱 任一开启都视为需要频谱
function spectrumWanted() {
  return showSpectrum.value || localStorage.getItem('lyricsSpectrum') !== 'off'
}

// 首次用户手势（click/touchstart 捕获阶段）内同步处理：
// 1) 若用户开启频谱 → 此刻创建 AudioContext 并接入（手势内创建默认为 running，频谱才有数据，不静音）；
// 2) 若创建/恢复失败（部分 Android WebView 不支持）→ 不接管，音频继续原生直出，保证一定有声音
let graphEnabled = false
function onFirstGesture() {
  if (!graphEnabled && spectrumWanted()) {
    const graph = enableSpectrumGraph()
    if (graph) {
      graphEnabled = true
      // 图接管后音量走 GainNode，原生 volume 置 1 避免双重衰减
      if (audio) audio.volume = 1
      setGraphVolume(store.volume)
    }
  }
  resumeAudio()
}

// 注册播放条封面上的迷你频谱画布（封面在 v-if 内，需在歌曲渲染完成后调用）
function registerMiniSpectrum() {
  if (!miniSpecRef.value || unregisterMiniSpec) return
  unregisterMiniSpec = registerCanvas(miniSpecRef.value, {
    bars: 18,
    colors: ['#a5b4fc'],
    mirror: false,
    idleHeight: 0.2,
    glow: true,
    peak: true
  })
  setSpectrumActive(store.isPlaying)
}

function onVisibilityChange() {
  if (document.hidden || !audio) return
  if (store.isPlaying && audio.paused && audio.src) {
    audio.play().catch(() => {})
  }
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

// 预取下一首播放地址：后台切歌时不发起网络请求，直接秒切，规避手机浏览器后台 JS 冻结
const nextUrlCache = { id: null, url: '' }

function getNextSong() {
  const list = store.playlist
  if (!list.length) return null
  if (store.playMode === 'random') return list[Math.floor(Math.random() * list.length)]
  return list[(store.currentIndex + 1) % list.length]
}

async function prefetchNextUrl() {
  const next = getNextSong()
  if (!next || next.id === store.currentSong?.id) return
  // 直链歌曲无需预取，播放时直接可用
  if (next.audioUrl || next.sourceUrl) return
  if (nextUrlCache.id === next.id) return
  try {
    const url = await getSongUrl(next, quality.value)
    if (url) nextUrlCache.id = next.id
    nextUrlCache.url = url
  } catch { /* 预取失败不影响正常播放 */ }
}

// 媒体会话：锁屏/通知栏显示歌曲信息与播放控制，也是 iOS Safari 后台持续播放的必要条件
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return
  const update = () => {
    if (!store.currentSong) return
    const cover = store.currentSong.cover
    navigator.mediaSession.metadata = new MediaMetadata({
      title: store.currentSong.title || '未知歌曲',
      artist: store.currentSong.artist || '未知歌手',
      album: store.currentSong.album || '胡桃音悦',
      artwork: cover ? [{ src: toAbsolute(cover), sizes: '512x512', type: 'image/jpeg' }] : []
    })
    navigator.mediaSession.playbackState = store.isPlaying ? 'playing' : 'paused'
  }
  try {
    navigator.mediaSession.setActionHandler('play', () => store.togglePlay())
    navigator.mediaSession.setActionHandler('pause', () => store.togglePlay())
    navigator.mediaSession.setActionHandler('nexttrack', () => store.playNext())
    navigator.mediaSession.setActionHandler('previoustrack', () => store.playPrev())
  } catch { /* 个别平台不支持个别 action，忽略 */ }
  watch(() => [store.currentSong, store.isPlaying], update)
}

watch(() => store.currentSong, async (song) => {
  if (!audio) return
  if (playFailedTimer) { clearTimeout(playFailedTimer); playFailedTimer = null }
  playFailedToast.value = false
  store.showLyricsPanel = false
  store.rawLyrics = ''
  store.rawTransLyrics = ''
  store.currentLyricIndex = -1
  if (song) {
    // 收藏状态从 IndexedDB 异步读取（同步读取已不适用）
    getFavorites().then(list => {
      isFav.value = list.some(s => s.id === song.id)
    }).catch(() => {})
    // 封面渲染完成后注册迷你频谱画布（切歌时 v-if 重新挂载 canvas）
    nextTick(() => registerMiniSpectrum())
    let url = song.audioUrl || song.sourceUrl || ''
    // 直链播放地址（如 B站/抖音）可能是代理相对路径，APK 里需转成绝对地址
    url = toAbsolute(url)
    // 命中预取缓存：后台自动切歌时直接复用，跳过网络探测
      if (!url && nextUrlCache.id === song.id && nextUrlCache.url) {
      url = nextUrlCache.url
      nextUrlCache.id = null
      nextUrlCache.url = ''
    }
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
      audio.pause()
      audio.src = url
      resumeAudio()
      setSpectrumActive(true)
      audio.play().catch(() => {})
      store.isPlaying = true
      prefetchNextUrl()
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
  if (!audio) return
  if (playing) {
    // 用户手势触发播放时同步恢复 AudioContext（iOS 自动挂起），频谱才有数据
    resumeAudio()
    setSpectrumActive(true)
    if (audio.src) {
      audio.play().catch(() => {})
    }
  } else {
    setSpectrumActive(false)
    audio.pause()
  }
})

watch(() => store.volume, (v) => {
  // 接入 Web Audio 后音量由 GainNode 控制，audio.volume 保持 1（避免双重衰减）
  if (audio && !isGraphActive()) audio.volume = v
  setGraphVolume(v)
})

watch(() => store.seekTime, (t) => {
  if (t >= 0 && audio && audio.src) {
    audio.currentTime = t
    store.currentTime = t
    store.seekTime = -1
  }
})

// 监听音质切换信号：歌词页切换音质后立即重新获取播放地址并切换
watch(() => store.qualityVersion, async () => {
  const song = store.currentSong
  if (!song || !audio || !audio.src) return
  const q = localStorage.getItem('playQuality') || 'standard'
  const t = audio.currentTime
  const wasPlaying = store.isPlaying
  const url = await getSongUrl(song, q)
  if (url) {
    audio.src = url
    audio.currentTime = t
    if (wasPlaying) audio.play().catch(() => {})
  }
})

// 进度条点击跳转：点击位置转换为播放进度
function seekProgress(e) {
  if (!progressRef.value || !durationSec.value || isDragging.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const pct = (e.clientX - rect.left) / rect.width
  store.currentTime = pct * durationSec.value
  if (audio && audio.src) {
    audio.currentTime = store.currentTime
  }
}

// 进度条拖动：mousedown 时开始拖动，监听全局 mousemove/mouseup
function startDrag(e) {
  if (!progressRef.value || !durationSec.value) return
  isDragging.value = true
  updateDrag(e)
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', stopDrag)
}

// 手机端触摸拖动：touchstart 时开始拖动，监听全局 touchmove/touchend
function startDragTouch(e) {
  if (!progressRef.value || !durationSec.value) return
  isDragging.value = true
  updateDrag(e.touches[0])
  document.addEventListener('touchmove', onDragMoveTouch, { passive: false })
  document.addEventListener('touchend', stopDragTouch)
}

function onDragMove(e) {
  if (!isDragging.value) return
  updateDrag(e)
}

function onDragMoveTouch(e) {
  if (!isDragging.value) return
  e.preventDefault()
  updateDrag(e.touches[0])
}

// 更新拖动位置：将鼠标/触摸位置转换为播放进度（仅更新拖动百分比，不立即跳转音频）
function updateDrag(e) {
  if (!progressRef.value || !durationSec.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  dragPercent.value = pct * 100
  store.currentTime = pct * durationSec.value
}

// 停止拖动：移除全局事件监听，并跳转音频到拖动位置
function stopDrag() {
  isDragging.value = false
  if (audio && audio.src) {
    audio.currentTime = store.currentTime
  }
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDrag)
}

function stopDragTouch() {
  isDragging.value = false
  if (audio && audio.src) {
    audio.currentTime = store.currentTime
  }
  document.removeEventListener('touchmove', onDragMoveTouch)
  document.removeEventListener('touchend', stopDragTouch)
}

function seekVolume(e) {
  if (!volumeRef.value) return
  const rect = volumeRef.value.getBoundingClientRect()
  // 垂直音量条：从下往上计算（底部0，顶部1）
  const pct = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
  store.setVolume(pct)
}

// 音量条拖动
let isVolumeDragging = false
function onVolumeDrag(e) {
  if (!isVolumeDragging) return
  seekVolume(e)
}
function onVolumeDragEnd() {
  isVolumeDragging = false
  document.removeEventListener('mousemove', onVolumeDrag)
  document.removeEventListener('mouseup', onVolumeDragEnd)
}
function startVolumeDrag(e) {
  isVolumeDragging = true
  seekVolume(e)
  document.addEventListener('mousemove', onVolumeDrag)
  document.addEventListener('mouseup', onVolumeDragEnd)
}
function onVolumeDragTouch(e) {
  if (!isVolumeDragging) return
  e.preventDefault()
  seekVolume(e.touches[0])
}
function onVolumeDragTouchEnd() {
  isVolumeDragging = false
  document.removeEventListener('touchmove', onVolumeDragTouch)
  document.removeEventListener('touchend', onVolumeDragTouchEnd)
}
function startVolumeDragTouch(e) {
  isVolumeDragging = true
  seekVolume(e.touches[0])
  document.addEventListener('touchmove', onVolumeDragTouch, { passive: false })
  document.addEventListener('touchend', onVolumeDragTouchEnd)
}

function toggleMute() {
  store.setVolume(store.volume > 0 ? 0 : 0.7)
}

async function toggleFav() {
  if (!store.currentSong) return
  isFav.value = !isFav.value
  anim.value = isFav.value ? 'fav-anim-love' : 'fav-anim-break'
  clearTimeout(animTimer)
  animTimer = setTimeout(() => { anim.value = '' }, 800)
  try {
    if (isFav.value) {
      await addFavorite(store.currentSong)
    } else {
      await removeFavorite(store.currentSong.id)
    }
    // 通知首页刷新"我的喜欢"列表
    store.touchFavVersion()
  } catch { /* 忽略落盘失败，UI 已即时反馈 */ }
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
  setupMediaSession()
  document.addEventListener('click', onDocClick)
  // 捕获阶段注册一次性手势解锁：确保首次点击/触摸在用户手势栈内恢复 AudioContext
  document.addEventListener('click', onFirstGesture, { capture: true, once: true })
  document.addEventListener('touchstart', onFirstGesture, { capture: true, once: true })
  // 首次进入已有歌曲时（watcher immediate 在 audio 初始化前被跳过），封面渲染后补注册
  nextTick(() => registerMiniSpectrum())
})

onUnmounted(() => {
  if (playFailedTimer) clearTimeout(playFailedTimer)
  if (unregisterMiniSpec) unregisterMiniSpec()
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('touchmove', onDragMoveTouch)
  document.removeEventListener('touchend', stopDragTouch)
  document.removeEventListener('click', onFirstGesture)
  document.removeEventListener('touchstart', onFirstGesture)
  if (audio) {
    audio.pause()
    audio = null
  }
})
</script>

<style scoped>
.player-bar {
  position: fixed;
  bottom: env(safe-area-inset-bottom, 0px);
  left: 0;
  right: 0;
  height: var(--player-height);
  background: rgba(12, 12, 20, 0.98);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--border-color);
  z-index: 200;
}

/* 播放进度条置于播放条顶部，全宽横条 */
.progress-area {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 32px;
  cursor: pointer;
}
.progress-bar { flex: 1; height: 20px; display: flex; align-items: center; cursor: pointer; }
.progress-track { width: 100%; height: 3px; background: var(--border-color); border-radius: 2px; position: relative; }
.progress-fill { height: 100%; background: white; border-radius: 2px; transition: width 0.1s linear; }
.progress-thumb { position: absolute; top: 50%; width: 12px; height: 12px; background: white; border-radius: 50%; transform: translate(-50%, -50%); opacity: 0; transition: opacity 0.2s; pointer-events: none; cursor: grab; }
.progress-bar:hover .progress-thumb { opacity: 1; }
.progress-bar:active .progress-thumb { cursor: grabbing; }
.progress-bar:hover .progress-track { height: 5px; }
.progress-bar:hover .progress-fill { height: 5px; }
.progress-area:hover .progress-thumb { opacity: 1; }
/* 手机端拖动时显示进度条圆点和加粗轨道 */
.progress-area.dragging .progress-thumb { opacity: 1; }
.progress-area.dragging .progress-track { height: 5px; }
.progress-area.dragging .progress-fill { height: 5px; }

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
/* 迷你频谱：覆盖在封面的底部，播放时随节奏跳动 */
.mini-spectrum {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 45%;
  pointer-events: none;
  opacity: 0.85;
}
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

.ctrl-btn { font-size: 18px; color: var(--text-secondary); transition: color 0.2s; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; cursor: pointer; background: transparent; }
.ctrl-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.ctrl-btn.active { color: var(--accent-light); background: transparent; }

/* 颜色选择按钮 */
.color-btn { padding: 0; }
.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.3);
}
.color-dot.rainbow {
  background: linear-gradient(135deg, #22d3ee, #818cf8, #f472b6);
}
.color-dot.amber {
  background: linear-gradient(135deg, #fbbf24, #f59e0b, #d97706);
}
.color-btn.active .color-dot {
  border-color: #fff;
  box-shadow: 0 0 6px rgba(255,255,255,0.4);
}

/* 频谱样式选择按钮 */
.style-btn {
  width: 28px !important;
  height: 28px;
}
.style-btn.active {
  color: var(--accent-light);
}

.play-btn { width: 40px; height: 40px; color: var(--text-primary); font-size: 16px; }
.play-btn:hover { color: var(--text-primary); background: var(--bg-hover); }

.progress-area { width: 100%; cursor: pointer; }
.time { font-size: 11px; color: var(--text-muted); min-width: 35px; text-align: center; font-variant-numeric: tabular-nums; }

.player-right { width: 200px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; justify-content: flex-end; }

.mobile-only { display: none; }

.volume-wrap { position: relative; }
.volume-popup {
  position: absolute;
  bottom: 44px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(18, 18, 26, 0.95);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 10px;
  z-index: 100;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.volume-popup::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: rgba(18, 18, 26, 0.95);
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}
.volume-popup-track { width: 6px; height: 100px; background: rgba(255,255,255,0.15); border-radius: 3px; position: relative; cursor: pointer; }
.volume-popup-fill { width: 100%; background: white; border-radius: 3px; position: absolute; bottom: 0; }
.volume-popup-thumb { position: absolute; left: 50%; width: 14px; height: 14px; background: white; border-radius: 50%; transform: translate(-50%, 50%); box-shadow: 0 1px 4px rgba(0,0,0,0.4); pointer-events: none; }

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

/* 频谱覆盖层：置于播放条上方 */
.spectrum-overlay {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: transparent;
  pointer-events: none;
  z-index: -1;
  transition: height 0.3s ease;
}
/* 波形样式：水平展开 */
.spectrum-overlay.style-waveform {
  height: 120px;
}
/* 环形样式：居中圆形 */
.spectrum-overlay.style-circle {
  height: 320px;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  width: 320px;
}

@media (max-width: 767px) {
  /* 手机端取消频谱设置：隐藏开关/颜色按钮（与样式按钮一起）与整块频谱覆盖层，
     仅保留封面上的迷你频谱，保持播放条简洁 */
  .spectrum-btn, .style-btn, .color-btn {
    display: none;
  }
  .spectrum-overlay {
    display: none;
  }
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 手机端（≤767px）：播放条改双行布局——第一行歌曲信息，第二行控制按钮+音质+下载+收藏 */
@media (max-width: 767px) {
  .player-bar {
    bottom: 12px;
  }

  .player-inner {
    flex-wrap: wrap;
    align-content: center;
    gap: 2px 0;
    padding: 0 12px;
  }

  /* 第一行：歌曲信息占满整行 */
  .player-left {
    width: 100%;
  }

  /* 第二行：控制按钮+右侧控件 */
  .player-center {
    width: auto;
    flex: 1;
    gap: 2px;
  }

  /* 手机上显示右侧音质、下载、收藏按钮，隐藏歌词/音量 */
  .player-right {
    width: auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .controls {
    gap: 8px;
    flex-wrap: nowrap;
    justify-content: center;
  }

  .ctrl-btn {
    width: 28px;
    height: 28px;
    font-size: 14px;
  }

  .play-btn {
    width: 34px;
    height: 34px;
  }

  .style-btn {
    display: none;
  }

  .progress-area {
    padding: 0 12px;
  }

  /* 桌面端的收藏按钮在手机端隐藏（移到右侧控件区） */
  .desktop-only {
    display: none;
  }

  .volume-wrap,
  .lyrics-btn,
  .desktop-lyrics-btn {
    display: none;
  }

  .fav-btn {
    font-size: 20px;
    margin-left: 10px;
    margin-right: 4px;
  }

  .mobile-only {
    display: block;
  }
}
</style>
