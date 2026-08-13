// PWA 图标生成脚本：用纯 Node（zlib + 手写 PNG 编码）绘制"胡桃音悦"图标
// 图标 = 圆角渐变背景 + 白色双音符；2x 超采样后再降采样，边缘平滑
// 运行：node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../public/icons')

// ===== PNG 编码（零依赖） =====
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type RGBA
  // 每行前置 1 字节 filter=0，再压缩
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// ===== 绘制 =====
// 在 SS 倍尺寸的浮点画布上画图，最后 2x2 平均降采样得到最终像素（抗锯齿）
function render(size, noteScale) {
  const SS = 2
  const big = size * SS
  const canvas = new Float32Array(big * big * 4)

  // 渐变背景色：左上 accent -> 右下 accent-dark
  const c1 = [0x63, 0x66, 0xf1]
  const c2 = [0x4f, 0x46, 0xe5]

  const R = size * 0.2 * SS // 圆角半径（放大到超采样画布）

  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const t = (x + y) / (2 * big)
      const r = c1[0] + (c2[0] - c1[0]) * t
      const g = c1[1] + (c2[1] - c1[1]) * t
      const b = c1[2] + (c2[2] - c1[2]) * t
      // 圆角矩形判断：到最近角点的距离 <= R
      const cx = Math.max(R - x, 0, x - (big - 1 - R))
      const cy = Math.max(R - y, 0, y - (big - 1 - R))
      const inside = Math.hypot(cx, cy) <= R
      if (!inside) continue
      const i = (y * big + x) * 4
      canvas[i] = r
      canvas[i + 1] = g
      canvas[i + 2] = b
      canvas[i + 3] = 255
    }
  }

  // 音符：在 [0,1] 归一化坐标中画双音符（两个头 + 两条符干 + 顶部横梁），noteScale 控制整体缩放居中
  const P = big
  const s = P * 0.92 * noteScale
  const offX = P * (0.5 - 0.5 * 0.92 * noteScale)
  const offY = P * (0.5 - 0.5 * 0.92 * noteScale)
  const U = u => u * s + offX
  const V = v => v * s + offY

  // 音符头：两个实心圆
  const heads = [[0.35, 0.70, 0.11], [0.65, 0.70, 0.11]]
  // 符干：两条竖矩形
  const stems = [[0.31, 0.28, 0.08, 0.42], [0.61, 0.28, 0.08, 0.42]]
  // 横梁：顶部连接两条符干的水平矩形
  const beams = [[0.30, 0.23, 0.40, 0.09]]

  const px = U(0.5)
  const py = V(0.5)
  const maxR = V(0.11) + 1

  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      let d = Infinity
      for (const [cx, cy, cr] of heads) {
        d = Math.min(d, Math.hypot(x - U(cx), y - V(cy)) - V(cr))
      }
      for (const [x1, y1, w, h] of stems) {
        d = Math.min(d, Math.max(Math.abs(x - U(x1) - U(w) / 2) - U(w) / 2, Math.abs(y - V(y1) - V(h) / 2) - V(h) / 2))
      }
      for (const [x1, y1, w, h] of beams) {
        d = Math.min(d, Math.max(Math.abs(x - U(x1) - U(w) / 2) - U(w) / 2, Math.abs(y - V(y1) - V(h) / 2) - V(h) / 2))
      }
      // 硬边缘（已超采样，边缘自然平滑）
      if (d > 0) continue
      if (x < px - maxR || x > px + maxR) continue
      if (y < py - maxR || y > py + maxR) continue
      const i = (y * big + x) * 4
      canvas[i] = 255
      canvas[i + 1] = 255
      canvas[i + 2] = 255
      canvas[i + 3] = 255
    }
  }

  // 2x2 平均降采样
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * big + (x * SS + dx)) * 4
          r += canvas[i]
          g += canvas[i + 1]
          b += canvas[i + 2]
          a += canvas[i + 3]
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      out[o] = Math.round(r / n)
      out[o + 1] = Math.round(g / n)
      out[o + 2] = Math.round(b / n)
      out[o + 3] = Math.round(a / n)
    }
  }
  return out
}

// ===== 输出 =====
mkdirSync(OUT, { recursive: true })

// 图标尺寸定义：正常图标与"自适应图标"（maskable）共用同色背景，内容更居中留白
const targets = [
  { name: 'icon-192.png', size: 192, scale: 0.92 },
  { name: 'icon-512.png', size: 512, scale: 0.92 },
  { name: 'icon-maskable-512.png', size: 512, scale: 0.62 } // maskable 预留安全区
]

for (const t of targets) {
  const png = encodePNG(t.size, t.size, render(t.size, t.scale))
  writeFileSync(resolve(OUT, t.name), png)
  console.log('已生成', t.name, t.size + 'x' + t.size)
}