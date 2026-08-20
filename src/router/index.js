import { createRouter, createWebHistory } from 'vue-router'
import { usePlayerStore } from '../stores/player'

const routes = [
  { path: '/', name: 'Home', component: () => import('../views/Home.vue'), meta: { title: '首页' } },
  { path: '/charts', name: 'Charts', component: () => import('../views/Charts.vue'), meta: { title: '排行榜' } },
  { path: '/search', name: 'Search', component: () => import('../views/Search.vue'), meta: { title: '搜索' } },
  { path: '/artist/:id', name: 'ArtistDetail', component: () => import('../views/ArtistDetail.vue'), meta: { title: '歌手详情' } },
  { path: '/lyrics', name: 'Lyrics', component: () => import('../views/LyricsView.vue'), meta: { title: '歌词' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 歌词页必须有正在播放的歌曲才有意义：无歌曲时直接回首页，避免出现空白歌词页
router.beforeEach((to) => {
  if (to.path === '/lyrics') {
    const player = usePlayerStore()
    if (!player.currentSong) return { path: '/' }
  }
})

export default router
