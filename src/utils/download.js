import { Capacitor } from '@capacitor/core'

export async function downloadSong(url, filename) {
  if (!url) return

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const reader = new FileReader()
      reader.onloadend = async () => {
        const base64Data = reader.result.split(',')[1]
        await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Downloads
        })
      }
      reader.readAsDataURL(blob)
    } catch (e) {
      console.error('Download failed:', e)
    }
  } else {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}
