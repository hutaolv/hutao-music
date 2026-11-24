// ===== 音频代理磁盘缓存 =====
// 解决的问题：平台下发的播放直链都是 CDN 签发的短时效地址（与签发时刻强绑定），
// 而 WebView 播放一首几分钟的歌会中途多次发 Range 请求续传。
// 一旦续传时地址已过期/被上游掐流，原实现只能 res.destroy()，客户端拿同一个死地址
// 反复重试，听感就是"一顿一顿"。
//
// 这里的策略是"边播边落盘 + 断点续传"：
//   - 首次请求：从上游流式转发给客户端，同时追加写 <hash>.part
//   - 客户端中途断开：.part 保留（已拿到的部分不浪费）
//   - 下次同一首歌请求：先用 .part 里的本地数据补上 [S, P)，再从上游 Range: bytes=P- 续传
//   - 整首下完（partSize === total）：后续请求与 seek 全部走本地，彻底不依赖上游地址
//
// 缓存键优先用调用方给的稳定标识（platform:id:quality）：同一首歌每次解析出的
// 签名地址都不一样，按 URL 做键永远命中不了。
import { createHash } from 'crypto'
import {
  createWriteStream, createReadStream, mkdirSync,
  readdirSync, statSync, unlinkSync, writeFileSync, readFileSync
} from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const AUDIO_CACHE_DIR = resolve(__dirname, 'cache/audio')
// 总量上限：一首 320kbps 约 8MB，500MB 可存 60~100 首，够覆盖用户常听的歌
export const AUDIO_CACHE_MAX_TOTAL = 500 * 1024 * 1024
// 未下完的分片保留 24 小时：太久没听完说明这首不再听了，占着盘没意义
const AUDIO_PART_TTL_MS = 24 * 60 * 60 * 1000

mkdirSync(AUDIO_CACHE_DIR, { recursive: true })

// 缓存键：有稳定标识就用它，否则退回 URL 摘要（直链类、无 platform:id 的场景）
export function audioCacheHash(keyParam, url) {
  const basis = keyParam ? `key:${keyParam}` : `url:${url}`
  return createHash('md5').update(basis).digest('hex')
}

const dataPath = (h) => resolve(AUDIO_CACHE_DIR, `${h}.part`)
const metaPath = (h) => resolve(AUDIO_CACHE_DIR, `${h}.json`)

// 元数据：total（整首字节数，未知时为 0）+ contentType（回盘时还原响应头）
export function readAudioMeta(h) {
  try {
    const m = JSON.parse(readFileSync(metaPath(h), 'utf8'))
    return { total: Number(m.total) || 0, contentType: String(m.contentType || ''), ts: Number(m.ts) || 0 }
  } catch {
    return { total: 0, contentType: '', ts: 0 }
  }
}

export function writeAudioMeta(h, patch) {
  const cur = readAudioMeta(h)
  try {
    writeFileSync(metaPath(h), JSON.stringify({ ...cur, ...patch, ts: Date.now() }))
  } catch { /* 元数据写失败只影响下次命中率，不影响本次播放 */ }
}

export function audioPartSize(h) {
  try { return statSync(dataPath(h)).size } catch { return 0 }
}

export function clearAudioEntry(h) {
  try { unlinkSync(dataPath(h)) } catch {}
  try { unlinkSync(metaPath(h)) } catch {}
}

// 覆盖/续写分片文件：offset 为 0 表示重写，大于 0 表示从末尾追加
// （追加位置必须等于 partSize，调用方保证这一点）
export function createPartWriter(h, offset) {
  return createWriteStream(dataPath(h), { flags: offset > 0 ? 'a' : 'w' })
}

// 从本地分片服务一段字节，返回 Promise，写完/出错都会 resolve
// start/end 为闭区间，end 由调用方保证不超过 partSize-1
export function streamFromDisk(res, h, start, end) {
  return new Promise((resolvePromise) => {
    const rs = createReadStream(dataPath(h), { start, end })
    let settled = false
    const done = () => { if (!settled) { settled = true; resolvePromise() } }
    rs.on('error', () => { if (!res.destroyed) res.destroy(); done() })
    rs.on('end', done)
    rs.pipe(res, { end: false })
  })
}

// 解析客户端 Range 头。返回 { start, end } 或 null（无 Range / 无法解析）
// end 为 null 表示"到文件末尾"
export function parseRange(header) {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim())
  if (!m) return null
  const start = m[1] === '' ? null : Number(m[1])
  const end = m[2] === '' ? null : Number(m[2])
  // "bytes=-500" 表示最后 500 字节：需要总长度才能换算，交给调用方处理
  if (start === null) return { suffix: end }
  return { start, end }
}

// 清理：删除超龄的分片与元数据；总量超限时按最旧（mtime）淘汰
export function cleanAudioCache() {
  try {
    const now = Date.now()
    const entries = new Map()   // hash -> { size, mtimeMs }
    for (const name of readdirSync(AUDIO_CACHE_DIR)) {
      const p = resolve(AUDIO_CACHE_DIR, name)
      let st
      try { st = statSync(p) } catch { continue }
      const isPart = name.endsWith('.part')
      const isMeta = name.endsWith('.json')
      if (!isPart && !isMeta) { try { unlinkSync(p) } catch {}; continue }
      // 分片超龄：连元数据一起删掉，避免留下"知道 total 但没有数据"的空壳
      if (now - st.mtimeMs > AUDIO_PART_TTL_MS) {
        try { unlinkSync(p) } catch {}
        continue
      }
      if (isPart) entries.set(name.slice(0, -5), { size: st.size, mtimeMs: st.mtimeMs })
    }
    let total = 0
    for (const e of entries.values()) total += e.size
    if (total > AUDIO_CACHE_MAX_TOTAL) {
      const sorted = [...entries.entries()].sort((a, b) => a[1].mtimeMs - b[1].mtimeMs)
      for (const [h, e] of sorted) {
        if (total <= AUDIO_CACHE_MAX_TOTAL) break
        clearAudioEntry(h)
        total -= e.size
      }
    }
  } catch { /* 清理失败不影响主流程 */ }
}

cleanAudioCache()
setInterval(cleanAudioCache, 60 * 60 * 1000)   // 每小时清一次

export function audioCacheStats() {
  try {
    let files = 0, bytes = 0, complete = 0
    for (const name of readdirSync(AUDIO_CACHE_DIR)) {
      if (!name.endsWith('.part')) continue
      const p = resolve(AUDIO_CACHE_DIR, name)
      try {
        const st = statSync(p)
        files++
        bytes += st.size
        const h = name.slice(0, -5)
        const { total } = readAudioMeta(h)
        if (total > 0 && st.size >= total) complete++
      } catch {}
    }
    return { files, complete, bytes }
  } catch {
    return { files: 0, complete: 0, bytes: 0 }
  }
}
