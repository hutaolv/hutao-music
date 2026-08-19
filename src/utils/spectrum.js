// Web Audio 频谱可视化：将 Audio 元素接入 AudioContext，抽取频域数据绘制动感频谱。
// 支持风格（opts.style）：
//   bars    柱状跳动（彩色渐变 + 峰值线 + 发光；mirror=true 时从中心上下镜像对称）
//   wave    波形频谱（平滑曲线 + 渐变填充 + 发光描边）
//   circle  圆形径向频谱（围绕中心向外扩散的柱状环）
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

// 注册一个画布。opts: { style, bars, colors, mirror, idleHeight, glow, peak, region, center } 返回注销函数
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
    switch (style) {
      case 'wave': drawWave(entry, ctx, freqData); break
      case 'circle': drawCircle(entry, ctx, freqData); break
      default: drawBars(entry, ctx, freqData)
    }
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

// ==================== 波形频谱 ====================
function drawWave(entry, ctx, data) {
  const w = entry.canvas.clientWidth || entry.canvas.width
  const h = entry.canvas.clientHeight || entry.canvas.height
  const { colors = DEFAULT_COLORS, min = 0.06, mirror = false, glow = true, region = 1 } = entry.opts
  const n = Math.min(128, Math.floor(data.length * 0.7))
  const { arr } = sampleHeights(entry, data, n)
  const regionH = mirror ? h * region / 2 : h * region
  const base = mirror ? h / 2 : h - regionH

  // 构造平滑波形点
  const points = []
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w
    const v = Math.max(min, arr[i])
    const hh = (min + (1 - min) * v) * regionH
    const y = mirror ? base - hh / 2 : base + regionH - hh
    points.push({ x, y, v })
  }

  // 渐变填充区域
  const fillGrad = ctx.createLinearGradient(0, base, 0, base + regionH)
  fillGrad.addColorStop(0, withAlpha(colors[2] || '#818cf8', 0.5))
  fillGrad.addColorStop(1, withAlpha(colors[4] || '#f472b6', 0.05))
  ctx.fillStyle = fillGrad
  ctx.beginPath()
  ctx.moveTo(0, base + regionH)
  drawSmoothCurve(ctx, points, 0, base + regionH)
  ctx.closePath()
  ctx.fill()

  // 波形描边
  const strokeColor = interpolateColors(colors, 0.4)
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = 2
  if (glow) { ctx.shadowColor = strokeColor; ctx.shadowBlur = 10 }
  ctx.beginPath()
  drawSmoothCurve(ctx, points, null, null)
  ctx.stroke()
  ctx.shadowBlur = 0

  // 镜像对称波形（下半部分）
  if (mirror) {
    const mirrorPoints = points.map(p => ({ x: p.x, y: h - (p.y - base) + base, v: p.v }))
    const fillGrad2 = ctx.createLinearGradient(0, base, 0, base + regionH)
    fillGrad2.addColorStop(0, withAlpha(colors[2] || '#818cf8', 0.5))
    fillGrad2.addColorStop(1, withAlpha(colors[4] || '#f472b6', 0.05))
    ctx.fillStyle = fillGrad2
    ctx.beginPath()
    ctx.moveTo(0, base)
    drawSmoothCurve(ctx, mirrorPoints, 0, base)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 2
    if (glow) { ctx.shadowColor = strokeColor; ctx.shadowBlur = 10 }
    ctx.beginPath()
    drawSmoothCurve(ctx, mirrorPoints, null, null)
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

// 绘制平滑贝塞尔曲线，closeY/closeX 用于封闭填充区域
function drawSmoothCurve(ctx, points, closeX, closeY) {
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      ctx.moveTo(points[i].x, points[i].y)
    } else {
      const xc = (points[i].x + points[i - 1].x) / 2
      const yc = (points[i].y + points[i - 1].y) / 2
      ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc)
    }
  }
  if (closeX !== null && closeY !== null) {
    ctx.lineTo(points[points.length - 1].x, closeY)
    ctx.lineTo(closeX, closeY)
  }
}

