// PWA Service Worker：应用外壳缓存 + 运行时缓存
// 策略：预缓存首页/图标，运行时缓存静态资源（html/js/css/图片），接口请求不缓存直接走网络
const CACHE_VERSION = 'hutao-music-v1'
const CORE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
]

// 安装阶段：预缓存应用外壳，保证首屏离线可用
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  )
})

// 激活阶段：清理旧版本缓存，并接管所有已打开的页面
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// 请求拦截：
// - /api/* 接口始终走网络（数据实时，不能缓存旧的）
// - 其他同源请求：缓存优先，miss 时回源并写入缓存
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        // 只缓存成功的、可缓存的响应，避免把错误页写进缓存
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy))
        }
        return response
      })
    })
  )
})