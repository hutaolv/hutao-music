<template>
  <div class="search-page">
    <h1 class="section-title">搜索</h1>

    <div class="search-box">
      <input v-model="keyword" type="text" placeholder="输入歌曲或歌手名称..." class="search-input" @input="onInput" @keydown.enter="doSearch" />
      <button class="search-submit" @click="doSearch">&#x1F50D;</button>
    </div>

    <div class="platform-filters">
      <span class="filter-label">平台：</span>
      <span v-for="p in allPlatforms" :key="p"
        class="platform-filter"
        :class="{ active: selectedPlatform === p && !useThirdParty }"
        :style="{ '--pf-color': platformColors[p] || '#6366f1' }"
        @click="selectPlatform(p)">{{ p }}</span>
      <span class="filter-divider">|</span>
      <span class="platform-filter hutao-search"
        :class="{ active: useThirdParty }"
        @click="toggleThirdParty">&#x1F335; 胡桃搜</span>
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
        <p class="no-result">输入关键词开始搜索</p>
      </div>

      <div v-if="keyword" class="section">
        <div v-if="filteredSongs.length" class="song-toolbar">
          <h3 class="section-title" style="font-size:18px;margin:0;">歌曲结果 ({{ filteredSongs.length }})</h3>
          <button v-if="filteredSongs.length" class="play-all-btn" :class="{ playing: playingAll }" @click="playAllFx">&#x25B6; 播放全部</button>
        </div>
        <HutaoLoading v-if="loading" text="胡桃正在全力搜索中" />
        <div v-if="filteredSongs.length" class="result-list">
          <SongCard v-for="song in filteredSongs" :key="song.id" :song="song" :show-actions="true" @play="store.playSong" @add="store.addToPlaylist" />
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
const allPlatforms = platforms
let debounceTimer = null

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
  if (keyword.value.trim()) doSearch()
}

// 切换胡桃搜开关：启用时使用第三方 API 搜索，关闭时使用官方 API 搜索
function toggleThirdParty() {
  useThirdParty.value = !useThirdParty.value
  if (keyword.value.trim()) doSearch()
}

function selectScope(scope) {
  if (selectedScope.value === scope) return
  selectedScope.value = scope
  localStorage.setItem(SEARCH_SCOPE_STORAGE_KEY, scope)
  if (keyword.value.trim()) doSearch()
}

// 播放全部并触发按钮弹跳动画
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
    router.replace({ query: { q: kw } })
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
  router.replace({ query: { q: kw } })
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
  background: var(--bg-card);
  border-radius: 24px;
  border: 1px solid var(--border-color);
  padding: 0 4px 0 20px;
  transition: border-color 0.2s;
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

.search-submit:hover { background: var(--bg-hover); color: var(--accent-light); }

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
  border-radius: 14px;
  background: var(--bg-card);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.filter-divider {
  color: var(--text-muted);
  margin: 0 4px;
  opacity: 0.4;
}

.platform-filter:hover { border-color: var(--pf-color); color: var(--pf-color); }

.hutao-search {
  --pf-color: #10b981;
}

.hutao-search.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border-color: transparent;
}

.platform-filter.active {
  background: color-mix(in srgb, var(--pf-color) 20%, transparent);
  border-color: var(--pf-color);
  color: var(--pf-color);
  font-weight: 600;
}

.section { margin-bottom: 32px; }

.history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-tag {
  padding: 8px 16px;
  border-radius: 16px;
  font-size: 13px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border-color);
}

.history-tag:hover {
  color: var(--accent-light);
  border-color: var(--accent);
}

.clear-history {
  padding: 8px 16px;
  font-size: 13px;
  color: var(--text-muted);
  transition: color 0.2s;
}

.clear-history:hover { color: #ef4444; }

.result-list {
  background: var(--bg-card);
  border-radius: var(--radius);
  overflow: hidden;
}

.no-result {
  padding: 24px 0;
  color: var(--text-muted);
  font-size: 14px;
}

.load-more {
  display: block;
  margin: 16px auto 0;
  padding: 8px 28px;
  border-radius: 18px;
  font-size: 13px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.load-more:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-light); }

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
  color: #fff;
  background: var(--accent-light);
  padding: 6px 12px;
  border-radius: 999px;
  transition: opacity 0.2s, transform 0.2s;
}

.play-all-btn:hover { opacity: 0.85; }

.play-all-btn:active { transform: scale(0.9); }
.play-all-btn.playing { animation: playall-pop 0.3s ease; }

@keyframes playall-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.08); }
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
  transition: background 0.2s;
}

.artist-result-item:hover { background: var(--bg-hover); }

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
</style>