// ==================== LED 环形频谱 ====================
// 围绕圆心向外辐射的分段 LED 柱状频谱，每根柱由多个小段组成，段间有间隙，
// 柱子颜色沿圆周呈彩虹渐变，高音量段更亮并带发光；mirror=true 时内外双向辐射。
function drawCircle(entry, ctx, data) {
  const w = entry.canvas.clientWidth || entry.canvas.width
  const h = entry.canvas.clientHeight || entry.canvas.height
  const {
    bars = 72,           // 环形柱数（建议 60~120）
    colors = DEFAULT_COLORS,
    min = 0.05,          // 最小柱高比例
    glow = true,
    region = 1,
    mirror = false,       // true=内外双向辐射
    segments = 10,        // 每根柱的 LED 段数
    gapRatio = 0.35,      // 段间隙占段高的比例
    innerRadiusRatio = 0.25, // 内环半径占画布短边的比例
    maxBarLenRatio = 0.30 // 柱子最大长度占画布短边的比例
  } = entry.opts

  const n = Math.min(bars, Math.floor(data.length * 0.7))
  const { arr } = sampleHeights(entry, data, n)

  const cx = w / 2
  const cy = h / 2
  // 内环半径：由 innerRadiusRatio 控制，确保不遮挡中心内容（如封面图片）
  const baseRadius = Math.min(w, h) * innerRadiusRatio * region
  // 柱子最大长度
  const maxBarLen = Math.min(w, h) * maxBarLenRatio

  // 柱宽对应弧度（留 gapRatio 的间隙）
  const arcPerBar = (Math.PI * 2) / n
  const barArc = arcPerBar * (1 - gapRatio)

  // 峰值追踪
  if (!entry.peaks || entry.peaks.length !== n) entry.peaks = new Float32Array(n)
  for (let i = 0; i < n; i++) entry.peaks[i] = Math.max(entry.peaks[i] * 0.92, arr[i])

  // 平均音量（用于中心呼吸效果）
  const avg = arr.reduce((s, v) => s + v, 0) / n

  // ---------- 绘制底环（LED 灯条轨道） ----------
  ctx.strokeStyle = withAlpha('#ffffff', 0.04)
  ctx.lineWidth = Math.max(2, (arcPerBar * baseRadius) * 0.5)
  ctx.beginPath()
  ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2)
  ctx.stroke()

  // ---------- 绘制每根 LED 柱 ----------
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const v = Math.max(min, arr[i])
    const peakV = entry.peaks[i]
    const color = interpolateColors(colors, i / Math.max(1, n - 1))

    // 每段的高度和间隙
    const totalBarLen = v * maxBarLen
    const segH = totalBarLen / segments
    const segGap = segH * gapRatio * 0.5

    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    // 法线方向（垂直于柱子，用于柱宽偏移）
    const nx = -sinA
    const ny = cosA
    const halfW = (arcPerBar * baseRadius * 0.38) / 2

    for (let s = 0; s < segments; s++) {
      // 从内向外：每段之间留间隙
      const r1 = baseRadius + s * (segH + segGap)
      const r2 = r1 + segH

      if (r2 > baseRadius + maxBarLen + 5) break

      // 该段的亮度：越靠外越亮（低段衰减），峰值段额外高亮
      const segNorm = s / segments
      const brightness = 0.25 + segNorm * 0.55 + (v > 0.7 ? 0.2 : 0)
      // 峰值段标记（最顶端的段）
      const isPeak = peakV > min && s === Math.floor(peakV * segments) - 1

      const segColor = isPeak ? lighten(color, 0.3) : color
      const alpha = Math.min(1, brightness + (isPeak ? 0.15 : 0))

      // 四个角坐标（梯形，外侧稍宽）
      const w1 = halfW * 0.85
      const w2 = halfW * 1.0
      const p1x = cx + cosA * r1 - nx * w1
      const p1y = cy + sinA * r1 - ny * w1
      const p2x = cx + cosA * r1 + nx * w1
      const p2y = cy + sinA * r1 + ny * w1
      const p3x = cx + cosA * r2 + nx * w2
      const p3y = cy + sinA * r2 + ny * w2
      const p4x = cx + cosA * r2 - nx * w2
      const p4y = cy + sinA * r2 - ny * w2

      // 段渐变（内暗外亮）
      const grad = ctx.createLinearGradient(
        cx + cosA * r1, cy + sinA * r1,
        cx + cosA * r2, cy + sinA * r2
      )
      grad.addColorStop(0, withAlpha(segColor, alpha * 0.5))
      grad.addColorStop(1, withAlpha(segColor, alpha))

      ctx.fillStyle = grad
      if (glow && segNorm > 0.3) {
        ctx.shadowColor = segColor
        ctx.shadowBlur = 4 + segNorm * 6
      }
      ctx.beginPath()
      ctx.moveTo(p1x, p1y)
      ctx.lineTo(p2x, p2y)
      ctx.lineTo(p3x, p3y)
      ctx.lineTo(p4x, p4y)
      ctx.closePath()
      ctx.fill()
      ctx.shadowBlur = 0

      // 峰值段额外高光
      if (isPeak) {
        ctx.fillStyle = withAlpha(lighten(color, 0.5), 0.4)
        ctx.beginPath()
        ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y)
        ctx.lineTo(p3x, p3y); ctx.lineTo(p4x, p4y)
        ctx.closePath()
        ctx.fill()
      }
    }

    // ---------- mirror: 内侧反向辐射 ----------
    if (mirror) {
      const innerBarLen = v * maxBarLen * 0.6
      const innerSegH = innerBarLen / segments
      const innerSegGap = innerSegH * gapRatio * 0.5

      for (let s = 0; s < segments; s++) {
        const r1 = baseRadius - s * (innerSegH + innerSegGap)
        const r2 = r1 - innerSegH
        if (r2 < baseRadius - maxBarLen * 0.6 - 5) break

        const segNorm = s / segments
        const brightness = 0.2 + segNorm * 0.45
        const alpha = Math.min(1, brightness)
        const w1 = halfW * (1.0 - segNorm * 0.15)
        const w2 = halfW * (0.85 - segNorm * 0.1)

        const p1x = cx + cosA * r1 - nx * w1
        const p1y = cy + sinA * r1 - ny * w1
        const p2x = cx + cosA * r1 + nx * w1
        const p2y = cy + sinA * r1 + ny * w1
        const p3x = cx + cosA * r2 + nx * w2
        const p3y = cy + sinA * r2 + ny * w2
        const p4x = cx + cosA * r2 - nx * w2
        const p4y = cy + sinA * r2 - ny * w2

        const grad = ctx.createLinearGradient(
          cx + cosA * r1, cy + sinA * r1,
          cx + cosA * r2, cy + sinA * r2
        )
        grad.addColorStop(0, withAlpha(color, alpha * 0.5))
        grad.addColorStop(1, withAlpha(color, alpha * 0.15))

        ctx.fillStyle = grad
        if (glow && segNorm > 0.4) {
          ctx.shadowColor = color
          ctx.shadowBlur = 3 + segNorm * 4
        }
        ctx.beginPath()
        ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y)
        ctx.lineTo(p3x, p3y); ctx.lineTo(p4x, p4y)
        ctx.closePath()
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }
  }

  // ---------- 中心呼吸光晕 ----------
  const glowR = baseRadius * (0.92 + avg * 0.08)
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
  innerGrad.addColorStop(0, withAlpha(colors[2] || '#818cf8', 0.06 + avg * 0.06))
  innerGrad.addColorStop(0.6, withAlpha(colors[3] || '#c084fc', 0.03 + avg * 0.03))
  innerGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = innerGrad
  ctx.beginPath()
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
  ctx.fill()

  // 中心细环轮廓
  ctx.strokeStyle = withAlpha(colors[2] || '#818cf8', 0.12 + avg * 0.1)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2)
  ctx.stroke()
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
