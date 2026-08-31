<template>
  <div class="search-page">
    <h1 class="section-title">搜索</h1>

    <div class="search-box glass-card">
      <input v-model="keyword" type="text" placeholder="输入歌曲或歌手名称..." class="search-input" @input="onInput" @keydown.enter="doSearch" />
      <button v-if="keyword" class="search-clear" @click="keyword = ''; allSongs = []; artistResults = []" title="清空">&#x2715;</button>
      <button class="search-submit" @click="doSearch">&#x1F50D;</button>
    </div>

    <div class="platform-filters">
      <span class="filter-label">平台：</span>
      <span v-for="p in allPlatforms" :key="p"
        class="platform-filter"
        :class="{ active: selectedPlatform === p && !useThirdParty }"
        :style="{ '--pf-color': platformColors[p] || '#6366f1' }"
        @click="selectPlatform(p)">
        <img :src="`/icons/platforms/${platformIcons[p]}`" :alt="p" class="pf-icon" :class="{ 'is-color': colorPlatforms.has(p) }" />
        {{ platformDisplayName[p] || p }}
      </span>
      <span class="filter-divider">|</span>
      <span class="platform-filter hutao-search"
        :class="{ active: useThirdParty }"
        @click="toggleThirdParty">
        <img src="/icons/hutaoico.png" alt="胡桃" class="pf-icon pf-icon-hutao" />
        胡桃
      </span>
    </div>

    <div v-if="selectedPlatform === 'B站'" class="scope-filters">
      <span class="filter-label">范围：</span>
      <span class="platform-filter" :class="{ active: selectedScope === 'music' }" @click="selectScope('music')">音乐分区</span>
      <span class="platform-filter" :class="{ active: selectedScope === 'all' }" @click="selectScope('all')">全站</span>
    </div>

    <div class="search-content">
      <div v-if="!keyword && searchHistory.length" class="section">
        <h3 class="section-title" style="font-size:18px;">搜索历史</h3>
        <div class="history-tags">
          <span v-for="kw in searchHistory" :key="kw" class="history-tag" @click="clickHistory(kw)">{{ kw }}</span>
          <button class="clear-history" @click="clearHistory">清除</button>
        </div>
      </div>

      <div v-if="!keyword && !searchHistory.length" class="section">
        <!-- 空状态：居中视觉引导（放大镜内嵌音符的线性图标 + 发光渐变），替代纯文字提示 -->
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 64 64" width="72" height="72" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <!-- 放大镜镜框 -->
              <circle cx="28" cy="28" r="18" stroke-width="2.5" />
              <!-- 镜框内的音符（符干+符头+符尾旗） -->
              <path d="M26 35 V21 l8 -2.5 V33" stroke-width="2.5" />
              <ellipse cx="23.5" cy="35.5" rx="3" ry="2.4" stroke-width="1.8" />
              <ellipse cx="31.5" cy="33.5" rx="3" ry="2.4" stroke-width="1.8" />
              <!-- 放大镜手柄 -->
              <line x1="42" y1="42" x2="54" y2="54" stroke-width="3.5" />
            </svg>
          </div>
          <p class="empty-title">搜索全网音乐，发现你的宝藏歌单</p>
          <p class="empty-sub">支持 QQ · 网易云 · B站 · 抖音 等七大平台，还可开启「胡桃」聚合查找</p>
        </div>
      </div>

      <div v-if="keyword" class="section">
        <div v-if="filteredSongs.length" class="song-toolbar">
          <h3 class="section-title" style="font-size:18px;margin:0;">歌曲结果 ({{ filteredSongs.length }})</h3>
          <button v-if="filteredSongs.length" class="play-all-btn" :class="{ playing: playingAll }" @click="playAllFx">&#x25B6; 播放全部</button>
        </div>
        <HutaoLoading v-if="loading" text="胡桃正在全力搜索中" />
        <div v-if="filteredSongs.length" class="result-list">
          <SongCard v-for="song in filteredSongs" :key="song.id" :song="song" :show-actions="true" :show-play="true" @play="store.playSong" @add="store.addToPlaylist" @hutao-search="onHutaoSearch" />
        </div>
        <p v-if="!loading && !filteredSongs.length" class="no-result">未找到相关歌曲</p>
        <button v-if="hasMore" class="load-more" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? '加载中...' : '加载更多' }}
        </button>
      </div>

      <div v-if="keyword" class="section">
        <h3 class="section-title" style="font-size:18px;">歌手结果 ({{ artistResults.length }})</h3>
        <div v-if="artistResults.length" class="artist-result-grid">
          <!-- 跳转歌手详情时把歌手名放进 query，供 B站/抖音/咪咕等平台按名字搜索其歌曲 -->
          <div v-for="artist in artistResults" :key="artist.id" class="artist-result-item" @click="router.push({ path: `/artist/${artist.id}`, query: { name: artist.name } })">
            <img :src="artist.avatar" :alt="artist.name" class="artist-avatar" @error="e => e.target.style.display = 'none'" />
            <div class="artist-info">
              <div class="artist-name">{{ artist.name }}</div>
              <!-- 有粉丝/单曲数据时展示数量（只显示有值的），否则退回地区/流派 -->
              <div class="artist-meta">
                <template v-if="artist.fans > 0 || artist.songCount > 0">
                  <span v-if="artist.fans > 0">粉丝 {{ formatNum(artist.fans) }}</span>
                  <span v-if="artist.fans > 0 && artist.songCount > 0">&middot;</span>
                  <span v-if="artist.songCount > 0">单曲 {{ formatNum(artist.songCount) }}</span>
                </template>
                <template v-else>{{ artist.region }} &middot; {{ artist.genre }}</template>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="no-result">未找到相关歌手</p>
      </div>
    </div>
  </div>
