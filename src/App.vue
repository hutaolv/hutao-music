<template>
  <NavBar />
  <main class="page-container">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </main>
  <transition name="playerbar">
    <PlayerBar />
  </transition>
  <DesktopLyrics />
</template>

<script setup>
import NavBar from './components/NavBar.vue'
import PlayerBar from './components/PlayerBar.vue'
import DesktopLyrics from './components/DesktopLyrics.vue'
</script>

<style>
/* 播放条出现/隐藏时的滑入滑出动画（v-show 切换触发 transition 类） */
.playerbar-enter-active { transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
.playerbar-enter-from { transform: translateY(100%); }
</style>
