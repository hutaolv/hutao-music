<template>
  <div class="lyrics-view" v-if="store.currentSong">
    <div class="lyrics-bg" :style="{ backgroundImage: store.currentSong.cover ? `url(${store.currentSong.cover})` : 'none' }"></div>
    <div class="lyrics-overlay"></div>
    <div class="lyrics-container">
      <div class="song-info">
        <img :src="store.currentSong.cover" alt="" class="album-art" @error="onImgError" />
        <div class="song-meta">
          <div class="song-title">{{ store.currentSong.title }}</div>
          <div class="song-artist">{{ store.currentSong.artist }}</div>
          <!-- 下载按钮：咪咕等无法在播放条直接下载时，在此处下载并显示进度 -->
          <div class="download-wrap">
            <button class="download-btn" @click="handleDownload" :disabled="downloading">
              <span v-if="downloading">{{ Math.round(progress * 100) }}% 下载中</span>
              <span v-else-if="downloaded">已下载 &#x2713;</span>
              <span v-else>&#x2B07; 下载歌曲</span>
            </button>
            <div v-if="downloading" class="download-progress">
              <div class="download-progress-bar" :style="{ width: progress * 100 + '%' }"></div>
            </div>
          </div>
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
  </div>
  <div v-else class="lyrics-view empty">
    <div class="empty-text">请先播放一首歌曲</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { downloadSongWithProgress } from '../utils/download'

const store = usePlayerStore()
const router = useRouter()
const lyricsRef = ref(null)
const lyricActiveEl = ref(null)
// 下载状态：是否下载中、进度(0~1)、是否完成
const downloading = ref(false)
const progress = ref(0)
const downloaded = ref(false)

// 点击下载：流式下载并实时刷新进度，完成后短暂显示"已下载"
async function handleDownload() {
  if (downloading.value) return
  downloading.value = true
  progress.value = 0
  downloaded.value = false
  await downloadSongWithProgress(store.currentSong, (p) => { progress.value = p })
  downloading.value = false
  downloaded.value = true
  setTimeout(() => { downloaded.value = false }, 2500)
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

function onImgError(e) {
  e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect fill="%23333" width="200" height="200"/><text fill="%23666" font-size="14" text-anchor="middle" x="100" y="105">暂无图片</text></svg>'
}
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
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 700px;
  max-height: 80vh;
  padding: 40px 32px;
}
.song-info {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 40px;
}
.album-art {
  width: 100px;
  height: 100px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.song-meta .song-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}
.song-meta .song-artist {
  font-size: 16px;
  color: var(--text-secondary);
  margin-top: 6px;
}

/* 下载按钮：大号显眼的渐变按钮 + 进度条 */
.download-wrap { margin-top: 16px; }
.download-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-light));
  border-radius: 24px;
  transition: all 0.2s;
  cursor: pointer;
}
.download-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4); }
.download-btn:disabled { opacity: 0.7; cursor: default; transform: none; }
.download-progress {
  margin-top: 8px;
  height: 6px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  overflow: hidden;
}
.download-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-light));
  border-radius: 3px;
  transition: width 0.15s linear;
}
.lyrics-scroll {
  width: 100%;
  max-height: 55vh;
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
  bottom: 100px;
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
}
.close-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.lyrics-scroll::-webkit-scrollbar { width: 4px; }
.lyrics-scroll::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }
</style>
