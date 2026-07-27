<template>
  <nav class="navbar">
    <div class="nav-inner">
      <router-link to="/" class="logo">
        <span class="logo-icon">&#x266B;</span>
        <span class="logo-text">音悦聚合</span>
      </router-link>
      <div class="nav-links">
        <router-link v-for="item in navItems" :key="item.path" :to="item.path" class="nav-link" active-class="active">
          {{ item.name }}
        </router-link>
      </div>
      <div class="search-bar">
        <input v-model="keyword" type="text" placeholder="搜索音乐、歌手..." @keydown.enter="doSearch" />
        <button class="search-btn" @click="doSearch">&#x1F50D;</button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { addSearchHistory } from '../utils/storage'

const router = useRouter()
const keyword = ref('')

const navItems = [
  { path: '/', name: '首页' },
  { path: '/charts', name: '排行榜' },
  { path: '/search', name: '搜索' }
]

function doSearch() {
  const kw = keyword.value.trim()
  if (kw) {
    addSearchHistory(kw)
    router.push({ path: '/search', query: { q: kw } })
  }
}
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

.search-bar {
  flex: 1;
  max-width: 360px;
  margin-left: auto;
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border-radius: 20px;
  padding: 0 4px 0 16px;
  border: 1px solid var(--border-color);
  transition: border-color 0.2s;
}

.search-bar:focus-within {
  border-color: var(--accent);
}

.search-bar input {
  flex: 1;
  height: 36px;
  font-size: 14px;
  color: var(--text-primary);
}

.search-bar input::placeholder {
  color: var(--text-muted);
}

.search-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.2s;
}

.search-btn:hover {
  background: var(--bg-hover);
}
</style>
