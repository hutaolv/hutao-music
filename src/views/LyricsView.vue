<template>
  <div class="lyrics-view" v-if="store.currentSong">
    <div class="lyrics-bg" :style="{ backgroundImage: store.currentSong.cover ? `url(${store.currentSong.cover})` : 'none' }"></div>
    <div class="lyrics-overlay"></div>
    <div class="lyrics-container" :class="playerStyle">
      <!-- 旋转样式：左侧大圆盘封面 -->
      <div v-if="playerStyle === 'disc'" class="side-panel">
        <img :src="store.currentSong.cover" alt="" class="album-art" :class="{ spinning: store.isPlaying }" @error="onImgError" />
        <div class="song-meta">
          <div class="song-title">{{ store.currentSong.title }}</div>
          <div class="song-artist">{{ store.currentSong.artist }}</div>
        </div>
      </div>
      <!-- 经典样式：顶部横排小封面，不旋转 -->
      <div v-else class="song-info">
        <img :src="store.currentSong.cover" alt="" class="song-info-art" @error="onImgError" />
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
    <!-- 播放器样式切换：旋转 / 经典无旋转 -->
    <div class="style-switch">
      <button :class="{ active: playerStyle === 'disc' }" @click="setStyle('disc')">旋转</button>
      <button :class="{ active: playerStyle === 'plain' }" @click="setStyle('plain')">经典</button>
    </div>
  </div>
  <div v-else class="lyrics-view empty">
    <div class="empty-text">请先播放一首歌曲</div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()
const router = useRouter()
const lyricsRef = ref(null)
const lyricActiveEl = ref(null)
// 播放器样式：disc=旋转圆盘（默认），plain=经典无旋转，选择持久化到本地
const playerStyle = ref(localStorage.getItem('lyricsPlayerStyle') || 'disc')

// 切换并保存歌词界面播放器样式
function setStyle(style) {
  playerStyle.value = style
  localStorage.setItem('lyricsPlayerStyle', style)
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
  width: 100%;
  max-height: 80vh;
  padding: 40px 32px;
}

/* 旋转样式：横向布局，左图盘右歌词 */
.lyrics-container.disc {
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
.album-art {
  width: 320px;
  height: 320px;
  /* 圆形专辑封面，播放时匀速旋转（QQ 音乐风格） */
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 12px 48px rgba(0,0,0,0.6);
  border: 4px solid rgba(255,255,255,0.12);
}

/* 播放时封面旋转动画 */
.album-art.spinning {
  animation: album-spin 30s linear infinite;
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

/* 播放器样式切换：旋转 / 经典 */
.style-switch {
  position: fixed;
  top: 24px;
  right: 24px;
  display: flex;
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
  .album-art { width: 160px; height: 160px; }
  .song-info-art { width: 80px; height: 80px; }
  .lyrics-scroll { max-height: 40vh; }
}
</style>
