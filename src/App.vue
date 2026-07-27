<template>
  <NavBar />
  <main class="page-container">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </main>
  <PlayerBar />
  <DesktopLyrics />
</template>

<script setup>
import NavBar from './components/NavBar.vue'
import PlayerBar from './components/PlayerBar.vue'
import DesktopLyrics from './components/DesktopLyrics.vue'
</script>
