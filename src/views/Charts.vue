<template>
  <div class="charts">
    <h1 class="section-title">排行榜</h1>
    <p class="section-subtitle">汇聚五大平台热门歌曲，每日更新</p>

    <div class="platform-tabs">
      <button v-for="p in platforms" :key="p" class="platform-tab" :class="{ active: activePlatform === p }" :style="activePlatform === p ? { color: platformColors[p], borderColor: platformColors[p] } : {}" @click="activePlatform = p">{{ p }}</button>
    </div>

    <div v-if="loading" class="loading-bar">正在获取 {{ activePlatform }} 最新榜单...</div>

    <div class="chart-header-row">
      <span class="col-rank">#</span>
      <span class="col-cover"></span>
      <span class="col-title">歌曲</span>
      <span class="col-artist">歌手</span>
      <span class="col-duration">时长</span>
      <span class="col-action">操作</span>
    </div>

    <div class="chart-list">
      <div v-for="(song, idx) in currentSongs" :key="song.id" class="chart-row" @dblclick="store.playSong(song)">
        <span class="col-rank">
          <span class="rank-badge" :class="{ gold: idx === 0, silver: idx === 1, bronze: idx === 2 }">{{ idx + 1 }}</span>
        </span>
        <span class="col-cover">
          <img :src="song.cover" :alt="song.title" class="row-cover" />
        </span>
        <span class="col-title">
          <span class="row-title">{{ song.title }}</span>
        </span>
        <span class="col-artist">{{ song.artist }}</span>
        <span class="col-duration">{{ song.duration }}</span>
        <span class="col-action">
          <button class="action-btn play-btn" @click="store.playSong(song)" title="播放">&#x25B6;</button>
          <button class="action-btn add-btn" @click="store.addToPlaylist(song)" title="添加到播放列表">&#x2795;</button>
          <button class="action-btn fav-btn" :class="{ favorited: isFav(song.id) }" @click="toggleFav(song)" title="收藏">&#x2665;</button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { usePlayerStore } from '../stores/player'
import { platforms, platformColors, platformSongs } from '../data/mockData'
import { fetchCharts } from '../services/api'
import { getFavorites, addFavorite, removeFavorite } from '../utils/storage'

const store = usePlayerStore()
const activePlatform = ref(platforms[0])

const liveData = ref({})
const loading = ref(false)

const currentSongs = computed(() => {
  const live = liveData.value[activePlatform.value]
  if (live?.songs?.length) return live.songs
  return platformSongs[activePlatform.value] || []
})

async function loadPlatform(platform) {
  loading.value = true
  try {
    const data = await fetchCharts(platform)
    if (data?.[0]?.songs?.length) {
      liveData.value[platform] = data[0]
    }
  } catch (e) {
  } finally {
    loading.value = false
  }
}

watch(activePlatform, (p) => {
  if (!liveData.value[p]) loadPlatform(p)
})

onMounted(() => {
  loadPlatform(activePlatform.value)
})

function isFav(songId) {
  return getFavorites().some(s => s.id === songId)
}

function toggleFav(song) {
  if (isFav(song.id)) {
    removeFavorite(song.id)
  } else {
    addFavorite(song)
  }
}
</script>

<style scoped>
.platform-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.platform-tab {
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.platform-tab:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.platform-tab.active {
  background: transparent;
}

.chart-header-row, .chart-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  font-size: 13px;
}

.chart-header-row {
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.chart-row {
  border-radius: var(--radius-sm);
  cursor: default;
  transition: background 0.2s;
}

.chart-row:hover { background: var(--bg-card); }

.col-rank { width: 40px; text-align: center; flex-shrink: 0; }
.col-cover { width: 44px; flex-shrink: 0; }
.col-title { flex: 1; min-width: 0; }
.col-artist { width: 140px; color: var(--text-secondary); flex-shrink: 0; }
.col-duration { width: 60px; color: var(--text-muted); text-align: right; flex-shrink: 0; }
.col-action { width: 120px; display: flex; gap: 4px; flex-shrink: 0; }

.rank-badge {
  display: inline-block;
  width: 28px;
  height: 28px;
  line-height: 28px;
  text-align: center;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  background: var(--bg-card);
}

.rank-badge.gold { color: #f59e0b; background: rgba(245, 158, 11, 0.1); }
.rank-badge.silver { color: #94a3b8; background: rgba(148, 163, 184, 0.1); }
.rank-badge.bronze { color: #d97706; background: rgba(217, 119, 6, 0.1); }

.row-cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
}

.row-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 14px;
  color: var(--text-muted);
  transition: all 0.2s;
}

.action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.play-btn:hover { color: var(--accent-light); }
.add-btn:hover { color: #10b981; }
.fav-btn.favorited { color: #ef4444; }

.loading-bar {
  padding: 12px 16px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 768px) {
  .col-artist { width: 100px; }
  .col-duration { width: 50px; }
  .col-action { width: 96px; }
}
</style>
