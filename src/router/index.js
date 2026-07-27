import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'Home', component: () => import('../views/Home.vue'), meta: { title: '首页' } },
  { path: '/charts', name: 'Charts', component: () => import('../views/Charts.vue'), meta: { title: '排行榜' } },
  { path: '/search', name: 'Search', component: () => import('../views/Search.vue'), meta: { title: '搜索' } },
  { path: '/artist/:id', name: 'ArtistDetail', component: () => import('../views/ArtistDetail.vue'), meta: { title: '歌手详情' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
