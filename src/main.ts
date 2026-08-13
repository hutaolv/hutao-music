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
// 开发环境不注册，避免缓存干扰热更新调试
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW 注册失败:', err.message))
  })
}
