<template>
  <div class="home">
    <section class="section">
      <h2 class="section-title">热门榜单速览</h2>
      <div v-if="Object.keys(top3ByPlatform).length" class="bento-grid">
        <div
          v-for="(songs, platform) in top3ByPlatform"
          :key="platform"
          class="bento-card glass-card hover-lift card-enter"
          :class="'bento-' + bentoSize(platform)"
          :style="{ '--card-accent': platformColors[platform], '--card-grad': 'var(--grad-' + platform + ')' }"
          @click="router.push({ path: '/charts', query: { platform } })"
        >
          <div class="bento-header">
            <span class="bento-platform" :style="{ color: platformColors[platform] }">{{ platform }}</span>
            <span class="bento-more" @click.stop="router.push({ path: '/charts', query: { platform } })">查看全部 &rarr;</span>
          </div>
          <div class="bento-songs">
            <div v-for="(song, i) in songs" :key="song.id" class="bento-song" @click.stop="store.playSong(song)">
              <span class="bento-rank" :class="{ gold: i === 0, silver: i === 1, bronze: i === 2 }">{{ i + 1 }}</span>
              <img v-if="song.cover" :src="song.cover" :alt="song.title" class="bento-cover" @error="e => e.target.style.display = 'none'" />
              <div class="bento-song-info">
                <div class="bento-song-title">{{ song.title }}</div>
                <div class="bento-song-artist">{{ song.artist }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="no-result">正在加载榜单数据...</p>
    </section>

    <!-- 我的喜欢 / 最近播放 标签切换 -->
    <div class="fav-recent-section">
      <div class="fav-recent-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeSection === 'favorites' }"
          @click="activeSection = 'favorites'"
        >&#x2665; 我的喜欢</button>
        <button
          class="tab-btn"
          :class="{ active: activeSection === 'recent' }"
          @click="activeSection = 'recent'"
        >历史播放</button>
      </div>

      <div v-if="activeSection === 'favorites'">
        <div v-if="favoriteSongs.length" class="list-head">
          <span class="list-count">共 {{ favoriteSongs.length }} 首</span>
          <button class="play-all-btn glass-card" :class="{ playing: playingAll }" @click="playAllFx(favoriteSongs)">&#x25B6; 播放全部</button>
        </div>
        <div v-if="favoriteSongs.length" class="recent-list glass-card">
          <SongCard v-for="song in favoriteSongs" :key="song.id" :song="song" show-play @play="store.playSong" @fav-changed="refreshFavorites" />
        </div>
        <div v-else class="empty-state glass-card">
          <svg viewBox="0 0 24 24" class="empty-icon pulse-icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <div class="empty-title">还没有收藏歌曲</div>
          <div class="empty-desc">去排行榜逛逛，遇到喜欢的歌点一下 &#x2665; 就能收藏到这里</div>
          <button class="empty-btn" @click="router.push('/charts')">去看榜单</button>
        </div>
      </div>

      <div v-else>
        <div v-if="recentPlays.length" class="list-head">
          <span class="list-count">共 {{ recentPlays.length }} 首</span>
          <button class="play-all-btn glass-card" :class="{ playing: playingAll }" @click="playAllFx(recentPlays)">&#x25B6; 播放全部</button>
        </div>
        <div v-if="recentPlays.length" class="recent-list glass-card">
          <SongCard v-for="song in recentPlays" :key="song.id" :song="song" show-play @play="store.playSong" @fav-changed="refreshFavorites" />
        </div>
        <div v-else class="empty-state glass-card">
          <svg viewBox="0 0 24 24" class="empty-icon pulse-icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
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
import { ref, computed, onMounted, watch } from 'vue'
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
const isMobile = window.innerWidth <= 768
// 首页榜单速览：移动端只保留网易云，PC端全平台
const homePlatforms = isMobile ? ['网易云音乐'] : ['酷狗音乐', 'QQ音乐', '网易云音乐', 'B站', '咪咕音乐']
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
  for (const platform of homePlatforms) {
    const live = liveCharts.value[platform]
    if (live?.songs?.length) {
      result[platform] = live.songs.slice(0, 5)
    }
  }
  return result
})

