<template>
  <div class="lyrics-view" v-if="store.currentSong">
    <div class="lyrics-bg" :style="{ backgroundImage: store.currentSong.cover ? `url(${store.currentSong.cover})` : 'none' }"></div>
    <div class="lyrics-overlay"></div>
    <div class="lyrics-container" :class="[playerStyle, { 'page-exit-up': pageAnim === 'exit-up', 'page-exit-down': pageAnim === 'exit-down', 'page-enter': pageAnim === 'enter' }]" @touchstart.passive="onTouchStart" @touchend="onTouchEnd" @mousedown="onMouseDown" @wheel="onWheel">
      <!-- 旋转/黑胶样式：左侧大图盘 + LED环形频谱包围 -->
      <div v-if="playerStyle === 'disc' || playerStyle === 'vinyl'" class="side-panel">
        <div class="album-art-wrap" :class="{ 'with-spectrum': showSpectrum }">
          <!-- LED环形频谱包围封面 -->
          <canvas v-if="showSpectrum" ref="ringSpecRef" class="ring-spectrum" :class="{ spinning: store.isPlaying }"></canvas>
          <img v-if="playerStyle === 'disc' && store.currentSong.cover && !coverBroken" :src="store.currentSong.cover" alt="" class="album-art" :class="{ spinning: store.isPlaying }" @error="onImgError" />
          <!-- 黑胶样式或封面缺失时显示复古黑胶唱片 -->
          <div v-else class="album-art vinyl-disc" :class="{ spinning: store.isPlaying }" v-html="vinylSvg"></div>
        </div>
        <div class="song-meta">
          <div class="song-title">{{ store.currentSong.title }}</div>
          <div class="song-artist">{{ store.currentSong.artist }}</div>
        </div>
      </div>
      <!-- 经典样式：顶部横排小封面，不旋转 -->
      <div v-else class="song-info">
        <img v-if="store.currentSong.cover && !coverBroken" :src="store.currentSong.cover" alt="" class="song-info-art" @error="onImgError" />
        <div v-else class="song-info-art vinyl-disc small" :class="{ spinning: store.isPlaying }" v-html="vinylSvg"></div>
        <div class="song-meta-h">
          <div class="song-title">{{ store.currentSong.title }}</div>
          <div class="song-artist">{{ store.currentSong.artist }}</div>
        </div>
      </div>
      <div class="lyrics-scroll" ref="lyricsRef">
        <div v-if="!parsedLyrics.length" class="no-lyrics">暂无歌词</div>
        <div v-for="(line, i) in parsedLyrics" :key="i"
          class="lyric-line"
          :class="{ active: store.currentLyricIndex === i }"
          :style="store.currentLyricIndex === i ? { color: store.lyricColor } : {}"
          :ref="el => { if (i === store.currentLyricIndex) lyricActiveEl = el }"
          @click="seekTo(line.time)">
          {{ line.text }}
        </div>
      </div>
    </div>
    <button class="desktop-btn" @click="toggleDesktop" :class="{ active: store.desktopLyrics }" title="桌面歌词">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/></svg>
    </button>
    <button class="close-btn" @click="goBack" title="返回">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
    </button>
    <!-- 播放器样式切换：旋转 / 黑胶 / 经典 + 频谱开关 + 颜色选择 + 下载（桌面/平板横排展示） -->
    <div class="style-switch">
      <button :class="{ active: playerStyle === 'disc' }" @click="setStyle('disc')">旋转</button>
      <button :class="{ active: playerStyle === 'vinyl' }" @click="setStyle('vinyl')">复古</button>
      <button :class="{ active: playerStyle === 'plain' }" @click="setStyle('plain')">经典</button>
      <span class="switch-sep"></span>
      <button class="spectrum-toggle" :class="{ active: showSpectrum }" @click="toggleSpectrum" title="频谱开关">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <rect x="4" y="14" width="3" height="6" rx="1"/>
          <rect x="9" y="10" width="3" height="10" rx="1"/>
          <rect x="14" y="6" width="3" height="14" rx="1"/>
          <rect x="19" y="2" width="3" height="18" rx="1"/>
        </svg>
      </button>
      <template v-if="showSpectrum">
        <span class="switch-sep"></span>
        <button class="color-btn" :class="{ active: spectrumColor === 'rainbow' }" @click="setSpectrumColor('rainbow')" title="彩虹色">
          <span class="color-dot rainbow"></span>
        </button>
        <button class="color-btn" :class="{ active: spectrumColor === 'amber' }" @click="setSpectrumColor('amber')" title="琥珀色">
          <span class="color-dot amber"></span>
        </button>
      </template>
      <span class="switch-sep"></span>
      <button class="dl-btn" :disabled="!downloadUrl || isDownloading" @click="downloadSong" title="下载歌曲">
        <svg v-if="!isDownloading" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span v-else class="dl-spinner"></span>
      </button>
    </div>
    <!-- 手机端播放器设置按钮（齿轮）：点击弹出设置面板调整样式/频谱/颜色，仅手机端显示 -->
    <button class="mobile-settings-btn" @click="mobileSettingsOpen = true" title="播放器设置">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.03.64.08.94L2.83 14.52a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.23.41.47.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/>
      </svg>
    </button>
    <!-- 手机端播放器设置面板：底部弹出，含样式/频谱开关/颜色三项 -->
    <transition name="fade">
      <div v-if="mobileSettingsOpen" class="mobile-settings-mask" @click="mobileSettingsOpen = false">
        <div class="mobile-settings-panel" @click.stop>
          <div class="ms-header">
            <span class="ms-title">播放器设置</span>
            <button class="ms-close" @click="mobileSettingsOpen = false" title="关闭">&#x2715;</button>
          </div>
          <!-- 播放器样式：分段控制器 -->
          <div class="ms-group">
            <div class="ms-row">
              <span class="ms-label">播放器样式</span>
              <div class="ms-segment">
                <button class="ms-seg-btn" :class="{ active: playerStyle === 'disc' }" @click="setStyle('disc')">旋转</button>
                <button class="ms-seg-btn" :class="{ active: playerStyle === 'vinyl' }" @click="setStyle('vinyl')">复古</button>
                <button class="ms-seg-btn" :class="{ active: playerStyle === 'plain' }" @click="setStyle('plain')">经典</button>
              </div>
            </div>
          </div>
          <!-- 封面频谱：iOS 风格开关 -->
          <div class="ms-group">
            <div class="ms-row">
              <span class="ms-label">封面频谱</span>
              <button class="ms-toggle" :class="{ active: showSpectrum }" @click="toggleSpectrum">
                <span class="ms-toggle-thumb"></span>
              </button>
            </div>
          </div>
          <!-- 频谱颜色：紧凑带图标胶囊（仅频谱开启时显示） -->
          <div v-if="showSpectrum" class="ms-group">
            <div class="ms-row">
              <span class="ms-label">频谱颜色</span>
              <div class="ms-pills">
                <button class="ms-pill" :class="{ active: spectrumColor === 'rainbow' }" @click="setSpectrumColor('rainbow')">
                  <span class="ms-dot rainbow"></span>彩虹
                </button>
                <button class="ms-pill" :class="{ active: spectrumColor === 'amber' }" @click="setSpectrumColor('amber')">
                  <span class="ms-dot amber"></span>琥珀
                </button>
              </div>
            </div>
          </div>
          <!-- 音质选择：紧凑胶囊组 -->
          <div class="ms-group">
            <div class="ms-row">
              <span class="ms-label">音质选择</span>
              <div class="ms-pills">
                <button v-for="o in menuOptions" :key="o.value"
                  class="ms-pill" :class="{ active: o.value === quality }"
                  @click="setQuality(o.value)">
                  {{ o.label }}
                </button>
              </div>
            </div>
          </div>
          <!-- 下载歌曲：列表项样式 + 右侧箭头 -->
          <div class="ms-divider"></div>
          <button class="ms-download-row" :disabled="!downloadUrl || isDownloading" @click="downloadSong">
            <span v-if="isDownloading" class="dl-spinner"></span>
            <svg v-else class="ms-download-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span class="ms-download-label">{{ isDownloading ? '下载中...' : (downloadUrl ? '点击下载' : '加载中...') }}</span>
            <svg class="ms-arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>
    </transition>
  </div>
  <div v-else class="lyrics-view empty">
    <div class="empty-text">请先播放一首歌曲</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { getSongUrl } from '../services/api'
