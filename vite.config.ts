import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    // 构建目标降至 es2015，确保 Android 9（Chrome 60~70）能正常解析可选链等语法
    target: 'es2015'
  },
  server: {
    // host: true 让 dev server 监听局域网，手机连同一 WiFi 可通过 电脑IP:5173 访问
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
