// PWA Service Worker：应用外壳缓存 + 运行时缓存
// 策略：
// - 页面导航（HTML）网络优先：每次打开优先拿最新 index.html，避免旧缓存页面导致白屏，miss 时回退缓存
// - 静态资源（js/css/图片）缓存优先：加载提速，miss 时回源并写入缓存
// - 接口请求（/api/*）一律走网络，不缓存
const CACHE_VERSION = 'hutao-music-v2'
const CORE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/hutao.png'
]

// 安装阶段：预缓存应用外壳，保证首屏离线可用
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  )
})

// 激活阶段：清理旧版本缓存（v1 的旧 index.html 会在此被清除），并接管已打开的页面
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// 请求拦截
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // 页面导航：网络优先，避免命中缓存的旧 index.html（引用旧 hash 资源）导致白屏
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone()
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy))
        return response
      }).catch(() => caches.match(event.request))
    )
    return
  }

  // 静态资源：缓存优先，miss 时回源
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy))
        }
        return response
      })
    })
  )
})