import { registerCanvas, setSpectrumActive } from '../utils/spectrum'
import { downloadSong as saveSong } from '../utils/download'

const store = usePlayerStore()
const router = useRouter()
const lyricsRef = ref(null)
const lyricActiveEl = ref(null)
const ringSpecRef = ref(null)
let unregisterRingSpec = null
// 播放器样式：disc=旋转圆盘（默认），vinyl=复古黑胶唱片，plain=经典无旋转，选择持久化到本地
const playerStyle = ref(localStorage.getItem('lyricsPlayerStyle') || 'disc')
// 封面图加载失败标记，用于回退显示黑胶唱片
const coverBroken = ref(false)
// LED环形频谱开关，持久化到本地
const showSpectrum = ref(localStorage.getItem('lyricsSpectrum') !== 'off')
// 手机端播放器设置面板展开状态（仅手机端通过齿轮按钮打开）
const mobileSettingsOpen = ref(false)
// 翻页动画状态：null / 'exit-up' / 'exit-down' / 'enter'
const pageAnim = ref(null)

// 音质选择：standard=标准 high=高音质 lossless=无损（本地持久化）
const qualityOptions = [
  { value: 'standard', label: '标准' },
  { value: 'high', label: '高音质' },
  { value: 'lossless', label: '无损' }
]
const quality = ref(localStorage.getItem('playQuality') || 'standard')
const availableQualities = ref(['standard'])

