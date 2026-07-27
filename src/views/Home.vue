<template>
  <div class="home">
    <section class="section">
      <h2 class="section-title">热门榜单速览</h2>
      <div v-if="Object.keys(top3ByPlatform).length" class="chart-preview-grid">
        <div v-for="(songs, platform) in top3ByPlatform" :key="platform" class="chart-preview-card" @click="router.push('/charts')">
          <div class="chart-header" :style="{ borderColor: platformColors[platform] }">
            <span class="chart-platform" :style="{ color: platformColors[platform] }">{{ platform }}</span>
            <span class="chart-more">查看全部 &rarr;</span>
          </div>
          <div v-for="(song, i) in songs" :key="song.id" class="chart-song" @click.stop="store.playSong(song)">
            <span class="chart-rank" :class="{ gold: i === 0, silver: i === 1, bronze: i === 2 }">{{ i + 1 }}</span>
            <div class="chart-song-info">
              <div class="chart-song-title">{{ song.title }}</div>
              <div class="chart-song-artist">{{ song.artist }}</div>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="no-result">正在加载榜单数据...</p>
    </section>

    <section class="section" v-if="recentPlays.length">
      <h2 class="section-title">最近播放</h2>
      <div class="recent-list">
        <SongCard v-for="song in recentPlays" :key="song.id" :song="song" @play="store.playSong" />
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { platforms, platformColors } from '../data/platforms'
import { fetchCharts } from '../services/api'
import { getRecentPlays } from '../utils/storage'
import SongCard from '../components/SongCard.vue'

const router = useRouter()
const store = usePlayerStore()

const recentPlays = ref([])
const liveCharts = ref({})

const top3ByPlatform = computed(() => {
  const result = {}
  for (const platform of platforms) {
    const live = liveCharts.value[platform]
    if (live?.songs?.length) {
      result[platform] = live.songs.slice(0, 3)
    }
  }
  return result
})

onMounted(async () => {
  recentPlays.value = getRecentPlays().slice(0, 10)
  for (const platform of platforms) {
    fetchCharts(platform).then(data => {
      if (data?.[0]?.songs?.length) {
        liveCharts.value[platform] = data[0]
      }
    }).catch(() => {})
  }
})
</script>

<style scoped>
.home { padding-bottom: 32px; }

.section { margin-bottom: 40px; }

.no-result { padding: 40px; text-align: center; color: var(--text-muted); font-size: 15px; }

.chart-preview-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}

.chart-preview-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 20px;
  cursor: pointer;
  transition: transform 0.2s;
}

.chart-preview-card:hover { transform: translateY(-2px); }

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 2px solid;
}

.chart-platform {
  font-size: 16px;
  font-weight: 700;
}

.chart-more {
  font-size: 12px;
  color: var(--text-muted);
}

.chart-song {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-radius: 4px;
  transition: background 0.2s;
}

.chart-song:hover { background: var(--bg-hover); }

.chart-rank {
  width: 24px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-muted);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.chart-rank.gold { color: #f59e0b; }
.chart-rank.silver { color: #94a3b8; }
.chart-rank.bronze { color: #d97706; }

.chart-song-info { flex: 1; min-width: 0; }

.chart-song-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-song-artist {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.recent-list {
  background: var(--bg-card);
  border-radius: var(--radius);
  overflow: hidden;
}

@media (max-width: 1024px) {
  .chart-preview-grid { grid-template-columns: repeat(3, 1fr); }
}

@media (max-width: 640px) {
  .chart-preview-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