</template>

<script>
// 搜索结果缓存（普通 script 块，模块级共享，组件销毁重建后仍保留）
const searchCache = new Map()
</script>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { searchAll as apiSearchAll, thirdPartySearch } from '../services/api'
import { getSearchHistory, addSearchHistory, clearSearchHistory } from '../utils/storage'
import { platforms, platformColors } from '../data/platforms'
import SongCard from '../components/SongCard.vue'
import HutaoLoading from '../components/HutaoLoading.vue'

// 平台图标映射（复用排行榜的 public/icons/platforms/ 资源）：
// - bilibili/netease：Simple Icons 官方矢量
// - qqmusic/migu：Arcticons 线性矢量
// - douyin/kuwo/kugou：官网抓取的满幅彩色应用图标
const platformIcons = {
  '抖音': 'douyin.png',
  'QQ音乐': 'qqmusic.svg',
  '网易云音乐': 'netease.svg',
  'B站': 'bilibili.svg',
  '咪咕音乐': 'migu.svg',
  '酷我音乐': 'kuwo.png',
  '酷狗音乐': 'kugou.svg'
}

// 彩色图标集合：酷我的图标是满幅彩色磁贴，不能套白色剪影滤镜，改为原生应用图标样式展示
const colorPlatforms = new Set(['酷我音乐'])

// 搜索页平台简称映射：去除"音乐"后缀，精简胶囊文字占用
const platformDisplayName = {
  'QQ音乐': 'QQ',
  '网易云音乐': '网易云',
  'B站': 'B站',
  '咪咕音乐': '咪咕',
  '酷我音乐': '酷我',
  '酷狗音乐': '酷狗',
  '抖音': '抖音'
}

const router = useRouter()
const route = useRoute()
const store = usePlayerStore()

const keyword = ref('')
const allSongs = ref([])
const artistResults = ref([])
const searchHistory = ref([])
const SEARCH_PLATFORM_STORAGE_KEY = 'hutao:search-platform'
const lastSearchPlatform = localStorage.getItem(SEARCH_PLATFORM_STORAGE_KEY)
// 恢复上次选中的平台，避免从歌词页等返回时被重置为默认
const selectedPlatform = ref(lastSearchPlatform && platforms.includes(lastSearchPlatform) ? lastSearchPlatform : '网易云音乐')
// 胡桃搜开关：启用时使用第三方 API 搜索，关闭时使用官方 API 搜索
const useThirdParty = ref(false)
const SEARCH_SCOPE_STORAGE_KEY = 'hutao:search-scope'
const lastSearchScope = localStorage.getItem(SEARCH_SCOPE_STORAGE_KEY)
const selectedScope = ref(lastSearchScope === 'music' || lastSearchScope === 'all' ? lastSearchScope : 'music') // B站搜索范围：music=音乐分区，all=全站+增强过滤
const page = ref(1) // 当前搜索页码（B站分页）
const hasMore = ref(false) // 是否还有下一页
const loadingMore = ref(false)
const loading = ref(false) // 搜索请求进行中，展示胡桃加载动画
const playingAll = ref(false)
const allPlatforms = platforms.filter(p => p !== '抖音')
let debounceTimer = null