// Bento grid sizing: first platform gets large card, rest get small
function bentoSize(platform) {
  const keys = Object.keys(top3ByPlatform.value)
  if (keys.length === 0) return 'small'
  return platform === keys[0] ? 'large' : 'small'
}

onMounted(async () => {
  recentPlays.value = await getRecentPlays()
  favoriteSongs.value = await getFavorites()
  for (const platform of homePlatforms) {
    fetchCharts(platform).then(data => {
      if (data?.[0]?.songs?.length) {
        liveCharts.value[platform] = data[0]
      }
    }).catch(() => {})
  }
})

async function refreshFavorites() {
  // 重新读取全部收藏与最近播放，不做数量截断
  favoriteSongs.value = await getFavorites()
  recentPlays.value = await getRecentPlays()
}

// 任意入口（播放条/榜单/歌曲卡）收藏变化时刷新"我的喜欢"列表
watch(() => store.favVersion, async () => {
  favoriteSongs.value = await getFavorites()
})
</script>

<style scoped>
.home { padding-bottom: 32px; }

.section { margin-bottom: 40px; }

.no-result { padding: 40px; text-align: center; color: var(--text-muted); font-size: 15px; }

/* ===== Bento Grid ===== */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.bento-card {
  padding: 20px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  background: var(--card-grad, var(--glass-bg)), var(--glass-bg);
  animation-delay: calc(var(--enter-i, 0) * 60ms);
}

/* First card spans 2 columns and shows more songs */
.bento-card.bento-large {
  grid-column: span 2;
}

.bento-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.bento-platform {
  font-size: 16px;
  font-weight: 700;
}

.bento-more {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: color 0.2s;
}
@media (hover: hover) {
  .bento-more:hover { color: var(--card-accent, var(--accent-light)); }
}

.bento-songs {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bento-song {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.2s;
  cursor: pointer;
  border-left: 2px solid transparent;
}
@media (hover: hover) {
  .bento-song:hover {
    background: rgba(255, 255, 255, 0.04);
    border-left-color: var(--card-accent, var(--accent));
  }
}

.bento-rank {
  width: 22px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  text-align: center;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.bento-rank.gold {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.bento-rank.silver {
  background: linear-gradient(135deg, #cbd5e1, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.bento-rank.bronze {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.bento-cover {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.bento-song-info { flex: 1; min-width: 0; }

.bento-song-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bento-song-artist {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== Tabs ===== */
.fav-recent-section {
  margin-bottom: 40px;
}

.fav-recent-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
}

.tab-btn {
  padding: 10px 20px;
  border-radius: var(--radius-pill);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}
@media (hover: hover) {
  .tab-btn:hover {
    color: var(--text-secondary);
    background: rgba(255, 255, 255, 0.04);
  }
}
.tab-btn.active {
  color: var(--accent-light);
  background: rgba(99, 102, 241, 0.1);
}

/* ===== List head ===== */
.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.list-count { font-size: 12px; color: var(--text-muted); }

.play-all-btn {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  transition: opacity 0.2s, transform 0.2s;
  flex-shrink: 0;
  white-space: nowrap;
}

.play-all-btn:hover { opacity: 0.85; }
.play-all-btn:active { transform: scale(0.92); }
.play-all-btn.playing { animation: playall-pop 0.3s ease; }

@keyframes playall-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

.recent-list {
  overflow: hidden;
}

/* ===== Empty states ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 24px;
  text-align: center;
}

.empty-icon {
  width: 52px;
  height: 52px;
  color: var(--text-muted);
  margin-bottom: 16px;
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
  line-height: 1.6;
}

.empty-btn {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  padding: 10px 24px;
  border-radius: var(--radius-pill);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .empty-btn:hover {
    background: var(--accent-light);
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);
    transform: translateY(-1px);
  }
}
.empty-btn:active { transform: scale(0.96); }

/* ===== Mobile ===== */
@media (max-width: 767px) {
  .bento-grid {
    grid-template-columns: 1fr;
  }
  .bento-card.bento-large {
    grid-column: span 1;
  }
  .bento-cover { display: none; }
  .fav-recent-tabs { gap: 2px; }
  .tab-btn { padding: 8px 14px; font-size: 14px; }
}
</style>
