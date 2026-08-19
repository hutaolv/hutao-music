<template>
  <div class="lyrics-view" v-if="store.currentSong">
    <div class="lyrics-bg" :style="{ backgroundImage: store.currentSong.cover ? `url(${store.currentSong.cover})` : 'none' }"></div>
    <div class="lyrics-overlay"></div>
    <div class="lyrics-container" :class="playerStyle">
      <!-- 旋转/黑胶样式：左侧大图盘 + LED环形频谱包围 -->
      <div v-if="playerStyle === 'disc' || playerStyle === 'vinyl'" class="side-panel">
        <div class="album-art-wrap">
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
    <!-- 播放器样式切换：旋转 / 黑胶 / 经典 + 频谱开关 -->
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
    </div>
  </div>
  <div v-else class="lyrics-view empty">
    <div class="empty-text">请先播放一首歌曲</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { registerCanvas, setSpectrumActive } from '../utils/spectrum'

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

// 封面加载失败或换歌后重置失败标记
function onImgError() {
  coverBroken.value = true
}

watch(() => store.currentSong?.id, () => {
  coverBroken.value = false
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

watch(() => store.currentLyricIndex, () => {
  nextTick(() => {
    lyricActiveEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

onMounted(() => {
  if (showSpectrum.value) {
    registerRingSpec()
  }
})

onUnmounted(() => {
  if (unregisterRingSpec) unregisterRingSpec()
})

// 彩虹配色：青→蓝→紫→粉→橙
const RAINBOW_COLORS = ['#22d3ee', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb923c']

// 注册LED环形频谱：包围封面图片，随节奏跳动
// innerRadiusRatio=0.42 确保内环半径大于封面半径，频谱不遮挡封面
function registerRingSpec() {
  if (unregisterRingSpec || !ringSpecRef.value) return
  unregisterRingSpec = registerCanvas(ringSpecRef.value, {
    style: 'circle',
    bars: 72,
    colors: RAINBOW_COLORS,
    glow: true,
    mirror: true,
    region: 0.95,
    segments: 10,
    gapRatio: 0.35,
    innerRadiusRatio: 0.42
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
/* 封面容器：相对定位，用于放置LED环形频谱 */
.album-art-wrap {
  position: relative;
  width: 320px;
  height: 320px;
}
.album-art {
  width: 320px;
  height: 320px;
  /* 圆形专辑封面，播放时匀速旋转（QQ 音乐风格） */
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 12px 48px rgba(0,0,0,0.6);
  border: 4px solid rgba(255,255,255,0.12);
  position: relative;
  z-index: 1;
}

/* LED环形频谱：绝对定位在封面外围，不遮挡封面 */
.ring-spectrum {
  position: absolute;
  top: -72px;
  left: -72px;
  width: calc(100% + 144px);
  height: calc(100% + 144px);
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
  scroll-behavior: smooth;
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

.style-switch button.active { color: #fff; background: var(--accent-light); }

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
.lyrics-scroll::-webkit-scrollbar { width: 4px; }
.lyrics-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }

/* 窄屏改为上下布局，圆盘缩小 */
@media (max-width: 768px) {
  .lyrics-container {
    flex-direction: column;
    gap: 24px;
    padding: 24px 16px;
  }
  .side-panel { width: 100%; }
  .album-art-wrap { width: 180px; height: 180px; }
  .album-art { width: 180px; height: 180px; }
  .ring-spectrum {
    top: -36px;
    left: -36px;
    width: calc(100% + 72px);
    height: calc(100% + 72px);
  }
  .song-info-art { width: 80px; height: 80px; }
  .lyrics-scroll { max-height: 40vh; }
  .style-switch {
    top: auto;
    bottom: calc(var(--player-height) + 16px);
    right: 16px;
  }
}
</style>
