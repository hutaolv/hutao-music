<template>
  <div class="home">
    <section class="section">
      <h2 class="section-title">热门榜单速览</h2>
      <div v-if="Object.keys(top3ByPlatform).length" class="chart-preview-grid">
        <div v-for="(songs, platform) in top3ByPlatform" :key="platform" class="chart-preview-card" :data-platform="platform" @click="router.push({ path: '/charts', query: { platform } })">
          <div class="chart-header" :style="{ borderColor: platformColors[platform] }">
            <span class="chart-platform" :style="{ color: platformColors[platform] }">{{ platform }}</span>
            <span class="chart-more" @click.stop="router.push({ path: '/charts', query: { platform } })">查看全部 &rarr;</span>
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

    <!-- 我的喜欢 / 最近播放 标签切换 -->
    <div class="fav-recent-section">
      <div class="fav-recent-tabs">
        <h2
          class="section-title tab-title"
          :class="{ active: activeSection === 'favorites' }"
          @click="activeSection = 'favorites'"
        >&#x2665; 我的喜欢</h2>
        <h2
          class="section-title tab-title"
          :class="{ active: activeSection === 'recent' }"
          @click="activeSection = 'recent'"
        >历史播放</h2>
      </div>

      <div v-if="activeSection === 'favorites'">
        <div v-if="favoriteSongs.length" class="list-head">
          <span class="list-count">共 {{ favoriteSongs.length }} 首</span>
          <button class="play-all-btn" :class="{ playing: playingAll }" @click="playAllFx(favoriteSongs)">&#x25B6; 播放全部</button>
        </div>
        <div v-if="favoriteSongs.length" class="recent-list">
          <SongCard v-for="song in favoriteSongs" :key="song.id" :song="song" show-play @play="store.playSong" @fav-changed="refreshFavorites" />
        </div>
        <div v-else class="empty-state">
          <svg viewBox="0 0 24 24" class="empty-icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <div class="empty-title">还没有收藏歌曲</div>
          <div class="empty-desc">去排行榜逛逛，遇到喜欢的歌点一下&#x2665; 就能收藏到这里</div>
          <button class="empty-btn" @click="router.push('/charts')">去看榜单</button>
        </div>
      </div>

      <div v-else>
        <div v-if="recentPlays.length" class="list-head">
          <span class="list-count">共 {{ recentPlays.length }} 首</span>
          <button class="play-all-btn" :class="{ playing: playingAll }" @click="playAllFx(recentPlays)">&#x25B6; 播放全部</button>
        </div>
        <div v-if="recentPlays.length" class="recent-list">
          <SongCard v-for="song in recentPlays" :key="song.id" :song="song" show-play @play="store.playSong" @fav-changed="refreshFavorites" />
        </div>
        <div v-else class="empty-state">
          <svg viewBox="0 0 24 24" class="empty-icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <div class="empty-title">还没有播放记录</div>
          <div class="empty-desc">现在播放一首歌，它会自动出现在这里，方便下次继续听</div>
          <button class="empty-btn" @click="router.push('/charts')">去听榜单</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { platforms, platformColors } from '../data/platforms'
import { fetchCharts } from '../services/api'
import { getRecentPlays, getFavorites } from '../utils/storage'
import SongCard from '../components/SongCard.vue'

const router = useRouter()
const store = usePlayerStore()

const activeSection = ref('favorites')
const recentPlays = ref([])
const favoriteSongs = ref([])
const liveCharts = ref({})
// 播放全部按钮的弹跳动画状态，触发后短暂点亮再复位
const playingAll = ref(false)

// 播放全部并触发按钮弹跳动画
function playAllFx(songs) {
  if (!songs?.length) return
  playingAll.value = true
  store.playAll(songs)
  setTimeout(() => { playingAll.value = false }, 350)
}

const top3ByPlatform = computed(() => {
  const result = {}
  for (const platform of platforms) {
    const live = liveCharts.value[platform]
    if (live?.songs?.length) {
      // 首页每个平台显示前5首
      result[platform] = live.songs.slice(0, 5)
    }
  }
  return result
})

onMounted(async () => {
  // 最近播放最多50条
  recentPlays.value = getRecentPlays().slice(0, 50)
  // 我的喜欢最多50条
  favoriteSongs.value = getFavorites().slice(0, 50)
  for (const platform of platforms) {
    fetchCharts(platform).then(data => {
      if (data?.[0]?.songs?.length) {
        liveCharts.value[platform] = data[0]
      }
    }).catch(() => {})
  }
})

function refreshFavorites() {
  favoriteSongs.value = getFavorites().slice(0, 50)
  recentPlays.value = getRecentPlays().slice(0, 50)
}
</script>

<style scoped>
.home { padding-bottom: 32px; }

.section { margin-bottom: 40px; }

.no-result { padding: 40px; text-align: center; color: var(--text-muted); font-size: 15px; }

.chart-preview-grid {
  display: grid;
  /* 卡宽按屏幕百分比（每列约容器宽度的20%），min 220px 防过窄，auto-fill 自动换行并居中 */
  grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), calc(20% - 16px)));
  gap: 16px;
  justify-content: center;
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
  flex-shrink: 0;
}

/* 播放全部按钮：主色圆角胶囊样式 */
.play-all-btn {
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  background: var(--accent-light);
  padding: 4px 10px;
  border-radius: 999px;
  transition: opacity 0.2s, transform 0.2s;
  flex-shrink: 0;
  white-space: nowrap;
}

.play-all-btn:hover { opacity: 0.85; }

/* 点击播放全部时按钮回弹动画 */
.play-all-btn:active { transform: scale(0.9); }
.play-all-btn.playing { animation: playall-pop 0.3s ease; }

@keyframes playall-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

/* 我的喜欢/历史播放列表头：数量 + 播放全部 */
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.list-count { font-size: 12px; color: var(--text-muted); }

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

/* 空状态：图标 + 提示 + 引导按钮 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 24px;
  background: var(--bg-card);
  border-radius: var(--radius);
  text-align: center;
}

.empty-icon {
  width: 56px;
  height: 56px;
  color: var(--text-muted);
  margin-bottom: 16px;
  opacity: 0.8;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 320px;
  margin-bottom: 20px;
}

.empty-btn {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--accent-light);
  padding: 8px 20px;
  border-radius: 999px;
  transition: opacity 0.2s, transform 0.2s;
}

.empty-btn:hover { opacity: 0.85; }
.empty-btn:active { transform: scale(0.95); }

.fav-recent-section {
  margin-bottom: 40px;
}

.fav-recent-tabs {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0;
}

.tab-title {
  margin-bottom: 0;
  padding-bottom: 12px;
  cursor: pointer;
  color: var(--text-muted);
  transition: color 0.2s;
  position: relative;
  font-size: 20px;
  user-select: none;
}

.tab-title:hover {
  color: var(--text-secondary);
}

.tab-title.active {
  color: var(--accent-light);
}

.tab-title.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent-light);
  border-radius: 2px;
}

@media (max-width: 768px) {
  .fav-recent-tabs { gap: 16px; }
  .tab-title { font-size: 18px; }
  /* 手机端热门榜单速览只保留网易云音乐 */
  .chart-preview-card:not([data-platform="网易云音乐"]) { display: none; }
  .chart-preview-grid { grid-template-columns: 1fr; }
}
</style>
