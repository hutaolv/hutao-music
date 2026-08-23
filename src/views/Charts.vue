<template>
  <div class="charts">
    <h1 class="section-title">排行榜</h1>
    <p class="section-subtitle">汇聚五大平台热门歌曲，每日更新</p>

    <div class="platform-tabs">
      <button v-for="p in platforms" :key="p" class="platform-tab" :class="{ active: activePlatform === p }" :style="activePlatform === p ? { color: platformColors[p], borderColor: platformColors[p] } : {}" @click="switchPlatform(p)">{{ p }}</button>
    </div>

    <div v-if="sublists.length > 1" class="sublist-tabs">
      <button v-for="(list, i) in sublists" :key="i" class="sublist-tab" :class="{ active: activeSubList === i }" @click="activeSubList = i; hoyoSort = 2">{{ list.name }}</button>
    </div>

    <div v-if="currentSubList?.name === 'HOYO-MiX'" class="hoyo-sort">
      <button class="hoyo-sort-btn" :class="{ active: hoyoSort === 1 }" @click="switchHoyoSort(1)">&#x1F525; 最热</button>
      <button class="hoyo-sort-btn" :class="{ active: hoyoSort === 2 }" @click="switchHoyoSort(2)">&#x23F0; 最新</button>
    </div>

    <div v-if="currentSongs.length" class="vip-filter">
      <button class="vip-filter-btn" :class="{ active: vipFilter === 'all' }" @click="vipFilter = 'all'">全部 ({{ currentSongs.length }})</button>
      <button v-if="vipCount" class="vip-filter-btn" :class="{ active: vipFilter === 'free' }" @click="vipFilter = 'free'">免费 ({{ freeCount }})</button>
      <button v-if="vipCount" class="vip-filter-btn" :class="{ active: vipFilter === 'vip' }" @click="vipFilter = 'vip'">VIP ({{ vipCount }})</button>
    </div>

    <HutaoLoading v-if="loading" text="胡桃正在全力加载中" />
    <div v-if="!loading && !currentSongs.length" class="no-result">暂无榜单数据</div>

    <div v-if="currentSongs.length" class="chart-toolbar">
      <span class="chart-toolbar-info">共 {{ filteredSongs.length }} 首</span>
      <button class="play-all-btn" :class="{ playing: playingAll }" @click="playAllFx(filteredSongs)">&#x25B6; 播放全部</button>
    </div>

    <div v-if="filteredSongs.length" class="chart-header-row">
      <span class="col-rank">#</span>
      <span class="col-cover"></span>
      <span class="col-title">歌曲</span>
      <span class="col-artist">歌手</span>
      <span class="col-duration">时长</span>
      <span class="col-action">操作</span>
    </div>

    <div v-if="filteredSongs.length" class="chart-list">
      <div v-for="(song, idx) in filteredSongs" :key="song.id" class="chart-row" @dblclick="store.playSong(song)">
        <span class="col-rank">
          <span class="rank-badge" :class="{ gold: idx === 0, silver: idx === 1, bronze: idx === 2 }">{{ idx + 1 }}</span>
        </span>
        <span class="col-cover">
          <img :src="song.cover" :alt="song.title" class="row-cover" @error="e => e.target.style.display = 'none'" />
        </span>
          <span class="col-title">
            <span class="row-title">{{ song.title }}</span>
            <span v-if="song.vip" class="chart-vip">VIP</span>
            <span v-if="song.vip" class="chart-hutao" @click.stop="goSearch(song.title)">🍑</span>
          </span>
        <span class="col-artist">{{ song.artist }}</span>
        <span class="col-duration">{{ song.duration }}</span>
        <span class="col-action">
          <button class="action-btn play-btn" @click="store.playSong(song)" title="播放">&#x25B6;</button>
          <button class="action-btn add-btn" @click="store.addToPlaylist(song)" title="添加到播放列表">&#x2795;</button>
          <button class="action-btn fav-btn" :class="favClass(song.id)" @click="toggleFav(song)" title="收藏"><span class="fav-heart">&#x2665;</span></button>
        </span>
      </div>
    </div>

    <button v-if="chartHasMore && !loading" class="load-more" :disabled="loadingMore" @click="loadMore">
      {{ loadingMore ? '加载中...' : '加载更多' }}
    </button>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { platforms, platformColors } from '../data/platforms'
