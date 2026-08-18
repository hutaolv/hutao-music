// Web Audio 频谱可视化：将 Audio 元素接入 AudioContext，抽取频域数据绘制动感频谱。
// 支持风格（opts.style）：
//   bars  柱状跳动（彩色渐变 + 峰值线 + 发光；mirror=true 时从中心上下镜像对称）
// 说明：
// - createMediaElementSource 对同一个 Audio 只能调用一次，且接入后音频必须经 AudioContext
//   输出（否则无声），因此音量改由 GainNode 控制（audio.volume 会失效）。
// - 同一时间允许多个 canvas 注册，共用一份分析数据；绘制循环由本模块统一驱动。
// - 组件只负责注册/注销 canvas 与切换播放状态。

let audioCtx = null
let source = null
let analyser = null
let gainNode = null
let freqData = null
let active = false
let rafId = null

const targets = new Set()

// 默认彩虹渐变（左→右：青→蓝→紫→粉→橙）
const DEFAULT_COLORS = ['#22d3ee', '#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb923c']

// 将 Audio 元素接入 Web Audio 图：source -> analyser -> gain -> destination
// 返回 { analyser, gainNode }，失败（如环境不支持）返回 null
export function initAudioGraph(audio) {
  if (!audio) return null
  if (audioCtx) return { analyser, gainNode }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  try {
    audioCtx = new AC()
    source = audioCtx.createMediaElementSource(audio)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.72
    gainNode = audioCtx.createGain()
    gainNode.gain.value = 1
    source.connect(analyser)
    analyser.connect(gainNode)
    gainNode.connect(audioCtx.destination)
    freqData = new Uint8Array(analyser.frequencyBinCount)
    return { analyser, gainNode }
  } catch {
    return null
  }
}

// 音量走 GainNode（接入 AudioContext 后 audio.volume 失效）
export function setGraphVolume(v) {
  if (gainNode) gainNode.gain.value = Math.max(0, Math.min(1, Number(v) || 0))
}

// Web Audio 图是否已接入成功（接入后应只走 GainNode 控音，避免双重衰减）
export function isGraphActive() {
  return !!audioCtx
}

// 用户手势触发播放时调用，解除 AudioContext 挂起状态
export function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
}

// 播放状态：true 开始跳动，false 停止并绘制静态待机效果
export function setSpectrumActive(v) {
  active = !!v
  syncLoop()
}

// 注册一个画布。opts: { style, bars, colors, mirror, idleHeight, glow, peak } 返回注销函数
export function registerCanvas(canvas, opts = {}) {
  if (!canvas) return () => {}
  const entry = { canvas, opts, peaks: null, particles: [], history: null }
  targets.add(entry)
  syncLoop()
  return () => {
    targets.delete(entry)
    if (!targets.size && rafId) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }
}

function syncLoop() {
  const want = active && targets.size > 0 && analyser
  if (want && !rafId) {
    rafId = requestAnimationFrame(draw)
  } else if (!want && rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
    drawIdle()
  }
}

function draw() {
  rafId = requestAnimationFrame(draw)
  if (!active || !targets.size || !analyser) return
  analyser.getByteFrequencyData(freqData)
  targets.forEach(entry => {
    const { canvas, opts } = entry
    const ctx = prepareCanvas(canvas)
    if (!ctx) return
    const style = opts.style || 'bars'
    drawBars(entry, ctx, freqData)
  })
}

// 待机状态：清空画布，暂停时频谱不显示
function drawIdle() {
  targets.forEach(({ canvas }) => {
    prepareCanvas(canvas)
  })
}

function prepareCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth || canvas.width
  const h = canvas.clientHeight || canvas.height
  if (!w || !h) return null
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return ctx
}

// 取频域数据的归一化柱高数组（前 70% 频点），并可选做时间平滑
function sampleHeights(entry, data, n) {
  const w0 = entry.canvas.clientWidth || entry.canvas.width
  const h0 = entry.canvas.clientHeight || entry.canvas.height
  const range = Math.floor(data.length * 0.7)
  const arr = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / n) * range)
    arr[i] = data[idx] / 255
  }
  // 时间平滑：历史值 75% + 当前 25%，让波形拖尾更流畅
  if (!entry.history || entry.history.length !== n) {
    entry.history = arr.slice()
  } else {
    for (let i = 0; i < n; i++) entry.history[i] = entry.history[i] * 0.75 + arr[i] * 0.25
    for (let i = 0; i < n; i++) arr[i] = entry.history[i]
  }
  return { arr, range, w: w0, h: h0 }
}

