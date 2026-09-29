import { addDownload } from './storage.js'
import { usePlayerStore } from '../stores/player.js'

// 手机本地存储目录候选：优先公共「文档」目录（用户可见），
// Android 11+ 沙盒限制写入失败时逐级回退到应用专属目录
const WRITE_DIRS = ['DOCUMENTS', 'EXTERNAL', 'DATA']
// base64 走插件桥接有内存上限，超过只入「我的下载」不落盘
const MAX_NATIVE_SIZE = 50 * 1024 * 1024

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

// 音频代理有并发流上限（429）/ 上游偶发 502，短延迟重试比直接兜底浏览器成功率高得多
async function fetchBlob(url, retries = 2) {
  let lastErr = null
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      if (!blob.size) throw new Error('empty body')
      return blob
    } catch (e) {
      lastErr = e
      if (i < retries) await new Promise(r => setTimeout(r, 600 * (i + 1)))
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

// 下载列表条目：加 download_ 前缀 + 保留在线地址（Blob 丢失时仍可播放）
function buildDownloadSong(song, blob, url) {
  const rawId = String(song.id ?? '')
  return {
    ...song,
    id: rawId.startsWith('download_') ? rawId : `download_${rawId}`,
    fromDownload: true,
    audioUrl: url,
    mimeType: blob.type || 'audio/mpeg',
    fileSize: blob.size
  }
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

  const cap = typeof window !== 'undefined' ? window.Capacitor : null
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform())
  const fs = isNative && cap.Plugins ? cap.Plugins.Filesystem : null

  const baseName = sanitizeFilename(filenameFromSong(song))

  let blob = null
  try {
    blob = await fetchBlob(url)
  } catch (e) {
    console.error('[下载] 音频获取失败:', e && e.message)
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
    await persistDownload(buildDownloadSong(song, blob, url), blob)
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
