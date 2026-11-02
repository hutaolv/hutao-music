import { createRouter, createWebHistory } from 'vue-router'
import { usePlayerStore } from '../stores/player'

// 各页面的懒加载函数集中导出：Vue Router 导航进来调用一次后结果即被缓存，
// 预取时主动调用这些函数与真正导航走的是同一个模块 Promise，不会重复下载
const pageLoaders = {
  Home: () => import('../views/Home.vue'),
  Charts: () => import('../views/Charts.vue'),
  Search: () => import('../views/Search.vue'),
  ArtistDetail: () => import('../views/ArtistDetail.vue'),
  Lyrics: () => import('../views/LyricsView.vue')
}

// 路由级滚动位置表：key 用 path（不含 query），换搜索关键词时自然回到顶部
const scrollPositions = new Map()
// 已访问过的页面集合，用来区分「首次进入」和「切回来」
const visitedPaths = new Set()

const routes = [
  { path: '/', name: 'Home', component: pageLoaders.Home, meta: { title: '首页' } },
  { path: '/charts', name: 'Charts', component: pageLoaders.Charts, meta: { title: '排行榜' } },
  { path: '/search', name: 'Search', component: pageLoaders.Search, meta: { title: '搜索' } },
  { path: '/artist/:id', name: 'ArtistDetail', component: pageLoaders.ArtistDetail, meta: { title: '歌手详情' } },
  { path: '/lyrics', name: 'Lyrics', component: pageLoaders.Lyrics, meta: { title: '歌词' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  // 页面切换后的滚动位置处理：不配置时 SPA 切页会保留上一页的滚动偏移，
  // 短页面会「顶部被切掉」、长页面会「从半截开始显示」，观感上就是切换在跳。
  // 这里做到两点：新页面从顶部开始；被 keep-alive 缓存的页面切回来恢复原位置。
  scrollBehavior(to, from) {
    // 导航确认后、DOM 更新前调用，此时 window.scrollY 仍是离开页面的位置，正好拿来记录
    if (from.path) scrollPositions.set(from.path, window.scrollY || 0)

    const saved = scrollPositions.get(to.path)
    // 只恢复访问过的页面：首次进入的页面还没渲染出内容高度，强行滚动会失效
    if (visitedPaths.has(to.path) && saved) {
      // 返回 Promise：等一帧让 keep-alive 复用的 DOM 就位后再滚，否则高度不足滚不过去
      return new Promise(resolve => {
        requestAnimationFrame(() => resolve({ top: saved, left: 0 }))
      })
    }
    visitedPaths.add(to.path)
    return { top: 0, left: 0 }
  }
})

// ===== 路由 chunk 空闲预取 =====
// 懒加载页面的 JS 默认要等用户点击时才下载，弱网下点击后会出现「点了没反应 + 白屏」，
// 这是页面切换体感卡顿最主要的来源（歌词页组件接近 1700 行，chunk 最大）。
// 这里在首屏渲染完的空闲时段静默把其余页面拉下来，点击时直接命中内存，切换只剩渲染耗时。
function prefetchRouteChunks() {
  // 用户开了省流量模式，或处于 2G 这类弱网时不做预取，避免白白消耗用户流量
  const conn = navigator?.connection
  if (conn?.saveData) return
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return

  // 串行加载而非并发：同时下载多个 chunk 会抢占首屏图片/接口的带宽，反而拖慢当前页
  const names = Object.keys(pageLoaders).filter(n => n !== 'Home')
  const loadNext = (queue) => {
    if (!queue.length) return
    const [name, ...rest] = queue
    pageLoaders[name]().catch(() => {}).finally(() => loadNext(rest))
  }

  // 空闲时执行；不支持 requestIdleCallback 的旧 WebView 退化成延时执行
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => loadNext(names), { timeout: 5000 })
  } else {
    setTimeout(() => loadNext(names), 1500)
  }
}

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

// 首屏 DOM 就绪后再启动预取，避免和首屏渲染抢主线程
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(prefetchRouteChunks, 0), { once: true })
} else {
  setTimeout(prefetchRouteChunks, 0)
}

export default router
