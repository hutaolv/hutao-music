<template>
  <div class="charts">
    <h1 class="section-title">排行榜</h1>
    <p class="section-subtitle">汇聚五大平台热门歌曲，每日更新</p>

    <div class="platform-tabs">
      <button v-for="p in platforms" :key="p" class="platform-tab" :class="{ active: activePlatform === p }" :style="activePlatform === p ? { color: platformColors[p], borderColor: platformColors[p] } : {}" @click="switchPlatform(p)">{{ p }}</button>
    </div>

    <div v-if="sublists.length > 1" class="sublist-tabs">
      <button v-for="(list, i) in sublists" :key="i" class="sublist-tab" :class="{ active: activeSubList === i }" @click="activeSubList = i">{{ list.name }}</button>
    </div>

    <div v-if="loading" class="loading-bar">正在获取 {{ activePlatform }} 最新榜单...</div>
    <div v-if="!loading && !currentSongs.length" class="no-result">暂无榜单数据</div>

    <div v-if="currentSongs.length" class="chart-toolbar">
      <span class="chart-toolbar-info">共 {{ currentSongs.length }} 首</span>
      <button class="play-all-btn" :class="{ playing: playingAll }" @click="playAllFx(currentSongs)">&#x25B6; 播放全部</button>
    </div>

    <div v-if="currentSongs.length" class="chart-header-row">
      <span class="col-rank">#</span>
      <span class="col-cover"></span>
      <span class="col-title">歌曲</span>
      <span class="col-artist">歌手</span>
      <span class="col-duration">时长</span>
      <span class="col-action">操作</span>
    </div>

    <div v-if="currentSongs.length" class="chart-list">
      <div v-for="(song, idx) in currentSongs" :key="song.id" class="chart-row" @dblclick="store.playSong(song)">
        <span class="col-rank">
          <span class="rank-badge" :class="{ gold: idx === 0, silver: idx === 1, bronze: idx === 2 }">{{ idx + 1 }}</span>
        </span>
        <span class="col-cover">
          <img :src="song.cover" :alt="song.title" class="row-cover" @error="e => e.target.style.display = 'none'" />
        </span>
          <span class="col-title">
            <span class="row-title">{{ song.title }}</span>
            <span v-if="song.vip" class="chart-vip">VIP</span>
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
import { useRoute } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { platforms, platformColors } from '../data/platforms'
import { fetchCharts } from '../services/api'
import { getFavorites, addFavorite, removeFavorite } from '../utils/storage'

const route = useRoute()
const store = usePlayerStore()

// 支持从首页"查看全部"带平台参数进入，如 /charts?platform=网易云音乐
const activePlatform = ref(route.query.platform && platforms.includes(route.query.platform) ? route.query.platform : platforms[0])
const activeSubList = ref(0)

const liveData = ref({})
const loading = ref(false)
// 播放全部按钮的弹跳动画状态，触发后短暂点亮再复位
const playingAll = ref(false)

// 播放全部并触发按钮弹跳动画
function playAllFx(songs) {
  if (!songs?.length) return
  playingAll.value = true
  store.playAll(songs)
  setTimeout(() => { playingAll.value = false }, 350)
}

const sublists = computed(() => {
  return liveData.value[activePlatform.value] || []
})

const currentSongs = computed(() => {
  const lists = liveData.value[activePlatform.value]
  if (!lists?.length) return []
  const list = lists[activeSubList.value]
  return list?.songs || []
})

function switchPlatform(p) {
  activePlatform.value = p
  activeSubList.value = 0
}

async function loadPlatform(platform) {
  loading.value = true
  try {
    const data = await fetchCharts(platform)
    if (data?.length) {
      liveData.value[platform] = data
    }
  } catch (e) {
  } finally {
    loading.value = false
  }
}

watch(activePlatform, (p) => {
  if (!liveData.value[p]) loadPlatform(p)
})

// 路由平台参数变化时（如再次从首页进入）同步切换当前平台
watch(() => route.query.platform, (p) => {
  if (p && platforms.includes(p) && p !== activePlatform.value) {
    switchPlatform(p)
  }
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
  margin-bottom: 16px;
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

.sublist-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  padding-left: 4px;
}

.sublist-tab {
  padding: 6px 16px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.sublist-tab:hover {
  color: var(--text-secondary);
  border-color: var(--text-muted);
}

.sublist-tab.active {
  color: var(--accent-light);
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.08);
}

.chart-header-row, .chart-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  font-size: 13px;
}

/* 榜单工具条：歌曲数 + 播放全部按钮 */
.chart-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 4px;
}

.chart-toolbar-info { font-size: 12px; color: var(--text-muted); }

.play-all-btn {
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  background: var(--accent-light);
  padding: 6px 12px;
  border-radius: 999px;
  transition: opacity 0.2s, transform 0.2s;
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

.chart-vip {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  font-weight: 700;
  margin-left: 6px;
  letter-spacing: 0.5px;
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

.no-result { padding: 40px; text-align: center; color: var(--text-muted); font-size: 15px; }

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
