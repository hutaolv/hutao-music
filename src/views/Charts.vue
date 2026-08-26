<template>
  <div class="charts">
    <h1 class="section-title">排行榜</h1>
    <p class="section-subtitle">汇聚各大平台热门歌曲，每日更新</p>

    <!-- 平台选择：图标卡片网格（极淡品牌色底），选中高亮 + 品牌色外发光 -->
    <div class="platform-grid">
      <button v-for="p in platforms" :key="p" class="platform-card" :class="{ active: activePlatform === p, 'is-color': colorPlatforms.has(p) }" :style="{ '--pf-color': platformColors[p] || '#6366f1' }" @click="switchPlatform(p)">
        <img :src="`/icons/platforms/${platformIcons[p]}`" :alt="p" class="platform-icon" />
        <span class="platform-name">{{ p }}</span>
      </button>
    </div>

    <div v-if="sublists.length > 1" class="sublist-tabs" :style="{ '--pf-brand': platformColors[activePlatform] || '#6366f1' }">
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
    <!-- 空状态：黑胶唱片线性插图（带问号）+ 下拉刷新微动效提示，点击可重新加载 -->
    <div v-if="!loading && !currentSongs.length" class="empty-state" @click="retryCurrent">
      <div class="empty-icon">
        <svg viewBox="0 0 96 96" width="88" height="88" fill="none" stroke-linecap="round">
          <!-- 黑胶唱片：外盘 + 唱纹 -->
          <circle cx="48" cy="48" r="40" stroke-width="2" class="vinyl-ring" />
          <circle cx="48" cy="48" r="31" stroke-width="1.2" opacity="0.45" />
          <circle cx="48" cy="48" r="23" stroke-width="1.2" opacity="0.3" />
          <circle cx="48" cy="48" r="13" stroke-width="2" />
          <!-- 唱片中心的问号 -->
          <path d="M43.5 44.5a4.5 4.5 0 1 1 7.2 3.6c-1.7 1.2-2.4 2-2.4 3.6" stroke-width="2.5" class="q-mark" />
          <circle cx="48.3" cy="56" r="1.8" fill="var(--accent-light)" stroke="none" />
        </svg>
      </div>
      <p class="empty-title">暂无榜单数据</p>
      <p class="empty-sub">可能是网络开小差了</p>
      <div class="pull-hint">
        <span class="pull-arrow">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="4" x2="12" y2="18"/><polyline points="6 12 12 18 18 12"/></svg>
        </span>
        点击重新加载
      </div>
    </div>

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
      <span class="col-action"></span>
    </div>

    <div v-if="filteredSongs.length" class="chart-list">
      <div v-for="(song, idx) in filteredSongs" :key="song.id" class="chart-row" @dblclick="store.playSong(song)">
        <span class="col-rank">
          <span class="rank-badge" :class="{ gold: idx === 0, silver: idx === 1, bronze: idx === 2 }">{{ idx + 1 }}</span>
        </span>
        <span class="col-cover">
          <img :src="song.cover" :alt="song.title" class="row-cover" loading="lazy" decoding="async" @error="e => e.target.style.display = 'none'" />
        </span>
          <span class="col-title">
            <span class="row-title">{{ song.title }}</span>
            <div v-if="song.vip" class="meta-row">
              <span class="meta-tag vip">VIP</span>
            </div>
          </span>
        <span class="col-artist">{{ song.artist }}</span>
        <img src="/icons/hutao-search.jpg" class="col-hutao-avatar" :class="{ 'vip-only': !song.vip }" @click.stop="song.vip && goSearch(song.title)" :title="song.vip ? '搜索此歌曲' : ''" />
        <span class="col-duration">{{ song.duration }}</span>
        <span class="col-action">
          <button class="action-btn play-btn reveal-action" @click="store.playSong(song)" title="播放">&#x25B6;</button>
          <button class="action-btn add-btn reveal-action" @click="store.addToPlaylist(song)" title="添加到播放列表">&#x2795;</button>
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

