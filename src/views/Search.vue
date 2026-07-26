<template>
  <div class="search-page">
    <h1 class="section-title">搜索</h1>

    <div class="search-box">
      <input v-model="keyword" type="text" placeholder="输入歌曲或歌手名称..." class="search-input" @input="onInput" @keydown.enter="doSearch" />
      <button class="search-submit" @click="doSearch">&#x1F50D;</button>
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
        <h3 class="section-title" style="font-size:18px;">热门搜索</h3>
        <div class="hot-tags">
          <span v-for="tag in hotSearchTags" :key="tag" class="hot-tag" @click="clickHistory(tag)">{{ tag }}</span>
        </div>
      </div>

      <div v-if="keyword" class="section">
        <h3 class="section-title" style="font-size:18px;">歌曲结果 ({{ songResults.length }})</h3>
        <div v-if="songResults.length" class="result-list">
          <SongCard v-for="song in songResults" :key="song.id" :song="song" @play="store.playSong" />
        </div>
        <p v-else class="no-result">未找到相关歌曲</p>
      </div>

      <div v-if="keyword" class="section">
        <h3 class="section-title" style="font-size:18px;">歌手结果 ({{ artistResults.length }})</h3>
        <div v-if="artistResults.length" class="artist-result-grid">
          <div v-for="artist in artistResults" :key="artist.id" class="artist-result-item" @click="router.push(`/artist/${artist.id}`)">
            <img :src="artist.avatar" :alt="artist.name" class="artist-avatar" />
            <div class="artist-info">
              <div class="artist-name">{{ artist.name }}</div>
              <div class="artist-meta">{{ artist.region }} &middot; {{ artist.genre }}</div>
            </div>
          </div>
        </div>
        <p v-else class="no-result">未找到相关歌手</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { searchSongs as mockSearchSongs, searchArtists as mockSearchArtists, hotSearchTags } from '../data/mockData'
import { searchAll as apiSearchAll } from '../services/api'
import { getSearchHistory, addSearchHistory, clearSearchHistory } from '../utils/storage'
import SongCard from '../components/SongCard.vue'

const router = useRouter()
const route = useRoute()
const store = usePlayerStore()

const keyword = ref('')
const songResults = ref([])
const artistResults = ref([])
const searchHistory = ref([])
let debounceTimer = null

function onInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    doSearch()
  }, 300)
}

async function doSearch() {
  const kw = keyword.value.trim()
  if (!kw) {
    songResults.value = []
    artistResults.value = []
    return
  }
  addSearchHistory(kw)
  searchHistory.value = getSearchHistory()
  try {
    const apiData = await apiSearchAll(kw)
    if (apiData?.songs?.length || apiData?.artists?.length) {
      songResults.value = apiData.songs || []
      artistResults.value = apiData.artists || []
    } else {
      songResults.value = mockSearchSongs(kw)
      artistResults.value = mockSearchArtists(kw)
    }
  } catch {
    songResults.value = mockSearchSongs(kw)
    artistResults.value = mockSearchArtists(kw)
  }
  router.replace({ query: { q: kw } })
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
  margin-bottom: 32px;
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

.section { margin-bottom: 32px; }

.history-tags, .hot-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-tag, .hot-tag {
  padding: 8px 16px;
  border-radius: 16px;
  font-size: 13px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border-color);
}

.history-tag:hover, .hot-tag:hover {
  color: var(--accent-light);
  border-color: var(--accent);
}

.hot-tag { border-color: transparent; background: rgba(99, 102, 241, 0.1); color: var(--accent-light); }

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