const qualityLabel = computed(() => {
  const o = qualityOptions.find(o => o.value === quality.value)
  return o ? o.label : '标准'
})

// 当前歌曲实际可用的音质菜单
const menuOptions = computed(() => {
  return qualityOptions.filter(o => availableQualities.value.includes(o.value))
})

// 下载地址
const downloadUrl = ref('')
// 下载中状态：防重复点击 + 显示 loading 反馈
const isDownloading = ref(false)

// 切换并保存歌词界面播放器样式
function setStyle(style) {
  playerStyle.value = style
  localStorage.setItem('lyricsPlayerStyle', style)
}

// 切换并保存频谱开关状态
function toggleSpectrum() {
  showSpectrum.value = !showSpectrum.value
  localStorage.setItem('lyricsSpectrum', showSpectrum.value ? 'on' : 'off')
  if (showSpectrum.value) {
    nextTick(() => registerRingSpec())
  } else if (unregisterRingSpec) {
    unregisterRingSpec()
    unregisterRingSpec = null
  }
}

// 切换音质：保存偏好，立即切换当前播放
async function setQuality(q) {
  if (q === quality.value) return
  quality.value = q
  localStorage.setItem('playQuality', q)
  store.touchQualitySwitch()
}

// 下载歌曲：加锁防重复点击，完成后解锁
async function downloadSong() {
  if (!store.currentSong || isDownloading.value) return
  const url = downloadUrl.value
  if (!url) return
  isDownloading.value = true
  const filename = `${store.currentSong.title} - ${store.currentSong.artist}.mp3`
  try {
    await saveSong(url, filename)
  } finally {
    // 无论成功失败，1.5 秒后解锁（给用户看到完成状态）
    setTimeout(() => { isDownloading.value = false }, 1500)
  }
}

// 监听歌曲变化，探测可用音质并更新下载地址
watch(() => store.currentSong, async (song) => {
  if (!song) return
  downloadUrl.value = ''
  availableQualities.value = ['standard']
  const res = await getSongUrl(song, quality.value, true)
  if (res?.availableQualities) {
    availableQualities.value = res.availableQualities
  }
  if (res?.url) {
    downloadUrl.value = res.url
  }
}, { immediate: true })

// 监听音质变化（PlayerBar 或其他地方切换），更新下载地址
watch(() => store.qualityVersion, async () => {
  const song = store.currentSong
  if (!song) return
  const q = localStorage.getItem('playQuality') || 'standard'
  quality.value = q
  const url = await getSongUrl(song, q, false)
  if (url) downloadUrl.value = url
})

// 封面加载失败或换歌后重置失败标记
function onImgError() {
  coverBroken.value = true
}

watch(() => store.currentSong?.id, () => {
  coverBroken.value = false
})

