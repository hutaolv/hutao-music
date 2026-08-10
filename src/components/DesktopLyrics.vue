<template>
  <div v-if="store.desktopLyrics && store.currentSong && parsedLyrics.length" class="desktop-lyrics" ref="containerRef"
    :style="containerStyle" @mousedown="onMouseDown">
    <div class="desktop-header" ref="headerRef">
      <div class="desktop-controls">
        <button class="dl-btn" @click.stop="showColorPicker = !showColorPicker" title="歌词颜色">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
        </button>
        <span class="size-group">
          <button v-for="s in sizeOptions" :key="s.key" class="dl-btn size-btn"
            :class="{ active: winSize === s.key }" @click.stop="setSize(s.key)" :title="'尺寸:' + s.label">{{ s.label }}</button>
        </span>
        <button class="dl-btn" @click.stop="store.desktopLyrics = false" title="关闭">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div v-if="showColorPicker" class="color-picker" @click.stop>
        <div v-for="c in colors" :key="c" class="color-swatch" :style="{ background: c }"
          :class="{ active: lyricColor === c }" @click.stop="selectColor(c)"></div>
      </div>
    </div>
    <div class="desktop-body">
      <div class="desktop-next-row" v-if="nextLine">{{ nextLine }}</div>
      <div class="desktop-lyric-row">
        <div class="desktop-lyric-text" :class="{ active: store.currentLyricIndex >= 0 }"
          :style="{ color: store.currentLyricIndex >= 0 ? lyricColor : '' }">
          {{ currentLine }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { usePlayerStore } from '../stores/player'
import { getDesktopLyricsColor, setDesktopLyricsColor, getDesktopLyricsPos, setDesktopLyricsPos } from '../utils/storage'

const store = usePlayerStore()
const containerRef = ref(null)
const headerRef = ref(null)
const showColorPicker = ref(false)
const lyricColor = ref(getDesktopLyricsColor())
const winPos = ref(getDesktopLyricsPos())

// 尺寸档位：小/中/大，联动窗口宽度与歌词字号
const sizeOptions = [
  { key: 'small', label: '小', width: 260, font: 16 },
  { key: 'medium', label: '中', width: 360, font: 20 },
  { key: 'large', label: '大', width: 520, font: 26 }
]
const winSize = ref(localStorage.getItem('musichub_dl_size') || 'medium')

let isDragging = false
let startX = 0, startY = 0
let offsetX = 0, offsetY = 0

const colors = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#ffffff']

const sizeConf = computed(() => sizeOptions.find(s => s.key === winSize.value) || sizeOptions[1])

const containerStyle = computed(() => ({
  top: winPos.value.top + 'px',
  left: winPos.value.left + 'px',
  width: sizeConf.value.width + 'px',
  '--lyric-color': lyricColor.value,
  '--dl-font-size': sizeConf.value.font + 'px'
}))

function setSize(key) {
  winSize.value = key
  localStorage.setItem('musichub_dl_size', key)
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

const currentLine = computed(() => {
  const idx = store.currentLyricIndex
  if (idx >= 0 && idx < parsedLyrics.value.length) return parsedLyrics.value[idx].text
  if (parsedLyrics.value.length > 0) return parsedLyrics.value[0].text
  return '...'
})

const nextLine = computed(() => {
  const idx = store.currentLyricIndex
  if (idx >= 0 && idx + 1 < parsedLyrics.value.length) return parsedLyrics.value[idx + 1].text
  return ''
})

function selectColor(c) {
  lyricColor.value = c
  setDesktopLyricsColor(c)
  showColorPicker.value = false
}

function onMouseDown(e) {
  if (e.target.closest('button') || e.target.closest('.color-picker') || e.target.closest('.resize-handle')) return
  isDragging = true
  containerRef.value.style.cursor = 'grabbing'
  startX = e.clientX
  startY = e.clientY
  const rect = containerRef.value.getBoundingClientRect()
  offsetX = rect.left
  offsetY = rect.top
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e) {
  if (!isDragging) return
  // 只更新响应式位置，避免与 Vue 的 :style 补丁冲突
  winPos.value = { top: offsetY + e.clientY - startY, left: offsetX + e.clientX - startX }
}

function onMouseUp() {
  isDragging = false
  if (containerRef.value) {
    containerRef.value.style.cursor = 'grab'
    const rect = containerRef.value.getBoundingClientRect()
    setDesktopLyricsPos({ top: rect.top, left: rect.left })
  }
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})
</script>

<style scoped>
.desktop-lyrics {
  position: fixed;
  z-index: 9999;
  background: transparent;
  padding: 0;
  min-width: 160px;
  max-width: 600px;
  user-select: none;
  pointer-events: auto;
  cursor: grab;
}
.desktop-header {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}
.desktop-lyrics:hover .desktop-header { opacity: 1; }
.desktop-controls {
  display: flex;
  gap: 4px;
  cursor: default;
  align-items: center;
}
.size-group {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 12px;
  background: rgba(0,0,0,0.3);
}
.size-btn {
  width: auto;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 11px;
}
.size-btn.active {
  color: #fff;
  background: rgba(255,255,255,0.2);
}
.dl-btn {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  color: rgba(255,255,255,0.4);
  background: rgba(0,0,0,0.3);
  transition: all 0.2s;
  cursor: pointer;
}
.dl-btn:hover { color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.15); }
.color-picker {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(12,12,20,0.9);
  border-radius: 8px;
  margin-top: 4px;
  cursor: default;
}
.color-swatch {
  width: 20px; height: 20px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}
.color-swatch:hover { border-color: rgba(255,255,255,0.5); }
.color-swatch.active { border-color: white; }
.desktop-body {
  padding: 0 8px;
}
.desktop-next-row {
  font-size: calc(var(--dl-font-size, 20px) * 0.8);
  color: rgba(255,255,255,0.25);
  text-align: center;
  line-height: 1.4;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.desktop-lyric-row {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
}
.desktop-lyric-text {
  font-size: var(--dl-font-size, 20px);
  font-weight: 700;
  color: rgba(255,255,255,0.3);
  transition: color 0.3s;
  line-height: 1.5;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.desktop-lyric-text.active {
  color: var(--lyric-color, #818cf8);
  text-shadow: 0 0 20px color-mix(in srgb, var(--lyric-color, #818cf8) 40%, transparent);
}
</style>