function updateRouteQuery() {
  const kw = keyword.value.trim()
  if (kw) {
    router.replace({ query: { q: kw, platform: selectedPlatform.value, ...(useThirdParty.value ? { thirdparty: '1' } : {}) } })
  }
}

const filteredSongs = computed(() => {
  return allSongs.value.filter(s => s.platform === selectedPlatform.value)
})

// 数字格式化：1.2万 / 3.5亿，用于展示粉丝数和单曲数
function formatNum(n) {
  const num = Number(n) || 0
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return String(num)
}

function selectPlatform(p) {
  if (selectedPlatform.value === p && !useThirdParty.value) return
  selectedPlatform.value = p
  useThirdParty.value = false
  localStorage.setItem(SEARCH_PLATFORM_STORAGE_KEY, p)
  updateRouteQuery()
  if (keyword.value.trim()) doSearch()
}

// 切换胡桃搜开关：启用时使用第三方 API 搜索，关闭时使用官方 API 搜索
function toggleThirdParty() {
  useThirdParty.value = !useThirdParty.value
  updateRouteQuery()
  if (keyword.value.trim()) doSearch()
}

function selectScope(scope) {
  if (selectedScope.value === scope) return
  selectedScope.value = scope
  localStorage.setItem(SEARCH_SCOPE_STORAGE_KEY, scope)
  if (keyword.value.trim()) doSearch()
}

// 播放全部并触发按钮弹跳动画
// VIP 歌曲封面点击：跳转胡桃搜页面搜索该歌曲
function onHutaoSearch(song) {
  if (!song) return
  keyword.value = song.title
  useThirdParty.value = true
  doSearch()
}

function playAllFx() {
  const songs = filteredSongs.value
  if (!songs.length) return
  playingAll.value = true
  store.playAll(songs)
  setTimeout(() => { playingAll.value = false }, 350)
}

function onInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    doSearch()
  }, 300)
}

async function doSearch() {
  const kw = keyword.value.trim()
  if (!kw) {
    allSongs.value = []
    artistResults.value = []
    return
  }
  addSearchHistory(kw)
  searchHistory.value = getSearchHistory()

  // 构造缓存 key，相同关键词+平台+范围直接复用
  const cacheKey = `${kw}|${selectedPlatform.value}|${useThirdParty.value ? '3rd' : (selectedPlatform.value === 'B站' ? selectedScope.value : '')}`
  const cached = searchCache.get(cacheKey)
  if (cached) {
    allSongs.value = cached.songs
    artistResults.value = cached.artists
    hasMore.value = cached.hasMore
    router.replace({ query: { q: kw, platform: selectedPlatform.value, ...(useThirdParty.value ? { thirdparty: '1' } : {}) } })
    return
  }

  try {
    loading.value = true
    if (useThirdParty.value) {
      // 胡桃搜：第三方 API 搜索
      const apiData = await thirdPartySearch(kw, selectedPlatform.value)
      allSongs.value = apiData?.songs || []
      artistResults.value = []
      hasMore.value = false
    } else {
      // 官方 API 搜索
      const scope = selectedPlatform.value === 'B站' ? selectedScope.value : undefined
      const apiData = await apiSearchAll(kw, selectedPlatform.value, scope, 1)
      allSongs.value = apiData?.songs || []
      artistResults.value = apiData?.artists || []
      hasMore.value = !!apiData?.hasMore
    }
    page.value = 1
    // 写入缓存
    searchCache.set(cacheKey, { songs: allSongs.value, artists: artistResults.value, hasMore: hasMore.value })
  } catch {
    allSongs.value = []
    artistResults.value = []
    hasMore.value = false
  } finally {
    loading.value = false
  }
  router.replace({ query: { q: kw, platform: selectedPlatform.value, ...(useThirdParty.value ? { thirdparty: '1' } : {}) } })
}