// 歌词页内歌曲被清空（如清空播放列表）时，当前歌词页失去意义，直接返回首页
watch(() => store.currentSong, (song) => {
  if (!song && router.currentRoute.value.path === '/lyrics') {
    router.replace('/')
  }
})

// 复古黑胶唱片：黑色胶盘 + 同心纹路 + 琥珀中心贴纸
const vinylSvg = `<svg viewBox="0 0 200 200" width="100%" height="100%">
  <circle cx="100" cy="100" r="100" fill="#101014"/>
  <circle cx="100" cy="100" r="96" fill="none" stroke="#1c1c22" stroke-width="0.8"/>
  <circle cx="100" cy="100" r="90" fill="none" stroke="#1c1c22" stroke-width="0.6"/>
  <circle cx="100" cy="100" r="84" fill="none" stroke="#1c1c22" stroke-width="0.6"/>
  <circle cx="100" cy="100" r="78" fill="none" stroke="#1c1c22" stroke-width="0.6"/>
  <circle cx="100" cy="100" r="72" fill="none" stroke="#1c1c22" stroke-width="0.6"/>
  <path d="M20 118 A92 92 0 0 1 92 24" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="16" stroke-linecap="round"/>
  <path d="M122 148 A72 72 0 0 1 148 122" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="10" stroke-linecap="round"/>
  <circle cx="100" cy="100" r="40" fill="#f59e0b"/>
  <circle cx="100" cy="100" r="34" fill="none" stroke="#d97706" stroke-width="1.2"/>
  <text x="100" y="107" font-size="10" font-weight="700" fill="#7c2d12" text-anchor="middle" font-family="Arial, sans-serif">HUTAO&nbsp;&nbsp;&nbsp;MUSIC</text>
  <circle cx="100" cy="100" r="5" fill="#000"/>
</svg>`

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

