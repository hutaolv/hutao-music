import { registerPlugin } from '@capacitor/core'
import { addDownload } from './storage.js'
import { getLyrics } from '../services/api'
import { usePlayerStore } from '../stores/player.js'

// 手机本地存储目录候选：优先公共「文档」目录（用户可见），
// Android 11+ 沙盒限制写入失败时逐级回退到应用专属目录
const WRITE_DIRS = ['DOCUMENTS', 'EXTERNAL', 'DATA']
// base64 走插件桥接有内存上限，超过只入「我的下载」不落盘
const MAX_NATIVE_SIZE = 50 * 1024 * 1024
// 系统下载后读回文件的分片大小（桥接单条消息体积限制）
const READ_CHUNK = 2 * 1024 * 1024
// DownloadManager 状态：1排队 2进行中 4暂停 8完成 16失败
const DM_SUCCESS = 8
const DM_FAILED = 16
const DM_TIMEOUT = 15 * 60 * 1000
// 流式下载停滞超时：15s 收不到任何新字节（含响应头）视为半开连接/上游挂起，主动掐断走重试，
// 否则 reader.read() 永远 pending → 进度冻结、isDownloading 锁死按钮无法再下载
const STREAM_IDLE_MS = 15000

const EXT_BY_MIME = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav'
}

function showToast(text) {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
    padding: '10px 20px', borderRadius: '10px',
    background: 'rgba(18,18,30,0.88)', backdropFilter: 'blur(12px)',
    color: '#f0f0f5', fontSize: '13px', zIndex: '9999',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    transition: 'opacity 0.3s', opacity: '1'
  })
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300) }, 3000)
}

// 去掉文件系统非法字符，避免 writeFile 抛错
function sanitizeFilename(name) {
  let base = String(name || '').replace(/[\\/:*?"<>|\r\n\t]+/g, '_').trim()
  base = base.replace(/[. ]+$/g, '')
  if (base.length > 80) base = base.slice(0, 80)
  return base || 'song'
}

// 按音频真实类型补全/纠正扩展名
function normalizeFilename(name, blob) {
  const base = sanitizeFilename(name)
  const mime = String(blob.type || '').split(';')[0].trim().toLowerCase()
  const ext = EXT_BY_MIME[mime]
  if (!ext) return /\.(mp3|flac|m4a|aac|ogg|wav)$/i.test(base) ? base : `${base}.mp3`
  return /\.[^.]+$/.test(base) ? base.replace(/\.[^.]+$/, ext) : `${base}${ext}`
}

function filenameFromSong(song) {
  const title = song?.title || 'song'
  const artist = song?.artist && song.artist !== '未知艺术家' ? song.artist : ''
  return artist ? `${title} - ${artist}` : title
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(reader.error || new Error('read blob failed'))
    reader.readAsDataURL(blob)
  })
}

function openInBrowser(url) {
  try { window.open(url, '_system') } catch (e) { /* WebView 不支持时忽略 */ }
}

// 浏览器兜底下载时把文件名带给服务端，否则浏览器按 URL 末段命名成 "audio"
function withFilenameParam(url, filename) {
  try {
    const u = new URL(url, window.location.href)
    u.searchParams.set('filename', filename)
    return u.toString()
  } catch (e) {
    return url
  }
}

// 系统下载插件（MainActivity 注册的本地插件），网页端不可用
let sysDownloader
function getSystemDownloader() {
  if (sysDownloader !== undefined) return sysDownloader
  try {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null
    sysDownloader = cap && cap.isNativePlatform && cap.isNativePlatform()
      ? registerPlugin('SystemDownloader')
      : false
  } catch (e) {
    sysDownloader = false
  }
  return sysDownloader
}

// DownloadManager 只认 http/https 绝对地址
function absUrl(url) {
  try { return new URL(url, window.location.href).toString() } catch (e) { return url }
}

// 系统下载前只能靠元数据猜扩展名（拿不到响应头 Content-Type）
function guessMime(song) {
  const m = String(song?.mimeType || '').split(';')[0].trim().toLowerCase()
  return m && EXT_BY_MIME[m] ? m : 'audio/mpeg'
}