// B站"加载更多"：翻一页追加到结果列表
async function loadMore() {
  const kw = keyword.value.trim()
  if (!kw || loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const scope = selectedPlatform.value === 'B站' ? selectedScope.value : undefined
    const apiData = await apiSearchAll(kw, selectedPlatform.value, scope, page.value + 1)
    const songs = apiData?.songs || []
    if (songs.length) {
      page.value += 1
      allSongs.value = allSongs.value.concat(songs)
    }
    hasMore.value = !!apiData?.hasMore
  } catch {
    hasMore.value = false
  }
  loadingMore.value = false
}

function clickHistory(kw) {
  keyword.value = kw
  doSearch()
}

function clearHistory() {
  clearSearchHistory()
  searchHistory.value = []
}

onMounted(() => {
  searchHistory.value = getSearchHistory()
  if (route.query.q) {
    keyword.value = route.query.q
    // 从排行榜跳转过来时携带平台参数，自动切换到对应平台并启用胡桃搜
    if (route.query.platform && platforms.includes(route.query.platform)) {
      selectedPlatform.value = route.query.platform
      useThirdParty.value = true
    }
    // 恢复胡桃搜状态（路由返回时保持）
    if (route.query.thirdparty === '1') {
      useThirdParty.value = true
    }
    doSearch()
  }
})
</script>

<style scoped>
.search-box {
  display: flex;
  align-items: center;
  max-width: 600px;
  margin-bottom: 16px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-color);
  padding: 0 4px 0 20px;
  transition: border-color 0.25s;
}

.search-box:focus-within { border-color: var(--accent); }

.search-input {
  flex: 1;
  height: 48px;
  font-size: 16px;
  color: var(--text-primary);
}

.search-input::placeholder { color: var(--text-muted); }

.search-submit {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.2s;
}
.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: all 0.2s;
}
.search-clear:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
@media (hover: hover) {
  .search-submit:hover { background: var(--bg-hover); color: var(--accent-light); }
}

.platform-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.scope-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -12px 0 24px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 13px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.platform-filter {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* 平台图标：默认白色剪影（矢量源统一），品牌色由胶囊背景传递 */
.pf-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  filter: brightness(0) invert(1);
  opacity: 0.88;
  flex-shrink: 0;
}

/* 彩色应用图标（酷我）：跳过剪影滤镜，保留原生配色。
   选择器加父级前缀提升特异性，确保覆盖基础 .pf-icon 的 invert 滤镜 */
.platform-filter .pf-icon.is-color {
  filter: none;
  opacity: 1;
  border-radius: 20%;
}

/* 胡桃搜图标：圆形头像，始终原色展示 */
.pf-icon-hutao {
  filter: none;
  opacity: 1;
  border-radius: 50%;
  width: 17px;
  height: 17px;
}
@media (hover: hover) {
  .platform-filter:hover { border-color: var(--pf-color); color: var(--pf-color); }
}

.filter-divider {
  color: var(--text-muted);
  margin: 0 4px;
  opacity: 0.4;
}

.hutao-search {
  --pf-color: #dc2626;
}

.hutao-search.active {
  background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
  color: white;
  border-color: transparent;
}

/* 选中态改为高饱和实心背景 + 白字：与未选中的低透明度灰底形成强对比 */
.platform-filter.active {
  background: var(--pf-color);
  border-color: transparent;
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 14px color-mix(in srgb, var(--pf-color) 40%, transparent);
}

.section { margin-bottom: 32px; }

.history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-tag {
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid var(--border-color);
}
@media (hover: hover) {
  .history-tag:hover {
    color: var(--accent-light);
    border-color: var(--accent);
    background: rgba(99, 102, 241, 0.06);
  }
}