// 自定义平滑滚动：ease-out cubic 缓动，比原生 behavior: 'smooth' 更丝滑
function smoothScrollTo(container, target, duration = 400) {
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const offset = targetRect.top - containerRect.top + container.scrollTop
  const end = offset - (container.clientHeight / 2) + (target.clientHeight / 2)
  const start = container.scrollTop
  const distance = end - start
  if (Math.abs(distance) < 1) return
  const startTime = performance.now()
  function step(now) {
    const elapsed = now - startTime
    const progress = Math.min(elapsed / duration, 1)
    const ease = 1 - Math.pow(1 - progress, 3)
    container.scrollTop = start + distance * ease
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

watch(() => store.currentLyricIndex, () => {
  nextTick(() => {
    if (lyricActiveEl.value && lyricsRef.value) {
      smoothScrollTo(lyricsRef.value, lyricActiveEl.value, 400)
    }
  })
})

function toggleDesktop() {
  store.desktopLyrics = !store.desktopLyrics
}

function seekTo(time) {
  store.seekTime = time
}

function goBack() {
  router.back()
}

// 翻页动画：direction='up'=下滑切上一首，'down'=上滑切下一首
// 先播放退出动画 → 切歌 → 播放进入动画
function pageTransition(direction) {
  if (pageAnim.value) return
  pageAnim.value = direction === 'up' ? 'exit-down' : 'exit-up'
  setTimeout(() => {
    if (direction === 'up') store.playPrev()
    else store.playNext()
    pageAnim.value = 'enter'
    setTimeout(() => { pageAnim.value = null }, 450)
  }, 450)
}

// 手机端上下滑动切歌：记录触摸起点，结束时判断滑动方向
// 仅在歌词滚动区域外触发切歌，避免与歌词滚动冲突
let touchStartY = 0
let touchStartTarget = null
function onTouchStart(e) {
  touchStartY = e.touches[0].clientY
  touchStartTarget = e.target
}
function onTouchEnd(e) {
  // 如果触摸目标在歌词滚动区域内，不触发切歌（交给歌词滚动）
  if (touchStartTarget && touchStartTarget.closest('.lyrics-scroll')) return
  const dy = e.changedTouches[0].clientY - touchStartY
  // 滑动距离超过 50px 才触发，避免误触
  if (Math.abs(dy) < 50) return
  if (dy > 0) {
    // 下滑 → 上一首
    pageTransition('up')
  } else {
    // 上滑 → 下一首
    pageTransition('down')
  }
}

// 电脑端鼠标滚轮切歌：滚轮上下滚动切换上一首/下一首
// 仅在歌词滚动区域外触发，避免与歌词滚动冲突
let wheelTimer = null
function onWheel(e) {
  // 歌词滚动区域内：不拦截，让浏览器处理默认滚动
  if (e.target.closest('.lyrics-scroll')) return
  e.preventDefault()
  if (wheelTimer || pageAnim.value) return
  wheelTimer = setTimeout(() => { wheelTimer = null }, 600)
  if (e.deltaY > 0) {
    pageTransition('down')
  } else {
    pageTransition('up')
  }
}

// 电脑端鼠标拖拽切歌：按下拖动后松开判断方向
let mouseStartY = 0
let mouseStartTarget = null
function onMouseDown(e) {
  // 如果点击在歌词滚动区域内，不拦截，让浏览器处理默认滚动
  if (e.target.closest('.lyrics-scroll')) return
  mouseStartY = e.clientY
  mouseStartTarget = e.target
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
function onMouseMove(e) {
  // 拖拽时给出视觉反馈：歌词容器跟随鼠标轻微移动
  const dy = e.clientY - mouseStartY
  const el = document.querySelector('.lyrics-container')
  if (el) el.style.transform = `translateY(${dy * 0.3}px)`
}
function onMouseUp(e) {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  // 恢复歌词容器位置
  const el = document.querySelector('.lyrics-container')
  if (el) el.style.transform = ''
  // 如果起点在歌词滚动区域内，不触发切歌
  if (mouseStartTarget && mouseStartTarget.closest('.lyrics-scroll')) return
  const dy = e.clientY - mouseStartY
  if (Math.abs(dy) < 50) return
  if (dy > 0) {
    pageTransition('up')
  } else {
    pageTransition('down')
  }
}

onMounted(() => {
  if (showSpectrum.value) {
    registerRingSpec()
  }
})

onUnmounted(() => {
  if (unregisterRingSpec) unregisterRingSpec()
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

// 彩虹配色：青→蓝→紫→粉→橙
const RAINBOW_COLORS = ['#22d3ee', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb923c']
// 琥珀配色：暖橙/金色，复古风格
const AMBER_COLORS = ['#fbbf24', '#f59e0b', '#d97706', '#b45309', '#f97316', '#fb923c']
// 颜色配置映射
const COLOR_PRESETS = { rainbow: RAINBOW_COLORS, amber: AMBER_COLORS }
// 当前频谱颜色，持久化到本地
const spectrumColor = ref(localStorage.getItem('lyricsSpectrumColor') || 'rainbow')

// 切换并保存频谱颜色
function setSpectrumColor(color) {
  spectrumColor.value = color
  localStorage.setItem('lyricsSpectrumColor', color)
  // 重新注册频谱以应用新颜色
  if (unregisterRingSpec) {
    unregisterRingSpec()
    unregisterRingSpec = null
  }
  if (showSpectrum.value) {
    nextTick(() => registerRingSpec())
  }
}

// 注册LED环形频谱：包围封面图片，随节奏跳动
// innerRadiusRatio=0.35 确保内环半径大于封面半径，频谱不遮挡封面
// maxBarLenRatio=0.12 控制柱子长度，确保不超出画布边界
function registerRingSpec() {
  if (unregisterRingSpec || !ringSpecRef.value) return
  unregisterRingSpec = registerCanvas(ringSpecRef.value, {
    style: 'circle',
    bars: 72,
    colors: COLOR_PRESETS[spectrumColor.value] || RAINBOW_COLORS,
    glow: true,
    mirror: true,
    region: 0.95,
    segments: 10,
    gapRatio: 0.35,
    innerRadiusRatio: 0.35,
    maxBarLenRatio: 0.12
  })
  setSpectrumActive(store.isPlaying)
}

// 监听播放状态，同步频谱动画
watch(() => store.isPlaying, (v) => {
  setSpectrumActive(v)
})

// 监听频谱开关变化时重新注册canvas
watch(ringSpecRef, (el) => {
  if (el && showSpectrum.value) {
    nextTick(() => registerRingSpec())
  }
})
</script>

<style scoped>
.lyrics-view {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}
.lyrics-view.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-text { color: var(--text-muted); font-size: 18px; }
.lyrics-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: blur(60px) saturate(1.5);
  opacity: 0.3;
  transform: scale(1.2);
}
.lyrics-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(10,10,15,0.6) 0%, rgba(10,10,15,0.9) 100%);
}
.lyrics-container {
  position: relative;
  display: flex;
  width: 100%;
  max-height: 80vh;
  padding: 40px 32px;
  z-index: 2;
}

/* 旋转/黑胶样式：横向布局，左图盘右歌词 */
.lyrics-container.disc,
.lyrics-container.vinyl {
  flex-direction: row;
  align-items: center;
  gap: 56px;
  max-width: 1000px;
}

/* 经典样式：纵向布局，歌词占满宽度 */
.lyrics-container.plain {
  flex-direction: column;
  align-items: center;
  gap: 36px;
  max-width: 700px;
}
/* 左侧面板：大圆盘封面（播放旋转）+ 歌曲信息 */
.side-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  flex-shrink: 0;
  width: 360px;
}
/* 封面容器：相对定位，圆形，用于放置LED环形频谱 */
.album-art-wrap {
  position: relative;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.08);
  transition: width 0.4s ease, height 0.4s ease;
}
/* 开启频谱时容器缩小，给频谱留出空间 */
.album-art-wrap.with-spectrum {
  width: 220px;
  height: 220px;
}
.album-art {
  width: 320px;
  height: 320px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 12px 48px rgba(0,0,0,0.6);
  border: 4px solid rgba(255,255,255,0.12);
  position: relative;
  z-index: 1;
  transition: width 0.4s ease, height 0.4s ease;
}
/* 开启频谱时封面图片缩小 */
.album-art-wrap.with-spectrum .album-art {
  width: 220px;
  height: 220px;
}

/* LED环形频谱：绝对定位在封面外围，不遮挡封面，尺寸足够完整显示柱子 */
.ring-spectrum {
  position: absolute;
  top: -120px;
  left: -120px;
  width: calc(100% + 240px);
  height: calc(100% + 240px);
  pointer-events: none;
  z-index: 2;
}

/* 播放时频谱跟随封面一起旋转 */
.ring-spectrum.spinning {
  animation: album-spin 30s linear infinite;
}

/* 播放时封面旋转动画 */
.album-art.spinning,
.vinyl-disc.spinning {
  animation: album-spin 30s linear infinite;
}

/* 复古黑胶唱片容器：圆形裁切，旋转时随专辑盘动画 */
.vinyl-disc {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0,0,0,0.6);
  position: relative;
  z-index: 1;
}
.vinyl-disc.small {
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

@keyframes album-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.song-meta {
  text-align: center;
}
/* 经典样式：顶部横排歌曲信息（小方形封面，不旋转） */
.song-info {
  display: flex;
  align-items: center;
  gap: 20px;
}
.song-info-art {
  width: 100px;
  height: 100px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.song-meta-h { text-align: left; }
.song-meta-h .song-title,
.song-meta .song-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}
.song-meta-h .song-artist,
.song-meta .song-artist {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 6px;
}
.lyrics-scroll {
  flex: 1;
  min-width: 0;
  width: 100%;
  max-height: 68vh;
  overflow-y: auto;
  padding: 20px 0;
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%);
}
.no-lyrics {
  text-align: center;
  color: var(--text-muted);
  font-size: 16px;
  padding: 60px 0;
}
.lyric-line {
  font-size: 18px;
  line-height: 2.2;
  color: var(--text-muted);
  text-align: center;
  transition: color 0.4s, font-size 0.4s, font-weight 0.4s;
  padding: 6px 0;
  cursor: pointer;
}
.lyric-line.active {
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 700;
}
.desktop-btn {
  position: fixed;
  bottom: 130px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--text-muted);
  padding: 10px 20px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  transition: all 0.2s;
  z-index: 2;
}
.desktop-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }
.desktop-btn.active { color: var(--accent-light); border-color: var(--accent-light); }
.close-btn {
  position: fixed;
  top: 24px;
  left: 24px;
  color: var(--text-secondary);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
  z-index: 2;
}
.close-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