import { fetchCharts, fetchChartsMore } from '../services/api'
import { getFavorites, addFavorite, removeFavorite } from '../utils/storage'
import HutaoLoading from '../components/HutaoLoading.vue'

const route = useRoute()
const router = useRouter()
const store = usePlayerStore()

// 支持从首页"查看全部"带平台参数进入，如 /charts?platform=网易云音乐
// 默认展示网易云音乐排行榜（保持平台标签原有顺序）
const DEFAULT_PLATFORM = '网易云音乐'
const PLATFORM_STORAGE_KEY = 'hutao:charts-platform'
const SUBLIST_KEY = 'hutao:charts-sublist'
const HOYO_SORT_KEY = 'hutao:charts-hoyo-sort'
// 优先用路由参数（明确导航意图），否则恢复上次选中的平台，都没有才回退默认
const lastPlatform = localStorage.getItem(PLATFORM_STORAGE_KEY)
const activePlatform = ref(route.query.platform && platforms.includes(route.query.platform)
  ? route.query.platform
  : (lastPlatform && platforms.includes(lastPlatform) ? lastPlatform : DEFAULT_PLATFORM))
const activeSubList = ref(Number(localStorage.getItem(SUBLIST_KEY)) || 0)
const hoyoSort = ref(Number(localStorage.getItem(HOYO_SORT_KEY)) || 1) // 1=最热, 2=最新

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

// 点击胡桃跳转搜索页，携带歌曲名和平台参数
function goSearch(title) {
  router.push({ path: '/search', query: { q: title, platform: activePlatform.value } })
}

// HOYO-MiX 排序切换
function switchHoyoSort(order) {
  if (hoyoSort.value === order) return
  hoyoSort.value = order
  liveData.value['QQ音乐'] = null
  loadPlatform(activePlatform.value)
}

const sublists = computed(() => {
  return liveData.value[activePlatform.value] || []
})

const currentSubList = computed(() => {
  const lists = liveData.value[activePlatform.value]
  if (!lists?.length) return null
  return lists[activeSubList.value] || null
})

const currentSongs = computed(() => {
  return currentSubList.value?.songs || []
})

// VIP 筛选：all=全部，free=免费，vip=VIP
const vipFilter = ref('all')
const freeCount = computed(() => currentSongs.value.filter(s => !s.vip).length)
const vipCount = computed(() => currentSongs.value.filter(s => s.vip).length)
const filteredSongs = computed(() => {
  if (vipFilter.value === 'free') return currentSongs.value.filter(s => !s.vip)
  if (vipFilter.value === 'vip') return currentSongs.value.filter(s => s.vip)
  return currentSongs.value
})

const loadingMore = ref(false)
const chartHasMore = computed(() => !!currentSubList.value?.hasMore)

// "加载更多"：加载当前榜单的下一页并追加到列表
async function loadMore() {
  const list = currentSubList.value
  const platform = activePlatform.value
  if (!list || loadingMore.value || !list.hasMore) return
  loadingMore.value = true
  try {
    const nextPage = (list.page || 1) + 1
    const result = await fetchChartsMore(platform, list.name, nextPage, list.name === 'HOYO-MiX' ? hoyoSort.value : undefined)
    if (result.songs.length) {
      list.page = nextPage
      list.songs = list.songs.concat(result.songs)
      list.hasMore = result.hasMore
    } else {
      list.hasMore = false
    }
  } catch {
    list.hasMore = false
  } finally {
    loadingMore.value = false
  }
}

function switchPlatform(p) {
  activePlatform.value = p
  activeSubList.value = 0
  localStorage.setItem(SUBLIST_KEY, 0)
  vipFilter.value = 'all'
  localStorage.setItem(PLATFORM_STORAGE_KEY, p)
}

async function loadPlatform(platform) {
  loading.value = true
  try {
    const order = platform === 'QQ音乐' ? hoyoSort.value : undefined
    const data = await fetchCharts(platform, 1, order)
    if (data?.length) {
      liveData.value[platform] = data
      // 校验 sublist 范围，避免索引越界
      if (activeSubList.value >= data.length) {
        activeSubList.value = 0
        localStorage.setItem(SUBLIST_KEY, 0)
      }
    }
  } catch (e) {
  } finally {
    loading.value = false
  }
}

