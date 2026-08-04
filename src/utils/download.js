import { getSongUrl } from '../services/api'

// 触发浏览器下载一个地址
function triggerDownload(href, filename) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// 下载歌曲：优先以流式读取计算下载进度（onProgress 回调 0~1），
// 遇跨域等无法流式读取时回退为直接打开地址由浏览器自行下载
export async function downloadSongWithProgress(song, onProgress) {
  if (!song) throw new Error('no song')
  // 下载使用当前选择的音质
  const quality = localStorage.getItem('playQuality') || 'standard'
  const url = await getSongUrl(song, quality)
  if (!url) throw new Error('no url')
  const filename = `${song.title} - ${song.artist}.mp3`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('bad status')
    const total = Number(res.headers.get('content-length')) || 0
    if (!res.body || !total) throw new Error('no stream')
    const reader = res.body.getReader()
    const chunks = []
    let received = 0
    // 分块读取累计进度，避免一次性加载大文件内存占用高
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      onProgress?.(received / total)
    }
    const blob = new Blob(chunks)
    triggerDownload(URL.createObjectURL(blob), filename)
    URL.revokeObjectURL(url)
  } catch (e) {
    // 流式读取失败（如跨域），回退为浏览器直接打开下载
    triggerDownload(url, filename)
  }
}