// 平台图标资源映射（public/icons/platforms/）：
// - bilibili/netease：Simple Icons 官方矢量
// - qqmusic/migu：Arcticons 线性矢量（Iconify）
// - douyin/kuwo/kugou：官网抓取的满幅彩色应用图标（无公开矢量源）
const platformIcons = {
  '抖音': 'douyin.png',
  'QQ音乐': 'qqmusic.svg',
  '网易云音乐': 'netease.svg',
  'B站': 'bilibili.svg',
  '咪咕音乐': 'migu.svg',
  '酷我音乐': 'kuwo.png',
  '酷狗音乐': 'kugou.svg'
}

// 彩色图标集合：酷我的图标是满幅彩色磁贴（各矢量库均无其SVG），不能套白色剪影滤镜，
// 改为原生应用图标样式展示；酷狗已找到 SVG（worldvectorlogo），归入白色剪影组
const colorPlatforms = new Set(['酷我音乐'])

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
const loadedSublists = ref({})
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
  loadedSublists.value['QQ音乐'] = {}
  loadPlatform(activePlatform.value, 0)
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

// 空状态重试：清空当前平台缓存数据并强制重新拉取。
// 若重置后的子列表索引为0（watch不会触发），此处需手动补一次加载
function retryCurrent() {
  vipFilter.value = 'all'
  const idx = activeSubList.value
  liveData.value[activePlatform.value] = null
  loadedSublists.value[activePlatform.value] = {}
  activeSubList.value = 0
  if (idx === 0) loadPlatform(activePlatform.value, 0)
}

async function loadPlatform(platform, sublistIndex = 0) {
  loading.value = true
  try {
    const order = platform === 'QQ音乐' ? hoyoSort.value : undefined
    const data = await fetchCharts(platform, 1, order, sublistIndex)
    if (data?.length) {
      liveData.value[platform] = data
      if (!loadedSublists.value[platform]) loadedSublists.value[platform] = {}
      loadedSublists.value[platform][sublistIndex] = true
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
  if (!liveData.value[p]) loadPlatform(p, activeSubList.value)
})

async function loadSublistIfNeeded(platform, index) {
  if (loadedSublists.value[platform]?.[index]) return
  loading.value = true
  try {
    const order = platform === 'QQ音乐' ? hoyoSort.value : undefined
    const data = await fetchCharts(platform, 1, order, index)
    if (data?.[index]?.songs) {
      if (liveData.value[platform]?.[index]) {
        liveData.value[platform][index].songs = data[index].songs
        liveData.value[platform][index].hasMore = data[index].hasMore || false
      }
      if (!loadedSublists.value[platform]) loadedSublists.value[platform] = {}
      loadedSublists.value[platform][index] = true
    }
  } catch (e) {
  } finally {
    loading.value = false
  }
}

watch(activeSubList, (v) => {
  vipFilter.value = 'all'
  localStorage.setItem(SUBLIST_KEY, v)
  loadSublistIfNeeded(activePlatform.value, v)
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
  loadPlatform(activePlatform.value, activeSubList.value)
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
/* ===== Platform icon cards ===== */
.platform-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}

.platform-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px 11px;
  border-radius: 14px;
  /* 极淡品牌色底：与深色主题融合，品牌感由底色传递 */
  background: color-mix(in srgb, var(--pf-color) 9%, transparent);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .platform-card:hover {
    background: color-mix(in srgb, var(--pf-color) 16%, transparent);
    transform: translateY(-2px);
  }
}

.platform-icon {
  width: 30px;
  height: 30px;
  object-fit: contain;
  /* 白色剪影滤镜：矢量/单色源统一成白色，品牌感由卡片底色传递 */
  filter: brightness(0) invert(1);
  opacity: 0.92;
}

/* 彩色应用图标（酷我/酷狗）：跳过滤镜，按原生图标样式展示 */
.platform-icon.is-color {
  filter: none;
  opacity: 1;
  border-radius: 22%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

.platform-name {
  font-size: 12px;
  color: var(--text-secondary);
  transition: color 0.25s;
}

/* 选中态：实心品牌色 + 白字白图标 + 微弱品牌色外发光 */
.platform-card.active {
  background: var(--pf-color);
  border-color: transparent;
  box-shadow: 0 4px 22px color-mix(in srgb, var(--pf-color) 38%, transparent);
}
.platform-card.active .platform-icon { filter: brightness(0) invert(1); opacity: 1; }
.platform-card.active .platform-name { color: #fff; font-weight: 600; }

/* 选中态的彩色图标：垫白色小圆角底，避免与同色系实心背景融为一体。
   注意必须同时恢复 filter:none——上面的 active 规则（三层选择器）优先级更高，
   会把 invert 滤镜强加回来，导致彩色图标变白块 */
.platform-card.active .platform-icon.is-color {
  filter: none;
  background: #fff;
  padding: 3px;
  box-shadow: none;
}

/* ===== Sublist / filter / sort pill tabs ===== */
.sublist-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  padding-left: 4px;
}

.sublist-tab {
  padding: 6px 16px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 500;
  /* 未选中：深灰底白字（无边框），视觉更轻 */
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid transparent;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .sublist-tab:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }
}
/* 选中：当前平台品牌色实心高亮 */
.sublist-tab.active {
  color: #fff;
  border-color: transparent;
  background: var(--pf-brand);
  font-weight: 600;
}

/* ===== VIP filter ===== */
.vip-filter {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  padding-left: 4px;
}

.vip-filter-btn {
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-color);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .vip-filter-btn:hover {
    color: var(--text-secondary);
    border-color: var(--text-muted);
    background: rgba(255, 255, 255, 0.03);
  }
}
.vip-filter-btn.active {
  color: var(--accent-light);
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.08);
}

