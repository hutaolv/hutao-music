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
    <button class="fav-btn" :class="{ favorited: isFav }" @click.stop="toggleFav">&#x2665;</button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { getFavorites, addFavorite, removeFavorite } from '../utils/storage'
import { platformColors } from '../data/platforms'

const props = defineProps({
  song: { type: Object, required: true },
  rank: { type: Number }
})

defineEmits(['play'])

const isFav = ref(false)
const platformColor = platformColors[props.song.platform] || '#6366f1'

watch(() => props.song.id, () => {
  isFav.value = getFavorites().some(s => s.id === props.song.id)
}, { immediate: true })

function hideImg(e) { e.target.style.display = 'none' }

function toggleFav() {
  if (isFav.value) {
    removeFavorite(props.song.id)
  } else {
    addFavorite(props.song)
  }
  isFav.value = !isFav.value
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