.clear-history {
  padding: 8px 16px;
  font-size: 13px;
  color: var(--text-muted);
  transition: color 0.2s;
}
@media (hover: hover) {
  .clear-history:hover { color: #ef4444; }
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.no-result {
  padding: 24px 0;
  color: var(--text-muted);
  font-size: 14px;
}

/* ===== 空状态：居中视觉引导（放大镜内嵌音符线性图标 + 品牌色辉光）===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 56px 24px;
}

.empty-icon {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 品牌色径向辉光：中心淡紫光晕向外消散，衬托半透明线性图标 */
  background: radial-gradient(circle at 50% 38%, rgba(129, 140, 248, 0.16), transparent 68%);
  margin-bottom: 22px;
}

.empty-icon svg {
  stroke: var(--accent-light);
  opacity: 0.78;
  filter: drop-shadow(0 0 14px rgba(129, 140, 248, 0.35));
}

.empty-title {
  font-size: 15px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.empty-sub {
  font-size: 12px;
  color: var(--text-muted);
  max-width: 300px;
  line-height: 1.9;
}

.load-more {
  display: block;
  margin: 16px auto 0;
  padding: 8px 28px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .load-more:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-light); }
}
.load-more:disabled { opacity: 0.5; cursor: default; }

.song-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

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

.artist-result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.artist-result-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px;
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
  border-left: 2px solid transparent;
}
@media (hover: hover) {
  .artist-result-item:hover {
    background: var(--bg-hover);
    border-left-color: var(--accent);
  }
}

.artist-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.artist-info { flex: 1; min-width: 0; }

.artist-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.artist-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

@media (max-width: 767px) {
  /* 手机端隐藏页面大标题"搜索"——搜索框本身就是身份标识，为首屏让位 */
  .search-page > .section-title {
    display: none;
  }

  /* 搜索框紧凑化：高度压到44px（满足最小触控），上下留白收紧 */
  .search-box {
    margin-bottom: 10px;
    padding: 0 4px 0 16px;
  }
  .search-input {
    height: 44px;
    font-size: 15px;
  }
  .search-submit {
    width: 40px;
    height: 40px;
    font-size: 15px;
  }
  .search-clear {
    width: 32px;
    height: 32px;
    font-size: 12px;
  }

  /* 平台筛选：自动换行显示全部平台，隐藏"平台："前缀标签节省空间 */
  .platform-filters {
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }
  .platform-filters .filter-label { display: none; }

  /* 胶囊触控目标：视觉高40px，配合负边距热区扩展实际命中约46px（≥44px规范） */
  .platform-filter {
    flex-shrink: 0;
    font-size: 13px;
    min-height: 40px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    position: relative;
  }
  .platform-filter::after {
    content: '';
    position: absolute;
    inset: -3px -5px;   /* 向外扩展触控热区，不影响视觉尺寸 */
  }
  /* 手机端图标微缩适配小屏胶囊 */
  .pf-icon { width: 15px; height: 15px; }
  .pf-icon-hutao { width: 16px; height: 16px; }

  /* B站范围筛选同步横向滚动 */
  .scope-filters {
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 8px;
    margin: -6px 0 16px;
    scrollbar-width: none;
  }
  .scope-filters::-webkit-scrollbar { display: none; }
  .scope-filters .filter-label { display: none; }
  .scope-filters .platform-filter {
    flex-shrink: 0;
    min-height: 36px;
  }

  /* 空状态：占满更多纵向空间，图标微缩适配小屏 */
  .empty-state { padding: 72px 20px; }
  .empty-icon { width: 96px; height: 96px; }
  .empty-icon svg { width: 58px; height: 58px; }
  .empty-title { font-size: 14px; }
  .empty-sub { font-size: 11px; }

  .section { margin-bottom: 24px; }
  .history-tags { gap: 6px; }
  .history-tag {
    padding: 10px 14px;
    font-size: 12px;
  }
  .clear-history {
    padding: 10px 12px;
    font-size: 12px;
  }
  .song-toolbar {
    flex-wrap: wrap;
    gap: 8px;
  }
  .artist-result-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }
  .artist-result-item {
    gap: 10px;
    padding: 10px;
  }
  .artist-avatar {
    width: 44px;
    height: 44px;
  }
  .artist-name { font-size: 14px; }
  .load-more {
    padding: 8px 20px;
    font-size: 12px;
  }
}
</style>
