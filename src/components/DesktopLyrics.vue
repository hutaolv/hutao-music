<template>
  <transition name="fade">
    <div v-if="store.desktopLyrics && store.currentSong && parsedLyrics.length" class="desktop-lyrics" ref="containerRef">
      <div class="desktop-inner">
        <div class="desktop-header">
          <span class="desktop-title">{{ store.currentSong.title }} - {{ store.currentSong.artist }}</span>
          <button class="desktop-close" @click="store.desktopLyrics = false" title="关闭桌面歌词">&times;</button>
        </div>
        <div class="desktop-lyric-row">
          <div class="desktop-lyric-text" :class="{ active: store.currentLyricIndex >= 0 }">
            {{ currentLine }}
          </div>
        </div>
        <div class="desktop-prev">{{ prevLine }}</div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()
const containerRef = ref(null)
let isDragging = false
let startX = 0, startY = 0
let offsetX = 0, offsetY = 0

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
  if (!isDragging) return
  containerRef.value.style.left = (offsetX + e.clientX - startX) + 'px'
  containerRef.value.style.top = (offsetY + e.clientY - startY) + 'px'
  containerRef.value.style.right = 'auto'
}

function onMouseUp() {
  isDragging = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

onMounted(() => {
  if (containerRef.value) {
    const header = containerRef.value.querySelector('.desktop-header')
    if (header) header.addEventListener('mousedown', onMouseDown)
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

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
  if (idx >= 0 && idx < parsedLyrics.value.length) {
    return parsedLyrics.value[idx].text
  }
  return '...'
})

const prevLine = computed(() => {
  const idx = store.currentLyricIndex
  if (idx > 0 && idx < parsedLyrics.value.length) {
    return parsedLyrics.value[idx - 1].text
  }
  if (idx < 0 && parsedLyrics.value.length > 0) {
    return parsedLyrics.value[0].text
  }
  return ''
})
</script>

<style scoped>
.desktop-lyrics {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 9999;
  background: rgba(12, 12, 20, 0.92);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 20px;
  min-width: 280px;
  max-width: 360px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  cursor: move;
  user-select: none;
}
.desktop-inner { cursor: default; }
.desktop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  cursor: move;
}
.desktop-title {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  cursor: move;
}
.desktop-close {
  font-size: 16px;
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}
.desktop-close:hover { color: var(--text-primary); background: var(--bg-hover); }
.desktop-lyric-row {
  display: flex;
  align-items: center;
  min-height: 48px;
}
.desktop-lyric-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-muted);
  transition: color 0.3s;
  line-height: 1.5;
}
.desktop-lyric-text.active {
  color: var(--accent-light);
}
.desktop-prev {
  font-size: 13px;
  color: var(--text-muted);
  opacity: 0.5;
  margin-top: 4px;
  line-height: 1.4;
}
</style>