function b64ToBytes(b64) {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

// 轮询系统下载状态直到完成（通知栏进度条由系统自己画，这里只等结果）
async function waitSystemDownload(sd, id) {
  const deadline = Date.now() + DM_TIMEOUT
  for (;;) {
    const info = await sd.query({ id })
    if (info.status === DM_SUCCESS) return info
    if (info.status === DM_FAILED) {
      try { await sd.cancel({ id }) } catch (e) { /* 顺手清掉失败记录 */ }
      throw new Error(`系统下载失败（reason ${info.reason}）`)
    }
    if (Date.now() > deadline) {
      try { await sd.cancel({ id }) } catch (e) { /* 忽略取消失败 */ }
      throw new Error('系统下载超时')
    }
    await new Promise(r => setTimeout(r, 500))
  }
}

// 系统下载 + 读回字节入库：通知栏实时进度、断点重试、文件落系统下载目录、全程免存储权限
async function downloadViaSystem(url, song, baseName) {
  const sd = getSystemDownloader()
  if (!sd) throw new Error('插件不可用')

  const mime = guessMime(song)
  const filename = `${baseName}${EXT_BY_MIME[mime] || '.mp3'}`
  const enq = await sd.enqueue({
    url: absUrl(withFilenameParam(url, filename)),
    filename,
    mimeType: mime
  })
  showToast('已开始下载，通知栏可查看进度')

  const info = await waitSystemDownload(sd, enq.id)

  // 分片读回写进 IndexedDB（离线可播）；超大文件只存元数据，文件本身已在下载目录
  let blob = null
  if (info.total > 0 && info.total <= MAX_NATIVE_SIZE) {
    try {
      const parts = []
      let offset = 0
      for (;;) {
        const chunk = await sd.getContent({ id: enq.id, offset, length: READ_CHUNK })
        if (chunk.data) parts.push(chunk.data)
        if (chunk.done || !chunk.data) break
        offset = chunk.offset
      }
      blob = new Blob(parts.map(b64ToBytes), { type: mime })
    } catch (e) {
      console.warn('[下载] 读回系统下载文件失败，仅存元数据:', e && e.message)
    }
  }

  if (song) {
    const lrc = await resolveLyricsForSave(song)
    await persistDownload(buildDownloadSong(song, blob || { type: mime, size: info.total || 0 }, url, lrc), blob)
    // 通知首页刷新"我的下载"（keep-alive 下 onMounted 只跑一次）
    try { usePlayerStore().touchDlVersion() } catch (e) { console.warn('[下载] 刷新下载列表失败:', e && e.message) }
  }

  if (!blob) {
    showToast(info.total > MAX_NATIVE_SIZE ? '文件较大，已存入我的下载' : '已保存到下载目录')
    return true
  }
  showToast(enq.dir === 'public' ? '已保存到下载目录' : '已保存到应用存储')
  return true
}

// 进度上报到播放 store（PC 播放条按钮 / 歌词页下载行读取显示）
// loaded/total 字节；total 为 0 表示响应无 Content-Length，UI 改显已下载字节数
function reportDlProgress(loaded, total) {
  try {
    const store = usePlayerStore()
    store.dlProgress = total > 0
      ? Math.min(100, Math.round((loaded / total) * 100))
      : (loaded > 0 ? -2 : 0)
    store.dlProgressLoaded = loaded
  } catch (e) { /* store 未初始化时忽略 */ }
}

function resetDlProgress() {
  try {
    const store = usePlayerStore()
    store.dlProgress = -1
    store.dlProgressLoaded = 0
  } catch (e) { /* 忽略 */ }
}

// 音频代理有并发流上限（429）/ 上游偶发 502，短延迟重试比直接兜底浏览器成功率高得多
// onProgress(loaded, total)：流式分块读取，边下边报进度
async function fetchBlob(url, onProgress, retries = 2) {
  let lastErr = null
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController()
    let lastActivity = performance.now()
    const watchdog = setInterval(() => {
      if (performance.now() - lastActivity > STREAM_IDLE_MS) {
        try { ctrl.abort() } catch (e) { /* 已中止时忽略 */ }
      }
    }, 1000)
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      lastActivity = performance.now()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // 无流式响应体的老浏览器：退化为一次性读取，读完补报一次
      if (!res.body || !res.body.getReader) {
        const blob = await res.blob()
        if (!blob.size) throw new Error('empty body')
        if (onProgress) onProgress(blob.size, blob.size)
        return blob
      }
      const total = Number(res.headers.get('content-length')) || 0
      const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      const reader = res.body.getReader()
      const parts = []
      let loaded = 0
      let lastReport = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        lastActivity = performance.now()
        parts.push(value)
        loaded += value.length
        // 150ms 节流上报，避免高频更新触发密集渲染
        const now = performance.now()
        if (onProgress && now - lastReport >= 150) {
          lastReport = now
          onProgress(loaded, total)
        }
      }
      if (!loaded) throw new Error('empty body')
      if (onProgress) onProgress(loaded, total)
      return new Blob(parts, { type })
    } catch (e) {
      lastErr = e
      if (i < retries) {
        // 重试从头下载，进度归零
        if (onProgress) onProgress(0, 0)
        await new Promise(r => setTimeout(r, 600 * (i + 1)))
      }
    } finally {
      clearInterval(watchdog)
    }
  }
  throw lastErr || new Error('fetch failed')
}

function saveWebFile(blob, filename) {
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(blobUrl)
  }, 100)
}

// 与音频下载并行预取歌词：入库时带上，播放秒开且离线可看
function startLyricsFetch(song) {
  if (!song) return Promise.resolve(null)
  return getLyrics(song).catch(() => null)
}

// 限时等歌词结果：apiFetch 无超时，慢/失败不阻塞下载完成（缺了播放时在线兜底即可）
function awaitLyrics(promise, ms = 12000) {
  if (!promise) return Promise.resolve(null)
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms))
  ])
}