watch(activePlatform, (p) => {
  if (!liveData.value[p]) loadPlatform(p)
})

watch(activeSubList, (v) => {
  vipFilter.value = 'all'
  localStorage.setItem(SUBLIST_KEY, v)
})

watch(hoyoSort, (v) => {
  localStorage.setItem(HOYO_SORT_KEY, v)
})

// 路由平台参数变化时（如再次从首页进入）同步切换当前平台
watch(() => route.query.platform, (p) => {
  if (p && platforms.includes(p) && p !== activePlatform.value) {
    switchPlatform(p)
  }
})

onMounted(() => {
  loadPlatform(activePlatform.value)
  // 异步加载已收藏列表，初始化收藏按钮状态
  getFavorites().then(list => { favList.value = list }).catch(() => {})
})

// 收藏状态版本号：点击收藏后 +1 触发 isFav 重算，保证按钮状态实时刷新
const favVersion = ref(0)
// 已收藏歌曲列表（IndexedDB 异步读取，缓存为响应式数组供模板同步判断）
const favList = ref([])
// 每行收藏按钮的动画类（收藏=心动 / 取消=破裂），按歌曲 id 记录
const favAnim = reactive({})
const favAnimTimers = {}

function isFav(songId) {
  favVersion.value // 建立响应式依赖
  return favList.value.some(s => s.id === songId)
}

function favClass(songId) {
  favVersion.value
  const c = { favorited: isFav(songId) }
  const a = favAnim[songId]
  if (a) c[a] = true
  return c
}

async function toggleFav(song) {
  const removing = isFav(song.id)
  if (removing) {
    await removeFavorite(song.id)
  } else {
    await addFavorite(song)
  }
  // 重新从 IndexedDB 拉取收藏列表，保证按钮状态同步
  favList.value = await getFavorites()
  favVersion.value++
  store.touchFavVersion()
  favAnim[song.id] = removing ? 'fav-anim-break' : 'fav-anim-love'
  clearTimeout(favAnimTimers[song.id])
  favAnimTimers[song.id] = setTimeout(() => { favAnim[song.id] = '' }, 800)
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

/* VIP 筛选标签 */
.vip-filter {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  padding-left: 4px;
}

.vip-filter-btn {
  padding: 5px 14px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.vip-filter-btn:hover {
  color: var(--text-secondary);
  border-color: var(--text-muted);
}

.vip-filter-btn.active {
  color: var(--accent-light);
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.08);
}

/* HOYO-MiX 排序按钮 */
.hoyo-sort {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  padding-left: 4px;
}

.hoyo-sort-btn {
  padding: 5px 14px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.hoyo-sort-btn:hover {
  color: var(--text-secondary);
  border-color: var(--text-muted);
}

.hoyo-sort-btn.active {
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
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
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
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
  font-weight: 700;
  margin-left: 6px;
  letter-spacing: 0.5px;
}

.chart-hutao {
  font-size: 12px;
  margin-left: 4px;
  cursor: pointer;
  transition: transform 0.2s;
}

.chart-hutao:hover {
  transform: scale(1.3);
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

.load-more {
  display: block;
  margin: 16px auto 8px;
  padding: 8px 24px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  transition: all 0.2s;
}
.load-more:hover:not(:disabled) { color: var(--text-primary); border-color: var(--text-muted); }
.load-more:disabled { opacity: 0.5; cursor: default; }

/* 手机端（≤767px）：隐藏歌手列节省空间，操作列收窄，按钮同步缩小免得溢出 */
@media (max-width: 767px) {
  .col-artist { display: none; }
  .col-cover { width: 36px; }
  .row-cover { width: 36px; height: 36px; }
  .col-duration { width: 44px; }
  .col-action { width: 92px; gap: 2px; }
  .action-btn { width: 28px; height: 28px; font-size: 13px; }
  .chart-header-row, .chart-row { gap: 8px; padding: 10px 10px; }
}
</style>
