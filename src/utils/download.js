export async function downloadSong(url, filename) {
  if (!url) return

  const cap = typeof window !== 'undefined' && window.Capacitor
  const isNative = cap && cap.isNativePlatform && cap.isNativePlatform()

  if (isNative && cap.Plugins?.Filesystem) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1]
        await cap.Plugins.Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: 'DOWNLOADS'
        })
      }
      reader.readAsDataURL(blob)
    } catch (e) {
      console.error('Native download failed, falling back:', e)
      fallbackDownload(url, filename)
    }
  } else {
    fallbackDownload(url, filename)
  }
}

function fallbackDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