// 入库前取歌词：正在播的歌直接复用内存里已加载的（播放时拉过，避免与音频抓取抢连接池被排队/限流）；
// 否则现拉一次并限时等待，拿不到就不写字段，播放时在线兜底
async function resolveLyricsForSave(song) {
  try {
    if (song) {
      const store = usePlayerStore()
      if (store.currentSong && store.currentSong.id === song.id &&
          (store.rawLyrics || store.rawTransLyrics)) {
        return { lyrics: store.rawLyrics || '', transLyrics: store.rawTransLyrics || '' }
      }
    }
    return await awaitLyrics(startLyricsFetch(song))
  } catch (e) {
    return null
  }
}

// 下载列表条目：加 download_ 前缀 + 保留在线地址（Blob 丢失时仍可播放）
function buildDownloadSong(song, blob, url, lrc) {
  const rawId = String(song.id ?? '')
  const entry = {
    ...song,
    id: rawId.startsWith('download_') ? rawId : `download_${rawId}`,
    fromDownload: true,
    audioUrl: url,
    mimeType: blob.type || 'audio/mpeg',
    fileSize: blob.size
  }
  // 存下歌词供离线播放使用；拿不到就不写字段，播放时在线拉兜底
  if (lrc && (lrc.lyrics || lrc.transLyrics)) {
    entry.lyrics = lrc.lyrics || ''
    entry.transLyrics = lrc.transLyrics || ''
  }
  return entry
}

// 入库：优先连音频一起存（离线可播），空间不足时退化为只存元数据
async function persistDownload(dlSong, blob) {
  try {
    await addDownload(dlSong, blob)
  } catch (e) {
    console.warn('[下载] 音频入库失败，仅存元数据:', e && e.message)
    try { await addDownload(dlSong, null) } catch (e2) { console.error('[下载] 入库失败:', e2) }
  }
}

async function writeToNative(fs, data, filename) {
  let lastErr = null
  for (const directory of WRITE_DIRS) {
    try {
      await fs.writeFile({ path: filename, data, directory, recursive: true })
      return directory
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('write failed')
}

/**
 * 下载当前歌曲：抓取一次音频 → 入库「我的下载」→ 原生落盘 / 浏览器下载
 * @param {string} url 音频地址
 * @param {object} song 歌曲元数据（可选，提供后写入下载列表）
 * @returns {Promise<boolean>} 是否成功拿到音频
 */
export async function downloadSong(url, song) {
  if (!url) return false
  // 清掉上一次的进度残留（原生端走系统通知栏进度，这里保持 -1 显示转圈）
  resetDlProgress()

  const cap = typeof window !== 'undefined' ? window.Capacitor : null
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform())
  const fs = isNative && cap.Plugins ? cap.Plugins.Filesystem : null

  const baseName = sanitizeFilename(filenameFromSong(song))

  // 原生端优先交给系统 DownloadManager：通知栏实时进度条 + 断点重试 + 文件落系统下载目录
  if (isNative) {
    try {
      return await downloadViaSystem(url, song, baseName)
    } catch (e) {
      // 插件不可用 / 系统下载失败时回退到下面的应用内抓取流程
      console.warn('[下载] 系统下载失败，回退应用内下载:', e && e.message)
    }
  }

  let blob = null
  try {
    reportDlProgress(0, 0)
    blob = await fetchBlob(url, reportDlProgress)
  } catch (e) {
    console.error('[下载] 音频获取失败:', e && e.message)
    resetDlProgress()
    if (isNative) {
      // 原生端跳系统浏览器接管下载（带上文件名，由服务端 Content-Disposition 决定保存名）
      openInBrowser(withFilenameParam(url, `${baseName}.mp3`))
      showToast('下载失败，已在浏览器中打开')
    } else {
      // 网页端无跳转兜底，只提示重试
      showToast('下载失败，请检查网络后重试')
    }
    return false
  }

  const fileTitle = normalizeFilename(baseName, blob)

  if (song) {
    const lrc = await resolveLyricsForSave(song)
    await persistDownload(buildDownloadSong(song, blob, url, lrc), blob)
    // 通知首页刷新"我的下载"：App.vue 用 keep-alive 缓存首页，onMounted 只跑一次，
    // 不主动发信号的话新下载的歌要刷新页面才看得到
    try { usePlayerStore().touchDlVersion() } catch (e) { console.warn('[下载] 刷新下载列表失败:', e && e.message) }
  }

  if (!fs) {
    saveWebFile(blob, fileTitle)
    showToast('下载完成')
    return true
  }

  if (blob.size > MAX_NATIVE_SIZE) {
    showToast('文件较大，已存入我的下载')
    return true
  }

  try {
    const data = await blobToBase64(blob)
    const dir = await writeToNative(fs, data, fileTitle)
    showToast(dir === 'DOCUMENTS' ? '已保存到文档目录' : '已保存到应用存储')
    return true
  } catch (e) {
    console.error('[下载] 本地写入失败:', e && e.message)
    showToast('已存入我的下载')
    return true
  }
}