/* 频谱：紧贴播放条上沿的顶层窄条，浮于歌词之上跳动，不遮文字 */
.lyrics-spectrum {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--player-height);
  width: 100%;
  height: 90px;
  pointer-events: none;
  z-index: 3;
}

/* 播放器样式切换 + 频谱开关 */
.style-switch {
  position: fixed;
  top: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  z-index: 2;
}

.style-switch button {
  font-size: 12px;
  padding: 6px 16px;
  border-radius: 999px;
  color: var(--text-muted);
  transition: all 0.2s;
}

.style-switch button.active { color: var(--text-primary); background: rgba(255,255,255,0.12); }

/* 频谱开关按钮分隔线 */
.switch-sep {
  width: 1px;
  height: 16px;
  background: var(--border-color);
  margin: 0 2px;
}

/* 频谱开关按钮：小图标样式 */
.spectrum-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px !important;
  height: 28px;
  padding: 0 !important;
  border-radius: 50% !important;
}
.spectrum-toggle.active {
  color: #fff;
  background: var(--accent);
}
.spectrum-toggle:not(.active) {
  color: var(--text-muted);
  background: transparent;
}
.spectrum-toggle:hover:not(.active) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

/* 颜色选择按钮 */
.color-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px !important;
  height: 28px;
  padding: 0 !important;
  border-radius: 50% !important;
}
.color-btn.active {
  background: var(--bg-hover);
}
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

