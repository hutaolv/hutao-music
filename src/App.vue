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
</template>

<script setup>
import NavBar from './components/NavBar.vue'
import PlayerBar from './components/PlayerBar.vue'
</script>
