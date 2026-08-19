<template>
  <div class="audio-visualizer" ref="containerRef">
    <canvas ref="canvasRef" class="visualizer-canvas"></canvas>
  </div>
</template>

<script setup>
// AudioVisualizer：轻量级频谱可视化组件
// 底层复用 utils/spectrum.js 的 registerCanvas 机制（共享同一份 AudioContext + AnalyserNode），
// 通过 props 控制视觉风格（bars / wave / circle）与配色。
// createMediaElementSource 对同一个 Audio 只能调用一次，
// 因此组件不再自建 AudioContext，而是依赖 PlayerBar 中已调用的 initAudioGraph。

import { ref, onMounted, onUnmounted, watch } from 'vue'
import { registerCanvas, setSpectrumActive } from '../utils/spectrum'

const props = defineProps({
  // 是否播放中（控制频谱动画启停）
  isPlaying: { type: Boolean, default: false },
  // 频谱风格: 'bars' | 'wave' | 'circle' | 'waveform'
  spectrumStyle: { type: String, default: 'bars' },
  // 柱状/波形采样数量
  barCount: { type: Number, default: 48 },
  // 主题颜色数组
  colors: {
    type: Array,
    default: () => ['#22d3ee', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb923c']
  },
  // 是否显示发光效果
  glow: { type: Boolean, default: true },
  // 是否显示峰值线（仅 bars 风格）
  peak: { type: Boolean, default: true },
  // 镜像模式（bars: 上下对称，circle: 内外双向辐射）
  mirror: { type: Boolean, default: false },
  // 频谱占用高度比例（0~1）
  region: { type: Number, default: 1 },
  // LED 段数（仅 circle 风格）
  segments: { type: Number, default: 10 },
  // 段间隙比例（仅 circle 风格）
  gapRatio: { type: Number, default: 0.35 },
  // 线条宽度（仅 waveform 风格）
  lineWidth: { type: Number, default: 2 },
  // 两端收窄强度（仅 waveform 风格，0~1）
  taper: { type: Number, default: 0.85 }
})

const containerRef = ref(null)
const canvasRef = ref(null)

let unregister = null

// 注册 canvas 到 spectrum.js 的绘制循环
function register() {
  if (!canvasRef.value || unregister) return
  unregister = registerCanvas(canvasRef.value, {
    style: props.spectrumStyle,
    bars: props.barCount,
    colors: props.colors,
    glow: props.glow,
    peak: props.peak,
    mirror: props.mirror,
    region: props.region,
    segments: props.segments,
    gapRatio: props.gapRatio,
    lineWidth: props.lineWidth,
    taper: props.taper
  })
}

// 注销当前 canvas 并重新注册（prop 变化时刷新配置）
function reRegister() {
  if (unregister) { unregister(); unregister = null }
  register()
}

// 监听播放状态切换频谱动画
watch(() => props.isPlaying, (v) => {
  setSpectrumActive(v)
})

// 监听视觉 prop 变化，重新注册 canvas
watch(
  () => [props.spectrumStyle, props.barCount, props.mirror, props.glow, props.peak, props.region, props.colors, props.segments, props.gapRatio, props.lineWidth, props.taper],
  () => reRegister()
)

onMounted(() => {
  register()
  if (props.isPlaying) setSpectrumActive(true)
})

onUnmounted(() => {
  if (unregister) { unregister(); unregister = null }
})
</script>

<style scoped>
.audio-visualizer {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  pointer-events: none;
}

.visualizer-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
