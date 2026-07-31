<template>
  <div class="artist-detail">
    <div v-if="songs.length" class="artist-header">
      <img :src="songs[0]?.cover" :alt="songs[0]?.artist" class="artist-avatar" @error="e => e.target.style.display = 'none'" />
      <div class="artist-info">
        <h1 class="artist-name">{{ songs[0]?.artist || '歌手' }}</h1>
        <div class="artist-actions">
          <button class="play-all-btn" @click="playAll">&#x25B6; 播放全部</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">热门歌曲</h2>
      <div class="song-list">
        <div v-for="(song, idx) in songs" :key="song.id" class="song-row" @dblclick="store.playSong(song)">
          <span class="song-rank">{{ idx + 1 }}</span>
          <img :src="song.cover" :alt="song.title" class="song-cover" @error="e => e.target.style.display = 'none'" />
          <div class="song-info">
            <!-- 标题右侧显示 VIP 标识（付费歌曲），与搜索/榜单卡片样式一致 -->
            <div class="song-title">
              {{ song.title }}
              <span v-if="song.vip" class="vip-badge">VIP</span>
            </div>
            <div class="song-album">{{ song.album }}</div>
          </div>
          <span class="song-platform" :style="{ color: platformColors[song.platform] }">{{ song.platform }}</span>
          <span class="song-duration">{{ song.duration }}</span>
          <button class="action-btn" @click="store.playSong(song)" title="播放">&#x25B6;</button>
          <button class="action-btn" @click="store.addToPlaylist(song)" title="添加到播放列表">&#x2795;</button>
        </div>
      </div>
      <p v-if="!songs.length" class="no-result">暂无歌曲数据</p>
      <button v-if="hasMore && !loading" class="load-more-btn" @click="loadMore">加载更多</button>
      <p v-else-if="loading" class="no-result">加载中...</p>
    </div>

    <button class="back-btn" @click="router.back()">&larr; 返回</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePlayerStore } from '../stores/player'
import { platformColors } from '../data/platforms'
import { getArtistSongs as apiArtistSongs } from '../services/api'

const router = useRouter()
const route = useRoute()
const store = usePlayerStore()

const artist = ref(null)
const songs = ref([])
// 咪咕分页加载状态：当前页码、是否还有下一页、是否加载中
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)

// 解析歌手 id 前缀，返回 { platform, artistId }；咪咕等平台需剥离前缀传真实 id
function parseArtistId(id) {
  if (id.startsWith('netease_artist_')) return { platform: '网易云音乐', artistId: id.replace('netease_artist_', '') }
  if (id.startsWith('qqmusic_artist_')) return { platform: 'QQ音乐', artistId: id.replace('qqmusic_artist_', '') }
  if (id.startsWith('bilibili_artist_')) return { platform: 'B站', artistId: id.replace('bilibili_artist_', '') }
  if (id.startsWith('douyin_artist_')) return { platform: '抖音', artistId: id }
  if (id.startsWith('migu_artist_')) return { platform: '咪咕音乐', artistId: id.replace('migu_artist_', '') }
  return { platform: '', artistId: id }
}

// 加载歌手歌曲；append=true 时追加到列表（加载更多），否则覆盖
async function loadSongs(append = false) {
  if (loading.value) return
  loading.value = true
  const id = route.params.id
  // 歌手名从路由 query 传入，供 B站/抖音/咪咕等需按名字搜索的平台使用
  const name = route.query.name || ''
  const { platform, artistId } = parseArtistId(id)
  const data = await apiArtistSongs(platform, artistId, name, page.value)
  if (append) songs.value.push(...data.songs)
  else songs.value = data.songs
  hasMore.value = data.hasMore
  loading.value = false
}

// 点击"加载更多"：页码 +1 并追加下一页歌曲
function loadMore() {
  page.value += 1
  loadSongs(true)
}

onMounted(() => loadSongs())

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
  display: flex;
  align-items: center;
  gap: 6px;
}

/* VIP 付费歌曲徽标 */
.vip-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: 0.5px;
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

/* 咪咕等平台歌曲分页加载按钮 */
.load-more-btn {
  display: block;
  margin: 20px auto;
  padding: 8px 28px;
  font-size: 14px;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}
.load-more-btn:hover { color: var(--text-primary); border-color: var(--text-muted); }

@media (max-width: 640px) {
  .artist-header { flex-direction: column; text-align: center; }
  .artist-avatar { width: 120px; height: 120px; }
  .artist-name { font-size: 24px; }
}
</style>
