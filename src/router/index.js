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

// 发版后兜底：长时间停留的旧页面在切换路由时，会去加载已被新构建替换掉的
// 哈希命名分包（404），表现为点击菜单毫无反应。捕获此类动态导入失败，
// 自动整页跳转目标路由——浏览器重新拉取最新 index.html 与配套分包即自愈。
// reloaded 标记防止极端情况下陷入刷新死循环（每次会话最多自动刷新一次）
let reloadedForChunkError = false
router.onError((error, to) => {
  const msg = String(error?.message || '')
  const isChunkError =
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk')
  if (isChunkError && !reloadedForChunkError && to) {
    reloadedForChunkError = true
    window.location.replace(to.fullPath)
  }
})

export default router
