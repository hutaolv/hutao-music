// 下载歌曲工具：原生优先（Capacitor Filesystem），网页兜底（blob objectURL + <a>）

// 页面内轻提示：显示下载完成/失败状态，3秒后自动消失
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

export async function downloadSong(url, filename) {
  if (!url) return

  const cap = typeof window !== 'undefined' && window.Capacitor
  const isNative = cap && cap.isNativePlatform && cap.isNativePlatform()

  // 原生平台（Android APK）：通过 Capacitor Filesystem 插件写入公共下载目录
  if (isNative && cap.Plugins?.Filesystem) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const reader = new FileReader()
      reader.onloadend = async () => {
        try {
          const base64Data = reader.result.split(',')[1]
          await cap.Plugins.Filesystem.writeFile({
            path: filename,
            data: base64Data,
            directory: 'DOWNLOADS'
          })
          console.log('下载完成:', filename)
          showToast(`已保存到 Download/${filename}`)
        } catch (writeErr) {
          console.error('Filesystem 写入失败，回退浏览器下载:', writeErr)
          showToast('保存失败，尝试浏览器下载...')
          fallbackDownload(url, filename)
        }
      }
      reader.readAsDataURL(blob)
    } catch (e) {
      console.error('原生下载失败，回退浏览器下载:', e)
      fallbackDownload(url, filename)
    }
    return
  }

  // 网页版兜底：fetch 拿 blob → 本地 objectURL → <a download>
  fallbackDownload(url, filename)
}

// 浏览器兜底下载：fetch 为 blob，用本地 objectURL 触发下载（兼容移动端）
function fallbackDownload(url, filename) {
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.blob()
    })
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename || 'song.mp3'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(blobUrl)
      }, 100)
    })
    .catch(e => {
      console.error('下载失败:', e)
    })
}
