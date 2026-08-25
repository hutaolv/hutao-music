<template>
  <nav class="navbar">
    <div class="nav-inner">
      <router-link to="/" class="logo">
        <span class="logo-icon">&#x266B;</span>
        <span class="logo-text">胡桃音悦</span>
      </router-link>
      <div class="nav-links">
        <router-link v-for="item in navItems" :key="item.path" :to="item.path" class="nav-link" active-class="active">
          {{ item.name }}
        </router-link>
        <!-- 使用固定重定向地址而非写死版本号文件名：服务端会按 version.json
             自动302到最新版APK，避免每次发版都要记得改这里（曾因写死1.0.4导致下载旧版） -->
        <a v-if="!isApp" href="/downloads/胡桃音悦.apk" download class="nav-link download-link">下载安卓版</a>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'

const navItems = [
  { path: '/', name: '首页' },
  { path: '/charts', name: '排行榜' },
  { path: '/search', name: '搜索' }
]

// APK 内不显示下载按钮（用户已在用 APK）
const isApp = computed(() => typeof window !== 'undefined' && !!window.Capacitor)
</script>

<style scoped>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--nav-height);
  background: rgba(10, 10, 15, 0.88);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  border-bottom: 1px solid var(--border-subtle);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  z-index: 100;
}

.nav-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 32px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 32px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.logo-icon {
  font-size: 28px;
  color: var(--accent);
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent-light), #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.nav-links {
  display: flex;
  gap: 4px;
}

.nav-link {
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  font-size: 15px;
  color: var(--text-secondary);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .nav-link:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.06);
  }
}

.nav-link.active {
  color: var(--accent-light);
  background: rgba(99, 102, 241, 0.1);
}

.download-link {
  border: 1px solid var(--accent);
  border-radius: var(--radius-pill);
  background: rgba(99, 102, 241, 0.08);
  font-weight: 600;
  white-space: nowrap;
}
@media (hover: hover) {
  .download-link:hover {
    background: rgba(99, 102, 241, 0.18);
    color: var(--accent-light);
    box-shadow: 0 0 16px rgba(99, 102, 241, 0.2);
  }
}

/* ===== Mobile ===== */
@media (max-width: 767px) {
  .nav-inner {
    flex-wrap: wrap;
    align-content: center;
    gap: 4px 12px;
    padding: 0 12px;
  }

  .logo-text {
    font-size: 17px;
  }

  .logo-icon {
    font-size: 22px;
  }

  .nav-link {
    padding: 6px 10px;
    font-size: 13px;
  }
}
</style>
