<template>
  <div v-if="store.desktopLyrics && store.currentSong && parsedLyrics.length" class="desktop-lyrics" ref="containerRef"
    :style="containerStyle">
    <div class="desktop-header" ref="headerRef">
      <div class="desktop-controls">
        <button class="dl-btn" @click.stop="showColorPicker = !showColorPicker" title="歌词颜色">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
        </button>
        <button class="dl-btn" @click.stop="openPopup" title="弹出独立窗口">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
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
let isDragging = false
let startX = 0, startY = 0
let offsetX = 0, offsetY = 0

const colors = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#ffffff']

const containerStyle = computed(() => ({
  top: winPos.value.top + 'px',
  right: winPos.value.right + 'px',
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
  if (!isDragging) return
  winPos.value = { top: offsetY + e.clientY - startY, right: window.innerWidth - (offsetX + e.clientX - startX) }
  containerRef.value.style.left = (offsetX + e.clientX - startX) + 'px'
  containerRef.value.style.top = (offsetY + e.clientY - startY) + 'px'
  containerRef.value.style.right = 'auto'
}

function onMouseUp() {
  isDragging = false
  const rect = containerRef.value.getBoundingClientRect()
  setDesktopLyricsPos({ top: rect.top, right: window.innerWidth - rect.right })
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

let popupWin = null
let popupInterval = null
let popupColor = lyricColor.value

function openPopup() {
  if (popupWin && !popupWin.closed) { popupWin.focus(); return }
  popupColor = lyricColor.value
  popupWin = window.open('', 'desktopLyrics',
    'width=380,height=180,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no')
  if (!popupWin) { return }
  popupWin.document.write(`
    <html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{background:rgba(0,0,0,0.7);font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;user-select:none;overflow:hidden}
      .wrap{text-align:center;width:100%;padding:8px 16px}
      #prev{font-size:14px;color:#ffffff66;margin-bottom:4px;line-height:1.4;min-height:20px}
      #lyric{font-size:22px;font-weight:700;color:${popupColor};line-height:1.5;word-break:break-word}
    </style></head><body>
      <div class="wrap"><div id="prev"></div><div id="lyric">...</div></div>
      <script>
        var po=window.opener;
        function sync(){
          if(!po||po.closed){window.close();return}
          try{
            var d=po.document.getElementById('app');
            if(!d)return;
            var s=d.__vue_app__?.config?.globalProperties?.$pinia?.state?.value?.player;
            if(!s)return;
            var idx=s.currentLyricIndex;
            var raw=s.rawLyrics||'';
            var lines=raw.split('\\n');
            var parsed=[];
            for(var i=0;i<lines.length;i++){
              var m=lines[i].match(/\\[(\\d{2}):(\\d{2})\\.(\\d{2,3})\\](.*)/);
              if(m)parsed.push({time:parseInt(m[1])*60+parseInt(m[2])+parseInt(m[3].padEnd(3,'0'))/1000,text:m[4].trim()});
            }
            parsed.sort(function(a,b){return a.time-b.time});
            var ci=typeof idx==='number'?idx:-1;
            document.getElementById('lyric').textContent=ci>=0&&ci<parsed.length?parsed[ci].text:'...';
            document.getElementById('prev').textContent=ci>0&&ci<parsed.length?parsed[ci-1].text:'';
          }catch(e){}
        }
        setInterval(sync,200);
      <\/script>
    </body></html>
  `)
  popupWin.document.close()

  if (popupInterval) { clearInterval(popupInterval); popupInterval = null }
  popupInterval = setInterval(() => {
    if (!popupWin || popupWin.closed) {
      if (popupInterval) { clearInterval(popupInterval); popupInterval = null }
      popupWin = null
    }
  }, 2000)
}

watch(() => store.desktopLyrics, (v) => {
  if (!v && popupWin && !popupWin.closed) { popupWin.close(); popupWin = null }
  if (!v && popupInterval) { clearInterval(popupInterval); popupInterval = null }
})

onMounted(() => {
  const h = headerRef.value
  if (h) h.addEventListener('mousedown', onMouseDown)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  if (popupWin && !popupWin.closed) { popupWin.close(); popupWin = null }
})
</script>

<style scoped>
.desktop-lyrics {
  position: fixed;
  z-index: 9999;
  background: transparent;
  padding: 0;
  min-width: 200px;
  max-width: 400px;
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
  transition: all 0.2s;
  cursor: pointer;
}
.dl-btn:hover { color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.1); }
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.desktop-lyric-text.active {
  color: var(--lyric-color, #818cf8);
  text-shadow: 0 0 20px color-mix(in srgb, var(--lyric-color, #818cf8) 40%, transparent);
}
</style>
