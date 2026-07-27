<template>
  <div v-if="store.desktopLyrics && store.currentSong && parsedLyrics.length" class="desktop-lyrics" ref="containerRef"
    :style="containerStyle">
    <div class="desktop-header" ref="headerRef">
      <div class="desktop-controls">
        <button class="dl-btn" @click.stop="showColorPicker = !showColorPicker" title="歌词颜色">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
        </button>
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
    <div class="resize-handle" @mousedown.stop="startResize"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { usePlayerStore } from '../stores/player'
import { getDesktopLyricsColor, setDesktopLyricsColor, getDesktopLyricsPos, setDesktopLyricsPos } from '../utils/storage'

const store = usePlayerStore()
const containerRef = ref(null)
const headerRef = ref(null)
const showColorPicker = ref(false)
const lyricColor = ref(getDesktopLyricsColor())
const winPos = ref(getDesktopLyricsPos())
const winWidth = ref(parseInt(localStorage.getItem('musichub_dl_width')) || 320)

let isDragging = false
let isResizing = false
let startX = 0, startY = 0
let offsetX = 0, offsetY = 0
let startW = 0

const colors = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#ffffff']

const containerStyle = computed(() => ({
  top: winPos.value.top + 'px',
  right: winPos.value.right + 'px',
  width: winWidth.value + 'px',
  '--lyric-color': lyricColor.value
}))

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
  isDragging = true
  startX = e.clientX
  startY = e.clientY
  const rect = containerRef.value.getBoundingClientRect()
  offsetX = rect.left
  offsetY = rect.top
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e) {
  if (isResizing) {
    const newW = Math.max(160, startW + (e.clientX - startX))
    winWidth.value = newW
    localStorage.setItem('musichub_dl_width', String(newW))
    return
  }
  if (!isDragging) return
  winPos.value = { top: offsetY + e.clientY - startY, right: window.innerWidth - (offsetX + e.clientX - startX) }
  containerRef.value.style.left = (offsetX + e.clientX - startX) + 'px'
  containerRef.value.style.top = (offsetY + e.clientY - startY) + 'px'
  containerRef.value.style.right = 'auto'
}

function onMouseUp() {
  if (isResizing) { isResizing = false; document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); return }
  isDragging = false
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    setDesktopLyricsPos({ top: rect.top, right: window.innerWidth - rect.right })
  }
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

function startResize(e) {
  isResizing = true
  startX = e.clientX
  startY = e.clientY
  startW = winWidth.value
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

onMounted(() => {
  const h = headerRef.value
  if (h) h.addEventListener('mousedown', onMouseDown)
})

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
  cursor: move;
  user-select: none;
  pointer-events: auto;
}
.desktop-header {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 4px;
  opacity: 0;
  transition: opacity 0.2s;
  cursor: move;
}
.desktop-lyrics:hover .desktop-header { opacity: 1; }
.desktop-controls {
  display: flex;
  gap: 4px;
  cursor: default;
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
  cursor: default;
  padding: 0 8px;
}
.desktop-next-row {
  font-size: 13px;
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
  font-size: 20px;
  font-weight: 700;
  color: rgba(255,255,255,0.3);
  transition: color 0.3s;
  line-height: 1.5;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
}
.desktop-lyric-text.active {
  color: var(--lyric-color, #818cf8);
  text-shadow: 0 0 20px color-mix(in srgb, var(--lyric-color, #818cf8) 40%, transparent);
}
.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 0.2s;
}
.resize-handle::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 10px;
  height: 10px;
  border-right: 2px solid rgba(255,255,255,0.3);
  border-bottom: 2px solid rgba(255,255,255,0.3);
}
.desktop-lyrics:hover .resize-handle { opacity: 1; }
</style>
