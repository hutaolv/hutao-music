<template>
  <div class="playlist-panel">
    <div class="playlist-header">
      <h3>播放列表 ({{ store.playlist.length }})</h3>
      <div class="header-actions">
        <button class="clear-btn" @click="store.clearPlaylist">清空</button>
        <button class="close-btn" @click="store.closePlaylist" title="关闭">&times;</button>
      </div>
    </div>
    <div class="playlist-list" ref="listRef" v-if="store.playlist.length">
      <div v-for="(song, idx) in store.playlist" :key="song.id" :ref="el => { if (idx === store.currentIndex) activeEl = el }" class="playlist-item" :class="{ active: idx === store.currentIndex }" @click="store.playSong(song)">
        <img :src="song.cover" :alt="song.title" class="item-cover" @error="hideImg" />
        <div class="item-info">
          <div class="item-title">{{ song.title }}</div>
          <div class="item-artist">{{ song.artist }}</div>
        </div>
        <span class="item-duration">{{ song.duration }}</span>
        <button class="remove-btn" @click.stop="store.removeFromPlaylist(song.id)">&times;</button>
      </div>
    </div>
    <div v-else class="empty-state">播放列表为空</div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { usePlayerStore } from '../stores/player'
const store = usePlayerStore()
const listRef = ref(null)
const activeEl = ref(null)

function hideImg(e) {
  e.target.style.display = 'none'
}

// 自定义平滑滚动：ease-out cubic 缓动，比原生 behavior: 'smooth' 更丝滑
function smoothScrollTo(container, target, duration = 400) {
  const start = container.scrollTop
  const end = target.offsetTop - container.offsetTop - (container.clientHeight / 2) + (target.clientHeight / 2)
  const distance = end - start
  if (Math.abs(distance) < 1) return
  const startTime = performance.now()
  function step(now) {
    const elapsed = now - startTime
    const progress = Math.min(elapsed / duration, 1)
    // ease-out cubic: 先快后慢
    const ease = 1 - Math.pow(1 - progress, 3)
    container.scrollTop = start + distance * ease
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// 打开播放列表时自动滚动到当前播放歌曲位置
watch(() => store.showPlaylist, (v) => {
  if (v) {
    nextTick(() => {
      if (activeEl.value && listRef.value) {
        smoothScrollTo(listRef.value, activeEl.value, 400)
      }
    })
  }
})
</script>

<style scoped>
.playlist-panel {
  position: absolute;
  bottom: 100%;
  right: 32px;
  width: 380px;
  max-height: 420px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.playlist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.playlist-header h3 {
  font-size: 15px;
  font-weight: 600;
}

.clear-btn {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.clear-btn:hover {
  color: #ef4444;
  border-color: #ef4444;
}

/* 头部右侧操作区：清空 + 关闭 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 关闭播放列表面板按钮 */
.close-btn {
  font-size: 22px;
  line-height: 1;
  color: var(--text-muted);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.playlist-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.playlist-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.playlist-item:hover { background: var(--bg-hover); }
.playlist-item.active { background: rgba(99, 102, 241, 0.1); }

.item-cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-artist {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.item-duration {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.remove-btn {
  font-size: 18px;
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  opacity: 0;
  transition: all 0.2s;
}

.playlist-item:hover .remove-btn { opacity: 1; }
.remove-btn:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

/* 手机端（≤767px）：宽度按屏幕自适应，靠右留边距，避免溢出屏幕 */
@media (max-width: 767px) {
  .playlist-panel {
    width: min(380px, calc(100vw - 24px));
    right: 12px;
  }
}
</style>
