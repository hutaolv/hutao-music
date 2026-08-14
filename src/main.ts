import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './styles/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// PWA：仅生产环境注册 Service Worker，实现离线缓存与"添加到主屏幕"；
// 开发环境不注册，避免缓存干扰热更新调试。
// Capacitor 打包的 APK 内资源是本地 assets，无需 SW 缓存。且 SW 是持久化的：
// 即使不再注册，旧 APK 留下的 SW 仍会接管请求、命中旧缓存返回旧 index.html 导致白屏，
// 因此 Capacitor 环境下必须主动注销所有已注册 SW 并清空缓存。
if (import.meta.env.PROD) {
  if ('Capacitor' in window) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {})
    }
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {})
    }
  } else if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW 注册失败:', err.message))
    })
  }
}
