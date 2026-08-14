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
      </div>
    </div>
  </nav>
</template>

<script setup>
const navItems = [
  { path: '/', name: '首页' },
  { path: '/charts', name: '排行榜' },
  { path: '/search', name: '搜索' }
]
</script>

<style scoped>
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--nav-height);
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-color);
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
  border-radius: var(--radius-sm);
  font-size: 15px;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.nav-link:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.nav-link.active {
  color: var(--accent-light);
  background: rgba(99, 102, 241, 0.1);
}

/* 手机端（≤767px）：导航栏收紧排版 */
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
