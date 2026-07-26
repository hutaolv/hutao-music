<template>
  <div class="artist-detail">
    <div v-if="artist" class="artist-header">
      <img :src="artist.avatar" :alt="artist.name" class="artist-avatar" />
      <div class="artist-info">
        <h1 class="artist-name">{{ artist.name }}</h1>
        <div class="artist-meta">
          <span>{{ artist.region }}</span>
          <span class="dot">&middot;</span>
          <span>{{ artist.genre }}</span>
          <span class="dot">&middot;</span>
          <span>{{ (artist.fans / 10000).toFixed(1) }}万粉丝</span>
        </div>
        <div class="artist-actions">
          <button class="play-all-btn" @click="playAll">&#x25B6; 播放全部</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">热门歌曲 Top 10</h2>
      <div class="song-list">
        <div v-for="(song, idx) in songs" :key="song.id" class="song-row" @dblclick="store.playSong(song)">
          <span class="song-rank">{{ idx + 1 }}</span>
          <img :src="song.cover" :alt="song.title" class="song-cover" />
          <div class="song-info">
            <div class="song-title">{{ song.title }}</div>
            <div class="song-album">{{ song.album }}</div>
          </div>
          <span class="song-platform" :style="{ color: platformColors[song.platform] }">{{ song.platform }}</span>
          <span class="song-duration">{{ song.duration }}</span>
          <button class="action-btn" @click="store.playSong(song)" title="播放">&#x25B6;</button>
          <button class="action-btn" @click="store.addToPlaylist(song)" title="添加到播放列表">&#x2795;</button>
        </div>
      </div>
      <p v-if="!songs.length" class="no-result">暂无歌曲数据</p>
    </div>

    <button class="back-btn" @click="router.back()">&larr; 返回</button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { getArtistById, getSongsByArtist, platformColors } from '../data/mockData'
import { getArtistSongs as apiArtistSongs } from '../services/api'

const router = useRouter()
const route = useRoute()
const store = usePlayerStore()

const artist = ref(null)
const songs = ref([])

onMounted(async () => {
  const id = route.params.id
  artist.value = getArtistById(id)

  if (id.startsWith('netease_artist_')) {
    const realId = id.replace('netease_artist_', '')
    const apiSongs = await apiArtistSongs('网易云音乐', realId)
    if (apiSongs?.length) { songs.value = apiSongs; return }
  }
  if (id.startsWith('qqmusic_artist_')) {
    const realId = id.replace('qqmusic_artist_', '')
    const apiSongs = await apiArtistSongs('QQ音乐', realId)
    if (apiSongs?.length) { songs.value = apiSongs; return }
  }

  if (artist.value) {
    songs.value = getSongsByArtist(id)
  }
})

function playAll() {
  if (songs.value.length) {
    store.playSong(songs.value[0])
    for (let i = 1; i < songs.value.length; i++) {
      store.addToPlaylist(songs.value[i])
    }
  }
}
</script>

<style scoped>
.artist-header {
  display: flex;
  align-items: center;
  gap: 32px;
  margin-bottom: 40px;
  padding: 32px;
  background: var(--bg-card);
  border-radius: var(--radius);
}

.artist-avatar {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.artist-name {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 8px;
}

.artist-meta {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.dot { margin: 0 8px; }

.play-all-btn {
  padding: 10px 24px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  color: white;
  background: var(--accent);
  transition: background 0.2s;
}

.play-all-btn:hover { background: var(--accent-light); }

.song-list {
  background: var(--bg-card);
  border-radius: var(--radius);
  overflow: hidden;
}

.song-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  transition: background 0.2s;
  cursor: default;
}

.song-row:hover { background: var(--bg-hover); }

.song-rank {
  width: 30px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-muted);
  text-align: center;
}

.song-cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
}

.song-info { flex: 1; min-width: 0; }

.song-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.song-album {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.song-platform {
  font-size: 12px;
  font-weight: 500;
  width: 80px;
  flex-shrink: 0;
}

.song-duration {
  font-size: 13px;
  color: var(--text-muted);
  width: 50px;
  text-align: right;
  flex-shrink: 0;
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
  flex-shrink: 0;
}

.action-btn:hover { color: var(--accent-light); background: var(--bg-hover); }

.no-result { padding: 40px; text-align: center; color: var(--text-muted); }

.back-btn {
  margin-top: 24px;
  padding: 8px 20px;
  font-size: 14px;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}

.back-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }

@media (max-width: 640px) {
  .artist-header { flex-direction: column; text-align: center; }
  .artist-avatar { width: 120px; height: 120px; }
  .artist-name { font-size: 24px; }
}
</style>