/* 桌面下载按钮：与 style-switch 内其他按钮同风格 */
.dl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px !important;
  height: 28px;
  padding: 0 !important;
  border-radius: 50% !important;
  color: var(--text-muted);
  transition: all 0.2s;
}
.dl-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); }
.dl-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* 通用 spinner 旋转动画：桌面 + 手机端共用 */
.dl-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: var(--accent-light);
  border-radius: 50%;
  animation: dl-spin 0.7s linear infinite;
}
@keyframes dl-spin { to { transform: rotate(360deg); } }
.lyrics-scroll::-webkit-scrollbar { width: 4px; }
.lyrics-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }

/* 手机端播放器设置按钮（齿轮）：固定右上角，仅手机端显示 */
.mobile-settings-btn {
  display: none;
}

/* 手机端设置面板：半透明遮罩 + 底部弹出，避免遮挡歌词阅读区 */
.mobile-settings-mask {
  display: none;
}

/* 窄屏改为上下布局，圆盘缩小 */
@media (max-width: 768px) {
  .lyrics-container {
    flex-direction: column;
    gap: 24px;
    padding: 24px 16px;
  }
  .side-panel { width: 100%; }
  .album-art-wrap { width: 180px; height: 180px; border-radius: 50%; }
  .album-art-wrap.with-spectrum { width: 150px; height: 150px; }
  .album-art { width: 180px; height: 180px; }
  .album-art-wrap.with-spectrum .album-art { width: 150px; height: 150px; }
  .ring-spectrum {
    top: -60px;
    left: -60px;
    width: calc(100% + 120px);
    height: calc(100% + 120px);
  }
  .song-info-art { width: 80px; height: 80px; }
  .lyrics-scroll { max-height: 40vh; }
}

