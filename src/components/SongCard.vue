<template>
  <div class="song-card" @click="$emit('play', song)">
    <div class="rank" v-if="rank !== undefined">
      <span class="rank-num" :class="{ 'top-three': rank <= 3 }">{{ rank }}</span>
    </div>
    <img :src="song.cover" :alt="song.title" class="cover" @error="hideImg" />
    <div class="info">
      <div class="title-row">
        <span class="title">{{ song.title }}</span>
        <span v-if="song.vip" class="vip-badge">VIP</span>
        <span class="platform-tag" :style="{ background: platformColor + '20', color: platformColor }">{{ song.platform }}</span>
      </div>
      <div class="artist">{{ song.artist }}</div>
    </div>
    <span class="duration">{{ song.duration }}</span>
    <!-- 仅显示播放按钮（我的喜欢/历史播放列表），与整卡播放互不冲突 -->
    <button v-if="showPlay && !showActions" class="action-btn play-btn" @click.stop="$emit('play', song)" title="播放">&#x25B6;</button>
    <!-- showActions 为 true 时显示播放/添加到播放列表按钮（搜索结果等场景），点击不触发整卡播放 -->
    <template v-if="showActions">
      <button class="action-btn" @click.stop="$emit('play', song)" title="播放">&#x25B6;</button>
      <button class="action-btn" @click.stop="$emit('add', song)" title="添加到播放列表">&#x2795;</button>
    </template>
    <button class="fav-btn" :class="{ favorited: isFav }" @click.stop="toggleFav">&#x2665;</button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { getFavorites, addFavorite, removeFavorite } from '../utils/storage'
import { platformColors } from '../data/platforms'

const props = defineProps({
  song: { type: Object, required: true },
  rank: { type: Number },
  // 是否显示播放/添加到播放列表按钮，默认隐藏（保留原有整卡点击播放）
  showActions: { type: Boolean, default: false },
  // 是否只显示播放按钮（我的喜欢/历史播放等处显式提供播放入口）
  showPlay: { type: Boolean, default: false }
})

const emit = defineEmits(['play', 'add', 'fav-changed'])

const isFav = ref(getFavorites().some(s => s.id === props.song.id))
const platformColor = platformColors[props.song.platform] || '#6366f1'

function hideImg(e) { e.target.style.display = 'none' }

function toggleFav() {
  if (isFav.value) {
    removeFavorite(props.song.id)
  } else {
    addFavorite(props.song)
  }
  isFav.value = !isFav.value
  // 通知父组件（如"我的喜欢"列表）刷新收藏数据
  emit('fav-changed')
}
</script>

<style scoped>
.song-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s;
}

.song-card:hover { background: var(--bg-hover); }

.rank {
  width: 32px;
  text-align: center;
  flex-shrink: 0;
}

.rank-num {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.rank-num.top-three { color: var(--accent-light); }

.cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.info {
  flex: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  font-weight: 500;
}

.vip-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.artist {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.duration {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* 播放 / 添加到播放列表按钮 */
.action-btn {
  font-size: 14px;
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
  flex-shrink: 0;
}

.action-btn:hover { color: var(--text-primary); background: var(--bg-hover); }

/* 播放按钮：主色强调，方便我的喜欢/历史播放列表快速播放 */
.play-btn:hover { color: #fff; background: var(--accent-light); }

.fav-btn {
  font-size: 16px;
  color: var(--text-muted);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
  flex-shrink: 0;
}

.fav-btn:hover { color: var(--text-secondary); background: var(--bg-hover); }
.fav-btn.favorited { color: #ef4444; }
</style>