/* ===== HOYO-MiX sort ===== */
.hoyo-sort {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  padding-left: 4px;
}

.hoyo-sort-btn {
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-color);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .hoyo-sort-btn:hover {
    color: var(--text-secondary);
    border-color: var(--text-muted);
    background: rgba(255, 255, 255, 0.03);
  }
}
.hoyo-sort-btn.active {
  color: var(--accent-light);
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.08);
}

/* ===== Chart rows ===== */
.chart-header-row, .chart-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  font-size: 13px;
}

/* ===== Toolbar ===== */
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
  background: rgba(255, 255, 255, 0.06);
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .play-all-btn:hover { opacity: 0.85; }
}
.play-all-btn:active { transform: scale(0.92); }
.play-all-btn.playing { animation: playall-pop 0.3s ease; }

@keyframes playall-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

/* ===== Header row — no border, just subtle text ===== */
.chart-header-row {
  color: var(--text-muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.6;
}

/* ===== Song rows — no border dividers, spacing-based separation ===== */
.chart-row {
  border-radius: var(--radius-sm);
  cursor: default;
  transition: background 0.2s;
}
@media (hover: hover) {
  .chart-row:hover {
    background: rgba(255, 255, 255, 0.03);
  }
}

.col-rank { width: 36px; text-align: center; flex-shrink: 0; }
.col-cover { width: 44px; flex-shrink: 0; }
.col-title { flex: 1; min-width: 0; }
.col-artist { width: 140px; color: var(--text-secondary); flex-shrink: 0; }
.col-duration { width: 60px; color: var(--text-muted); text-align: right; flex-shrink: 0; }
.col-action { width: 100px; display: flex; gap: 2px; flex-shrink: 0; justify-content: flex-end; }

/* ===== Rank badges — metallic gradient text ===== */
.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.15);
  background: transparent;
}

.rank-badge.gold {
  background: linear-gradient(135deg, rgba(251,191,36,0.18), rgba(245,158,11,0.06));
  color: #fbbf24;
}
.rank-badge.silver {
  background: linear-gradient(135deg, rgba(203,213,225,0.14), rgba(148,163,184,0.05));
  color: #cbd5e1;
}
.rank-badge.bronze {
  background: linear-gradient(135deg, rgba(245,158,11,0.14), rgba(217,119,6,0.05));
  color: #f59e0b;
}

.row-cover {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .chart-row:hover .row-cover { transform: scale(1.05); }
}

.row-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.col-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
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

.col-hutao-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.5;
  transition: all 0.2s;
  object-fit: cover;
}
.col-hutao-avatar.vip-only {
  opacity: 0;
  pointer-events: none;
}
@media (hover: hover) {
  .col-hutao-avatar:hover:not(.vip-only) { opacity: 1; transform: scale(1.15); }
}

