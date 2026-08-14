<template>
  <div class="hutao-loading">
    <div class="hutao-loading-figure">
      <img src="/icons/hutao.png" alt="" class="hutao-loading-img" />
    </div>
    <p class="hutao-loading-text">{{ text }}<span class="loading-dots"></span></p>
  </div>
</template>

<script setup>
defineProps({
  text: { type: String, default: '胡桃正在全力加载中' }
})
</script>

<style scoped>
.hutao-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 36px 16px;
}

.hutao-loading-figure {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-card);
  border: 2px solid var(--accent);
  box-shadow: 0 0 24px rgba(99, 102, 241, 0.35);
  animation: hutao-bounce 1s ease-in-out infinite;
}

.hutao-loading-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hutao-loading-text {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
  letter-spacing: 0.5px;
}

/* 省略号三点动画 */
.loading-dots::after {
  content: '';
  animation: hutao-dots 1.2s steps(4, end) infinite;
}

@keyframes hutao-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes hutao-dots {
  0% { content: ''; }
  25% { content: '.'; }
  50% { content: '..'; }
  75% { content: '...'; }
  100% { content: ''; }
}

@media (max-width: 767px) {
  .hutao-loading { padding: 24px 12px; gap: 10px; }
  .hutao-loading-figure { width: 56px; height: 56px; }
  .hutao-loading-text { font-size: 13px; }
}
</style>