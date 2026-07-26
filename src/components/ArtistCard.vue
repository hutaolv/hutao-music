<template>
  <div class="artist-card" @click="goDetail">
    <div class="avatar-wrap">
      <img :src="artist.avatar" :alt="artist.name" class="avatar" />
      <div class="play-overlay">&#x25B6;</div>
    </div>
    <div class="name">{{ artist.name }}</div>
    <div class="meta">{{ artist.region }} &middot; {{ artist.genre }}</div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const props = defineProps({
  artist: { type: Object, required: true }
})

const router = useRouter()

function goDetail() {
  router.push(`/artist/${props.artist.id}`)
}
</script>

<style scoped>
.artist-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
  text-align: center;
}

.artist-card:hover {
  background: var(--bg-card);
  transform: translateY(-2px);
}

.avatar-wrap {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
}

.avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: white;
  opacity: 0;
  transition: opacity 0.2s;
}

.artist-card:hover .play-overlay { opacity: 1; }

.name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.meta {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
