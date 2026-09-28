import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.hutao.music',
  appName: '胡桃音悦',
  webDir: 'dist',
  // 打包后默认加载本地打包好的 dist 资源（无地址栏、接近原生体验）
  server: {
    androidScheme: 'http'
  }
}

export default config
