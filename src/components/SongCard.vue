<template>
  <div class="song-card" @click="$emit('play', song)">
    <div class="rank" v-if="rank !== undefined">
      <span class="rank-num" :class="rankClass">{{ rank }}</span>
    </div>
    <div class="cover-wrap">
      <img :src="song.cover" :alt="song.title" class="cover" @error="hideImg" />
    </div>
    <div class="info">
      <span class="title">{{ song.title }}</span>
      <div class="meta-row">
        <span v-if="song.vip" class="meta-tag vip">VIP</span>
        <span class="meta-tag platform">{{ song.platform }}</span>
        <span class="meta-sep" v-if="song.artist">&middot;</span>
        <span class="meta-artist">{{ song.artist }}</span>
      </div>
    </div>
    <span class="duration">{{ song.duration }}</span>
    <button v-if="showPlay" class="action-btn play-btn reveal-btn" @click.stop="$emit('play', song)" title="播放">&#x25B6;</button>
    <template v-if="showActions">
      <button class="action-btn add-btn reveal-btn" @click.stop="$emit('add', song)" title="添加到播放列表">&#x2795;</button>
    </template>
    <button class="fav-btn" :class="favClass" @click.stop="toggleFav"><span class="fav-heart">&#x2665;</span></button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getFavorites, addFavorite, removeFavorite } from '../utils/storage'
import { platformColors } from '../data/platforms'
import { usePlayerStore } from '../stores/player'

const store = usePlayerStore()

const props = defineProps({
  song: { type: Object, required: true },
  rank: { type: Number },
  // 是否显示播放/添加到播放列表按钮，默认隐藏（保留原有整卡点击播放）
  showActions: { type: Boolean, default: false },
  // 是否只显示播放按钮（我的喜欢/历史播放等处显式提供播放入口）
  showPlay: { type: Boolean, default: false }
})

const emit = defineEmits(['play', 'add', 'fav-changed'])

const isFav = ref(false)
const platformColor = platformColors[props.song.platform] || '#6366f1'
const anim = ref('')
const addAnim = ref('')
let animTimer = null
let addAnimTimer = null

const rankClass = computed(() => {
  if (!props.rank) return {}
  return { gold: props.rank === 1, silver: props.rank === 2, bronze: props.rank === 3 }
})

// 收藏状态存储在 IndexedDB（异步），挂载后异步获取初始收藏状态
getFavorites().then(list => {
  isFav.value = list.some(s => s.id === props.song.id)
}).catch(() => {})

const favClass = computed(() => {
  const c = { favorited: isFav.value }
  if (anim.value) c[anim.value] = true
  return c
})

function hideImg(e) { e.target.style.display = 'none' }

async function toggleFav() {
  // IndexedDB 写入为异步，先翻转 UI 再落盘，避免等待造成卡顿
  isFav.value = !isFav.value
  anim.value = isFav.value ? 'fav-anim-love' : 'fav-anim-break'
  clearTimeout(animTimer)
  animTimer = setTimeout(() => { anim.value = '' }, 800)
  try {
    if (isFav.value) {
      await addFavorite(props.song)
    } else {
      await removeFavorite(props.song.id)
    }
    // 通知父组件（如"我的喜欢"列表）刷新收藏数据
    emit('fav-changed')
    // 通知全局收藏版本号，其他页面（首页）同步刷新
    store.touchFavVersion()
  } catch { /* 忽略落盘失败，UI 已即时反馈 */ }
}
</script>

<style scoped>
.song-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s;
}
@media (hover: hover) {
  .song-card:hover { background: rgba(255, 255, 255, 0.04); }
}

.rank {
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}

.rank-num {
  font-size: 14px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.18);
  font-variant-numeric: tabular-nums;
}

.rank-num.gold {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.rank-num.silver {
  background: linear-gradient(135deg, #cbd5e1, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.rank-num.bronze {
  background: linear-gradient(135deg, #d97706, #b45309);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.cover-wrap {
  flex-shrink: 0;
}

.cover {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .song-card:hover .cover { transform: scale(1.05); }
}

.info {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}

.meta-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
  flex-shrink: 0;
}

.meta-tag.vip {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.meta-tag.platform {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
}

.meta-sep {
  color: var(--text-muted);
  opacity: 0.3;
  font-size: 10px;
}

.meta-artist {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.duration {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* ===== Action buttons ===== */
.action-btn {
  font-size: 14px;
  color: var(--text-muted);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  opacity: 0;
  transform: translateX(6px);
}
@media (hover: hover) {
  .song-card:hover .reveal-btn {
    opacity: 1;
    transform: translateX(0);
  }
}
.action-btn:active {
  transform: scale(0.85) !important;
  transition-duration: 0.1s;
}

.add-btn:hover { color: #10b981; }
.add-btn.add-bounce { animation: btn-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }

@keyframes btn-bounce {
  0% { transform: scale(1); }
  30% { transform: scale(1.3); }
  60% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

.fav-btn {
  font-size: 16px;
  color: var(--text-muted);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  flex-shrink: 0;
  opacity: 0;
  transform: translateX(6px);
}
@media (hover: hover) {
  .song-card:hover .fav-btn {
    opacity: 1;
    transform: translateX(0);
  }
}
.fav-btn:active { transform: scale(0.85) !important; transition-duration: 0.1s; }
.fav-btn:hover { color: #ef4444; }
.fav-btn.favorited {
  color: #ef4444;
  opacity: 1;
  transform: translateX(0);
}

/* Touch: always show buttons */
@media (hover: none) {
  .reveal-btn, .fav-btn {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
