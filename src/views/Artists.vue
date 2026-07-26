<template>
  <div class="artists-page">
    <h1 class="section-title">歌手合集</h1>
    <p class="section-subtitle">浏览全网热门歌手，发现好音乐</p>

    <div class="filters">
      <div class="filter-group">
        <span class="filter-label">地区</span>
        <button v-for="r in regions" :key="r" class="filter-btn" :class="{ active: activeRegion === r }" @click="activeRegion = r">{{ r }}</button>
      </div>
      <div class="filter-group">
        <span class="filter-label">风格</span>
        <button v-for="g in genres" :key="g" class="filter-btn" :class="{ active: activeGenre === g }" @click="activeGenre = g">{{ g }}</button>
      </div>
      <div class="filter-group">
        <span class="filter-label">排序</span>
        <button v-for="s in sorts" :key="s.value" class="filter-btn" :class="{ active: activeSort === s.value }" @click="activeSort = s.value">{{ s.label }}</button>
      </div>
    </div>

    <div class="artist-grid">
      <ArtistCard v-for="artist in filteredArtists" :key="artist.id" :artist="artist" />
    </div>

    <div v-if="!filteredArtists.length" class="no-result">没有找到符合条件的歌手</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { artists } from '../data/mockData'
import ArtistCard from '../components/ArtistCard.vue'

const regions = ['全部', '华语', '欧美', '日韩']
const genres = ['全部', '流行', '民谣', 'R&B', '说唱', '摇滚']
const sorts = [
  { value: 'fans', label: '粉丝数' },
  { value: 'name', label: '姓名' },
  { value: 'songCount', label: '歌曲数' }
]

const activeRegion = ref('全部')
const activeGenre = ref('全部')
const activeSort = ref('fans')

const filteredArtists = computed(() => {
  let result = [...artists]
  if (activeRegion.value !== '全部') {
    result = result.filter(a => a.region === activeRegion.value)
  }
  if (activeGenre.value !== '全部') {
    result = result.filter(a => a.genre === activeGenre.value)
  }
  result.sort((a, b) => {
    if (activeSort.value === 'name') return a.name.localeCompare(b.name, 'zh-CN')
    return b[activeSort.value] - a[activeSort.value]
  })
  return result
})
</script>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 28px;
  padding: 20px;
  background: var(--bg-card);
  border-radius: var(--radius);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
  margin-right: 4px;
}

.filter-btn {
  padding: 6px 14px;
  border-radius: 14px;
  font-size: 13px;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.filter-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.filter-btn.active {
  color: var(--accent-light);
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.1);
}

.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 20px;
}

.no-result {
  padding: 60px;
  text-align: center;
  color: var(--text-muted);
  font-size: 15px;
}
</style>