/* ===== Action buttons ===== */
.action-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 13px;
  color: var(--text-muted);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Hover-reveal: play + add hidden by default, slide in on row hover */
.reveal-action {
  opacity: 0;
  transform: translateX(6px);
}
@media (hover: hover) {
  .chart-row:hover .reveal-action {
    opacity: 1;
    transform: translateX(0);
  }
}
.action-btn:active {
  transform: scale(0.8) !important;
  transition-duration: 0.1s;
}

.play-btn:hover { color: var(--accent-light); }
.add-btn:hover { color: #10b981; }

.fav-btn {
  color: var(--text-muted);
  opacity: 0;
  transform: translateX(6px);
}
@media (hover: hover) {
  .chart-row:hover .fav-btn {
    opacity: 1;
    transform: translateX(0);
  }
}
.fav-btn:hover { color: #ef4444; }
.fav-btn.favorited {
  color: #ef4444;
  opacity: 1;
  transform: translateX(0);
}

/* Touch: always show buttons */
@media (hover: none) {
  .reveal-action, .fav-btn {
    opacity: 1;
    transform: translateX(0);
  }
}

/* ===== 空状态：黑胶唱片插图 + 重试引导 ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 56px 24px;
  cursor: pointer;
}
.empty-state:active .empty-icon { transform: scale(0.97); }

.empty-icon {
  width: 104px;
  height: 104px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  /* 中性微光底座，衬托黑胶插图 */
  background: radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.06), transparent 68%);
  margin-bottom: 18px;
  transition: transform 0.2s;
}

/* 唱片外环用中性色，问号用品牌亮色点睛 */
.empty-icon svg { stroke: var(--text-muted); }
.empty-icon .q-mark { stroke: var(--accent-light); }

.empty-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.empty-sub {
  font-size: 12px;
  color: var(--text-muted);
}

/* 下拉刷新微动效提示：箭头循环下坠，暗示"刷新"动作 */
.pull-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 7px 16px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.05);
  font-size: 12px;
  color: var(--text-muted);
}
.pull-arrow {
  display: inline-flex;
  color: var(--accent-light);
}
@media (prefers-reduced-motion: no-preference) {
  .pull-arrow { animation: pull-bounce 1.5s ease-in-out infinite; }
}
@keyframes pull-bounce {
  0%, 100% { transform: translateY(-2px); opacity: 0.6; }
  50% { transform: translateY(3px); opacity: 1; }
}

.load-more {
  display: block;
  margin: 16px auto 8px;
  padding: 8px 24px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .load-more:hover:not(:disabled) { color: var(--text-primary); border-color: var(--text-muted); }
}
.load-more:disabled { opacity: 0.5; cursor: default; }

/* ===== Mobile ===== */
@media (max-width: 767px) {
  /* 平台卡片：两行四列网格（7平台=4+3），图标与间距适配小屏 */
  .platform-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 14px;
  }
  .platform-card {
    padding: 11px 4px 9px;
    gap: 6px;
    border-radius: 12px;
  }
  .platform-icon { width: 26px; height: 26px; }
  .platform-name { font-size: 11px; }

  /* 榜单分类胶囊：横向滚动单行，不换行不挤压 */
  .sublist-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 6px;
    margin-bottom: 14px;
    padding-left: 0;
    padding-bottom: 4px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .sublist-tabs::-webkit-scrollbar { display: none; }
  .sublist-tab {
    flex-shrink: 0;
    font-size: 12px;
    padding: 8px 14px;   /* 含边框高约34px，配合外扩热区≥44px */
    position: relative;
  }
  .sublist-tab::after {
    content: '';
    position: absolute;
    inset: -5px -4px;    /* 向外扩展触控热区 */
  }

  .col-artist { display: none; }
  .col-hutao-avatar { display: none; }
  .col-cover { width: 36px; }
  .row-cover { width: 36px; height: 36px; border-radius: 10px; }
  .col-duration { width: 44px; }
  .col-action { width: 88px; gap: 2px; }
  .action-btn { width: 28px; height: 28px; font-size: 12px; }
  .chart-header-row, .chart-row { gap: 8px; padding: 10px 10px; }
  /* Touch: always show buttons */
  .reveal-action, .fav-btn { opacity: 1; transform: translateX(0); }
}
</style>
