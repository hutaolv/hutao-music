import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.hutao.music',
  appName: '胡桃音悦',
  webDir: 'dist',
  // 打包后默认加载本地打包好的 dist 资源（无地址栏、接近原生体验）
  server: {
    // 页面源用 http（与线上 API 同协议，线上地址见 README 部署说明），
    // 避免 https 页面 fetch 明文接口/图片被 mixed content 拦截导致"暂无数据"
    androidScheme: 'http'
  }
}

export default config