// ==================== 柱状跳动 ====================
function drawBars(entry, ctx, data) {
  const w = entry.canvas.clientWidth || entry.canvas.width
  const h = entry.canvas.clientHeight || entry.canvas.height
  const { bars = 32, colors = DEFAULT_COLORS, min = 0.08, mirror = false, glow = false, peak = true, region = 1, center = 0 } = entry.opts
  const n = Math.min(bars, data.length)
  const { arr } = sampleHeights(entry, data, n)
  const bw = w / n
  // mirror=true 时从画布垂直中心上下对称展开，否则贴底部
  const regionH = mirror ? h * region / 2 : h * region
  const base = mirror ? h / 2 : h - regionH
  // 峰值线：记录每根柱最高点，逐帧缓降
  if (peak) {
    if (!entry.peaks || entry.peaks.length !== n) entry.peaks = new Float32Array(n)
    for (let i = 0; i < n; i++) entry.peaks[i] = Math.max(entry.peaks[i] * 0.95, arr[i])
  }
  for (let i = 0; i < n; i++) {
    // center>0 时按正弦窗收窄：中间饱满、两端衰减，柱子向中心靠拢
    const win = center > 0 ? Math.pow(Math.sin(Math.PI * (n === 1 ? 0.5 : i / (n - 1))), center) : 1
    const v = Math.max(min, arr[i] * win)
    const hh = (min + (1 - min) * v) * regionH
    const peakH = peak && entry.peaks ? entry.peaks[i] * regionH * win : 0
    paintBar(ctx, i, bw, hh, regionH, colors, mirror, base, peakH, v, glow)
  }
  // 播放音量变化时底部整体淡入淡出，增强动态（镜像模式不叠加）
  if (!mirror) {
    const avg = arr.reduce((s, v) => s + v, 0) / n
    ctx.fillStyle = `rgba(99,102,241,${0.03 + avg * 0.05})`
    ctx.fillRect(0, base, w, regionH)
  }
}

function paintBar(ctx, i, bw, hh, regionH, colors, mirror, base, peakH, v, glow) {
  const gap = bw * 0.3
  const x = i * bw + gap / 2
  const ww = bw - gap
  const r = Math.min(2.5, ww / 2)
  const color = interpolateColors(colors, colors.length > 1 ? i / (colors.length - 1) : 0.5)
  // 镜像模式：柱子以 center 为轴向上/向下各长 hh/2，形成上下对称
  const center = mirror ? base : base + regionH
  const top = center - (mirror ? hh / 2 : hh)
  const bottom = center + (mirror ? hh / 2 : 0)
  const grad = ctx.createLinearGradient(0, top, 0, bottom)
  grad.addColorStop(0, withAlpha(color, 0.95))
  grad.addColorStop(1, withAlpha(color, 0.25))
  ctx.fillStyle = grad
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 8 }
  ctx.beginPath()
  roundRect(ctx, x, top, ww, bottom - top, r)
  ctx.fill()
  ctx.shadowBlur = 0
  if (peakH > 0) {
    ctx.fillStyle = withAlpha(color, 0.95)
    if (mirror) {
      ctx.fillRect(x, center - peakH / 2 - 1, ww, 2)
      ctx.fillRect(x, center + peakH / 2 - 1, ww, 2)
    } else {
      ctx.fillRect(x, base + regionH - peakH - 1, ww, 2)
    }
  }
  if (v > 0.6) {
    ctx.fillStyle = withAlpha(lighten(color, 0.35), 0.5 * (v - 0.6))
    ctx.beginPath(); roundRect(ctx, x, top, ww, bottom - top, r); ctx.fill()
  }
}

// ==================== 工具 ====================

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function parseHex(hex) {
  let c = String(hex || '').replace('#', '')
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('')
  const n = parseInt(c, 16)
  if (isNaN(n)) return [130, 140, 248]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

// 按 t(0~1) 在颜色数组间线性插值
function interpolateColors(colors, t) {
  if (!colors || !colors.length) return '#818cf8'
  if (colors.length === 1) return colors[0]
  const x = Math.max(0, Math.min(1, t))
  const pos = x * (colors.length - 1)
  const i = Math.floor(pos)
  const j = Math.min(i + 1, colors.length - 1)
  const f = pos - i
  const a = parseHex(colors[i])
  const b = parseHex(colors[j])
  return toHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f)
}

function withAlpha(hex, alpha) {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`
}

function lighten(hex, amount) {
  const [r, g, b] = parseHex(hex)
  const k = 1 + (amount || 0)
  return toHex(r * k, g * k, b * k)
}