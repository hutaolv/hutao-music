import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Filesystem } from '@capacitor/filesystem'
import router from './router'
import App from './App.vue'
import './styles/global.css'

// 注册 Filesystem 插件：插件在模块加载时自注册，此 import 不可删除
import '@capacitor/filesystem'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
