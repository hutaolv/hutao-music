<template>
  <div class="playlist-panel">
    <div class="playlist-tabs">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'favorites' }"
        @click.stop="activeTab = 'favorites'; refresh()"
      >
        我的喜欢 ({{ favList.length }})
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'recent' }"
        @click.stop="activeTab = 'recent'; refresh()"
      >
        最近播放 ({{ recentList.length }})
      </button>
    </div>

    <div class="playlist-body">
      <template v-if="activeTab === 'favorites'">
        <div v-if="favList.length" class="playlist-list">
          <div
            v-for="song in favList" :key="song.id"
            class="playlist-item"
            :class="{ active: store.currentSong?.id === song.id }"
            @click="store.playSong(song)"
          >
            <img :src="song.cover" alt="" class="item-cover" @error="hideImg" />
            <div class="item-info">
              <div class="item-title">{{ song.title }}</div>
              <div class="item-artist">{{ song.artist }}</div>
            </div>
            <span class="item-duration">{{ song.duration }}</span>
            <button class="remove-btn" title="取消喜欢" @click.stop="removeFav(song.id)">&times;</button>
          </div>
        </div>
        <div v-else class="empty-state">还没有喜欢的歌曲</div>
      </template>

      <template v-else>
        <div v-if="recentList.length" class="playlist-list">
          <div
            v-for="song in recentList" :key="song.id"
            class="playlist-item"
            :class="{ active: store.currentSong?.id === song.id }"
            @click="store.playSong(song)"
          >
            <img :src="song.cover" alt="" class="item-cover" @error="hideImg" />
            <div class="item-info">
              <div class="item-title">{{ song.title }}</div>
              <div class="item-artist">{{ song.artist }}</div>
            </div>
            <span class="item-duration">{{ song.duration }}</span>
          </div>
        </div>
        <div v-else class="empty-state">还没有播放记录</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { usePlayerStore } from '../stores/player'
import { getFavorites, removeFavorite, getRecentPlays } from '../utils/storage'

const store = usePlayerStore()
const activeTab = ref('favorites')
const favList = ref([])
const recentList = ref([])

function refresh() {
  favList.value = getFavorites()
  recentList.value = getRecentPlays()
}
function removeFav(id) {
  removeFavorite(id)
  favList.value = getFavorites()
}
function hideImg(e) {
  e.target.style.display = 'none'
}
onMounted(refresh)
</script>

<style scoped>
.playlist-panel {
  position: absolute;
  bottom: 100%;
  right: 32px;
  width: 380px;
  max-height: 420px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 300;
}
.playlist-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.tab-btn {
  flex: 1;
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  position: relative;
  font-family: inherit;
}
.tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.tab-btn.active {
  color: var(--accent-light);
  background: rgba(99, 102, 241, 0.12);
}
.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 10%;
  right: 10%;
  height: 3px;
  background: var(--accent-light);
  border-radius: 2px;
}
.playlist-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.playlist-list {}
.playlist-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
}
.playlist-item:hover { background: var(--bg-hover); }
.playlist-item.active { background: rgba(99, 102, 241, 0.1); }
.item-cover {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}
.item-info { flex: 1; min-width: 0; }
.item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-artist {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
.item-duration {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.remove-btn {
  font-size: 18px;
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  opacity: 0;
  transition: all 0.2s;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
}
.playlist-item:hover .remove-btn { opacity: 1; }
.remove-btn:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
