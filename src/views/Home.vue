<template>
  <div class="home">
    <section class="section">
      <h2 class="section-title">热门榜单速览</h2>
      <div v-if="Object.keys(top5ByPlatform).length" class="bento-grid">
        <div
          v-for="(songs, platform) in top5ByPlatform"
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
              <img v-if="song.cover" :src="song.cover" :alt="song.title" class="bento-cover" loading="lazy" decoding="async" @error="e => e.target.style.display = 'none'" />
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

    <!-- 我的喜欢 / 最近播放 / 下载 标签切换 -->
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
        <button
          class="tab-btn"
          :class="{ active: activeSection === 'downloads' }"
          @click="activeSection = 'downloads'"
        >&#x2B07; 下载 <span v-if="downloadSongs.length" class="tab-badge">{{ downloadSongs.length }}</span></button>
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

      <!-- 下载歌曲 -->
      <div v-if="activeSection === 'downloads'">
        <div v-if="downloadSongs.length" class="list-head">
          <span class="list-count">共 {{ downloadSongs.length }} 首</span>
          <div class="list-head-actions">
            <button class="play-all-btn glass-card" :class="{ playing: playingAll }" @click="playAllFx(downloadSongs)">&#x25B6; 播放全部</button>
          </div>
        </div>
        <!-- 本地导入按钮 -->
        <div class="import-row">
          <label class="import-btn glass-card">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            导入本地文件
            <input type="file" accept="audio/*" multiple class="file-input" @change="onImportFiles" />
          </label>
          <span v-if="importing" class="importing-text">导入中... {{ importProgress }}</span>
        </div>
        <div v-if="downloadSongs.length" class="recent-list glass-card">
          <div v-for="song in downloadSongs" :key="song.id" class="download-item">
            <SongCard :song="song" show-play @play="store.playSong" />
            <button class="dl-delete-btn" @click.stop="removeDl(song)" title="删除">&#x2715;</button>
          </div>
        </div>
        <div v-else class="empty-state glass-card">
          <svg viewBox="0 0 24 24" class="empty-icon pulse-icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <div class="empty-title">还没有下载歌曲</div>
          <div class="empty-desc">点击上方「导入本地文件」添加你的音乐，或在播放时点击下载按钮保存歌曲</div>
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
import { getRecentPlays, getFavorites, getDownloads, addDownload, removeDownload } from '../utils/storage'
import SongCard from '../components/SongCard.vue'

const router = useRouter()
const store = usePlayerStore()

const activeSection = ref('favorites')
const recentPlays = ref([])
const favoriteSongs = ref([])
const downloadSongs = ref([])
const liveCharts = ref({})
const isMobile = window.innerWidth <= 768
// 首页榜单速览：移动端只保留网易云，PC端全平台
const homePlatforms = isMobile ? ['网易云音乐'] : ['网易云音乐', 'B站', '抖音', 'QQ音乐', '咪咕音乐']
// 播放全部按钮的弹跳动画状态，触发后短暂点亮再复位
const playingAll = ref(false)
// 本地文件导入中状态
const importing = ref(false)
// 导入进度
const importProgress = ref('')

// 播放全部并触发按钮弹跳动画
function playAllFx(songs) {
  if (!songs?.length) return
  playingAll.value = true
  store.playAll(songs)
  setTimeout(() => { playingAll.value = false }, 350)
}

// 重命名 top3ByPlatform -> top5ByPlatform：函数实际取每平台榜单前 5 首（slice(0, 5)），原命名与行为不符，避免误导
const top5ByPlatform = computed(() => {
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
  const keys = Object.keys(top5ByPlatform.value)
  if (keys.length === 0) return 'small'
  return platform === keys[0] ? 'large' : 'small'
}

onMounted(async () => {
  recentPlays.value = await getRecentPlays()
  favoriteSongs.value = await getFavorites()
  downloadSongs.value = await getDownloads()
  for (const platform of homePlatforms) {
    fetchCharts(platform, 1, undefined, 0).then(data => {
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
  downloadSongs.value = await getDownloads()
}

// 任意入口（播放条/榜单/歌曲卡）收藏变化时刷新"我的喜欢"列表
watch(() => store.favVersion, async () => {
  favoriteSongs.value = await getFavorites()
})

// 本地文件导入：读取音频文件，解析文件名，存入 IndexedDB
async function onImportFiles(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length) return
  importing.value = true
  importProgress.value = `0/${files.length}`
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        // 解析文件名：尝试 "歌手 - 歌名" 格式，否则用文件名作标题
        const name = file.name.replace(/\.[^.]+$/, '')
        let title = name
        let artist = '未知'
        const dashIdx = name.indexOf(' - ')
        if (dashIdx > 0) {
          artist = name.slice(0, dashIdx).trim()
          title = name.slice(dashIdx + 3).trim()
        }
        const audioBuffer = await file.arrayBuffer()
        const song = {
          id: `download_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title,
          artist,
          album: '',
          cover: '',
          duration: '0:00',
          durationMs: 0,
          platform: '本地导入',
          audioUrl: '',
          sourceUrl: '',
          vip: false,
          fromDownload: true,
          mimeType: file.type || 'audio/mpeg',
          fileSize: file.size
        }
        await addDownload(song, audioBuffer)
        importProgress.value = `${i + 1}/${files.length}`
        console.log('导入成功:', title, `(${i + 1}/${files.length})`)
      } catch (err) {
        console.error('导入文件失败:', file.name, err)
      }
      // 让出主线程刷新 UI 进度
      await new Promise(r => setTimeout(r, 0))
    }
    // 刷新列表
    downloadSongs.value = await getDownloads()
  } catch (err) {
    console.error('导入整体失败:', err)
  } finally {
    importing.value = false
    importProgress.value = ''
    e.target.value = ''
  }
}

// 删除下载歌曲
async function removeDl(song) {
  await removeDownload(song.id)
  downloadSongs.value = await getDownloads()
}
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

/* ===== Downloads ===== */
.tab-badge {
  display: inline-block;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  border-radius: 9px;
  padding: 0 5px;
  margin-left: 4px;
  vertical-align: middle;
}

.list-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.import-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.import-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .import-btn:hover {
    background: rgba(99, 102, 241, 0.15);
    color: var(--accent-light);
  }
}
.import-btn:active { transform: scale(0.96); }

.file-input {
  display: none;
}

.importing-text {
  font-size: 12px;
  color: var(--text-muted);
}

.download-item {
  position: relative;
}

.dl-delete-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-muted);
  background: transparent;
  border-radius: 50%;
  opacity: 0;
  transition: all 0.2s;
  cursor: pointer;
}
@media (hover: hover) {
  .download-item:hover .dl-delete-btn {
    opacity: 1;
  }
  .dl-delete-btn:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }
}
.dl-delete-btn:active { transform: translateY(-50%) scale(0.85); }
/* 触屏始终显示删除按钮 */
@media (hover: none) {
  .dl-delete-btn { opacity: 1; }
}
</style>
