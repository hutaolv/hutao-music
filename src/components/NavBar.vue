<template>
  <nav class="navbar">
    <div class="nav-inner">
      <router-link to="/" class="logo">
        <span class="logo-icon">&#x266B;</span>
        <span class="logo-text">胡桃音悦</span>
        <img src="/icons/hutaoico.png" alt="胡桃" class="logo-hutao">
      </router-link>
      <div class="nav-links">
        <router-link v-for="item in navItems" :key="item.path" :to="item.path" class="nav-link" active-class="active">
          {{ item.name }}
        </router-link>
        <!-- 使用固定地址而非写死版本号文件名：服务端按 version.json 自动返回最新版APK，
             避免每次发版都要记得改这里（曾因写死1.0.4导致下载旧版）。
             服务端直接流式返回文件（带 attachment 头），浏览器首次响应即触发下载 -->
        <a v-if="!isApp" href="/downloads/胡桃音悦.apk" download class="nav-link download-link">下载安卓版</a>
      </div>
      <!-- PC 端右上角 GitHub 仓库入口 -->
      <a class="github-link" href="https://github.com/hutaolv/hutao-music" target="_blank" rel="noopener noreferrer" title="GitHub 开源地址" aria-label="GitHub">
        <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <span>GitHub</span>
      </a>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { Capacitor } from '@capacitor/core'

const navItems = [
  { path: '/', name: '首页' },
  { path: '/charts', name: '排行榜' },
  { path: '/search', name: '搜索' }
]

// APK 内不显示下载按钮（用户已在用 APK）
// 使用 isNativePlatform() 精确判断：@capacitor/core 在 web 构建中也会设置 window.Capacitor，
// 导致 !!window.Capacitor 在网页版也为 true，误隐藏下载按钮
const isApp = computed(() => Capacitor.isNativePlatform())
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

.logo-hutao {
  width: 20px;
  height: 20px;
  border-radius: 50%;
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

/* 右上角 GitHub：靠 margin-left 推到最右 */
.github-link {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.07);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (hover: hover) {
  .github-link:hover {
    color: var(--accent-light);
    border-color: var(--accent);
    background: rgba(99, 102, 241, 0.16);
    box-shadow: 0 0 16px rgba(99, 102, 241, 0.2);
  }
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
  .navbar {
    height: 74px;
  }

  .nav-inner {
    flex-wrap: wrap;
    align-content: center;
    gap: 8px 12px;
    padding: 23px 12px;
  }

  .logo-text {
    font-size: 17px;
  }

  .logo-icon {
    font-size: 22px;
  }

  .logo-hutao {
    width: 16px;
    height: 16px;
    border-radius: 50%;
  }

  .nav-link {
    padding: 6px 10px;
    font-size: 13px;
  }

  /* 下载按钮压缩为紧凑描边样式，保证单行放得下 */
  .download-link {
    padding: 5px 8px;
    font-size: 12px;
    font-weight: 500;
    border-width: 1px;
  }

  /* 手机端不显示 GitHub 入口 */
  .github-link { display: none; }
}
</style>
