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
// Capacitor 打包的 APK 内资源是本地 assets，无需 SW 缓存，且 SW 缓存优先策略
// 会在覆盖安装时命中旧 index.html 导致白屏，故 Capacitor 环境下不注册。
if (import.meta.env.PROD && !('Capacitor' in window) && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW 注册失败:', err.message))
  })
}