/* 手机端（≤767px，避开 iPad 768px）：隐藏横排样式切换，改为齿轮设置按钮 + 底部弹出面板 */
@media (max-width: 767px) {
  .style-switch {
    display: none;
  }
  .mobile-settings-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    top: 12px;
    right: 12px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    z-index: 5;
  }
  .mobile-settings-mask {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 300;
  }
  /* 手机端设置面板：毛玻璃质感 + 多层内阴影 + 顶部微光描边 */
  .mobile-settings-panel {
    width: min(340px, calc(100vw - 32px));
    padding: 16px;
    background: rgba(18, 18, 30, 0.82);
    backdrop-filter: blur(20px) saturate(1.3);
    -webkit-backdrop-filter: blur(20px) saturate(1.3);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-top-color: rgba(255, 255, 255, 0.14);
    border-radius: 16px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.04),
      0 16px 48px rgba(0, 0, 0, 0.6);
    max-height: 80vh;
    overflow-y: auto;
  }
  .ms-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .ms-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
  .ms-close {
    font-size: 13px;
    color: var(--text-muted);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ms-close:hover { color: var(--text-primary); background: var(--bg-hover); }
  /* 设置项行：标签左对齐 + 控件右对齐 */
  .ms-group { margin-bottom: 14px; }
  .ms-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .ms-label {
    font-size: 12px;
    color: var(--text-muted);
    opacity: 0.7;
    flex-shrink: 0;
    letter-spacing: 0.02em;
  }
  /* 分段控制器：播放器样式 */
  .ms-segment {
    display: flex;
    gap: 0;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 2px;
  }
  .ms-seg-btn {
    font-size: 12px;
    padding: 5px 14px;
    border-radius: 8px;
    color: var(--text-muted);
    transition: all 0.2s;
    line-height: 1.3;
  }
  .ms-seg-btn.active {
    color: var(--text-primary);
    background: linear-gradient(180deg, rgba(99, 102, 241, 0.32) 0%, rgba(99, 102, 241, 0.18) 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 0 8px rgba(99, 102, 241, 0.15);
  }
  /* iOS 风格开关：封面频谱 */
  .ms-toggle {
    width: 44px;
    height: 26px;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.08);
    position: relative;
    flex-shrink: 0;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .ms-toggle-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--text-muted);
    position: absolute;
    top: 2px;
    left: 2px;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  .ms-toggle.active {
    background: var(--accent);
    border-color: var(--accent-light);
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.4), 0 0 24px rgba(99, 102, 241, 0.15);
  }
  .ms-toggle.active .ms-toggle-thumb {
    transform: translateX(18px);
    background: #fff;
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
  }
  /* 紧凑胶囊组：频谱颜色 + 音质选择 */
  .ms-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .ms-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-muted);
    border: 1px solid rgba(255, 255, 255, 0.06);
    transition: all 0.2s;
    line-height: 1.3;
  }
  .ms-pill.active {
    color: var(--text-primary);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.06) 100%);
    border-color: rgba(255, 255, 255, 0.15);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  .ms-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.25);
    flex-shrink: 0;
  }
  .ms-dot.rainbow { background: linear-gradient(135deg, #22d3ee, #818cf8, #f472b6); }
  .ms-dot.amber { background: linear-gradient(135deg, #fbbf24, #f59e0b, #d97706); }
  /* 分隔线 */
  .ms-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
    margin: 4px 0 14px;
  }
  /* 下载：列表项样式 */
  .ms-download-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 0;
    font-size: 13px;
    color: var(--text-secondary);
    transition: color 0.2s;
  }
  .ms-download-row:hover:not(:disabled) { color: var(--text-primary); }
  .ms-download-row:disabled { opacity: 0.4; cursor: not-allowed; }
  .ms-download-icon { flex-shrink: 0; opacity: 0.6; }
  .ms-download-label { flex: 1; }
  .ms-arrow {
    flex-shrink: 0;
    opacity: 0.35;
    transition: opacity 0.2s, transform 0.2s;
  }
  .ms-download-row:hover:not(:disabled) .ms-arrow {
    opacity: 0.6;
    transform: translateX(2px);
  }
  /* 面板淡入淡出 + 缩放弹出 */
  .fade-enter-active { transition: opacity 0.2s; }
  .fade-leave-active { transition: opacity 0.15s; }
  .fade-enter-from, .fade-leave-to { opacity: 0; }
  .fade-enter-active .mobile-settings-panel { animation: ms-pop-in 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
  .fade-leave-active .mobile-settings-panel { animation: ms-pop-out 0.15s ease-in; }
  @keyframes ms-pop-in {
    from { opacity: 0; transform: scale(0.95) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes ms-pop-out {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(0.97); }
  }
}

/* 翻页动画：退出 + 进入，模拟真实翻页感 */
@keyframes page-exit-up {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(-60px) scale(0.96); opacity: 0; }
}
@keyframes page-exit-down {
  0% { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(60px) scale(0.96); opacity: 0; }
}
@keyframes page-enter {
  0% { transform: translateY(0) scale(0.96); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
.lyrics-container.page-exit-up {
  animation: page-exit-up 0.45s ease-in forwards;
}
.lyrics-container.page-exit-down {
  animation: page-exit-down 0.45s ease-in forwards;
}
.lyrics-container.page-enter {
  animation: page-enter 0.45s ease-out forwards;
}
</style>
