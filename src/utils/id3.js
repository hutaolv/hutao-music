// ID3v2.3/v2.4 标签解析（mp3，导入时从 ArrayBuffer 读取）
// 目标字段：歌名 TIT2 / 歌手 TPE1 / 专辑 TALB / 时长 TLEN / 内嵌歌词 USLT / 内嵌封面 APIC
// 只做导入匹配所需的最小实现：解析失败/格式不支持（flac、m4a、ID3v2.2）一律返回空对象，
// 由文件名解析与在线模糊匹配兜底，绝不影响导入主流程

const MAX_COVER = 3 * 1024 * 1024

// 同步安全整数（ID3v2.4 帧大小/标签大小）
function syncsafe4(b, off) {
  return (b[off] & 0x7f) * 0x200000 + (b[off + 1] & 0x7f) * 0x4000 + (b[off + 2] & 0x7f) * 0x80 + (b[off + 3] & 0x7f)
}

// 普通 32 位大端（ID3v2.3 帧大小）
function plain4(b, off) {
  return (b[off] << 24 >>> 0) + (b[off + 1] << 16) + (b[off + 2] << 8) + b[off + 3]
}

// 文本编码：0=ISO-8859-1（国内文件实际多为 GBK，按 GBK 解） 1=UTF-16(带BOM) 2=UTF-16BE 3=UTF-8
function decodeText(enc, bytes) {
  try {
    if (!bytes || !bytes.length) return ''
    if (enc === 1 || enc === 2) {
      let start = 0
      let label = enc === 1 ? 'utf-16le' : 'utf-16be'
      if (enc === 1 && bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) start = 2
      else if (enc === 1 && bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) { start = 2; label = 'utf-16be' }
      return new TextDecoder(label).decode(bytes.subarray(start)).replace(/\0+$/g, '')
    }
    if (enc === 3) return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/g, '')
    return new TextDecoder('gbk').decode(bytes).replace(/\0+$/g, '')
  } catch (e) {
    return ''
  }
}

// 文本编码对应的字符串终止符长度
function terminatorLen(enc) {
  return enc === 1 || enc === 2 ? 2 : 1
}

// 在 bytes 里找终止符起点（从 from 开始），找不到返回 -1
function findTerminator(bytes, from, enc) {
  const step = terminatorLen(enc)
  for (let i = from; i + step <= bytes.length; i += step) {
    if (step === 1) {
      if (bytes[i] === 0) return i
    } else if (bytes[i] === 0 && bytes[i + 1] === 0) {
      return i
    }
  }
  return -1
}

// 读取"编码字节 + 变长文本"结构（USLT 的描述符、APIC 的描述符共用）
function readEncodedString(enc, bytes, from) {
  const end = findTerminator(bytes, from, enc)
  if (end < 0) return { text: '', next: bytes.length }
  return { text: decodeText(enc, bytes.subarray(from, end)), next: end + terminatorLen(enc) }
}

function makeCoverBlob(bytes) {
  if (!bytes || !bytes.length || bytes.length > MAX_COVER) return null
  let mime = ''
  // 魔数嗅探（mime 为空或非 image 时）
  if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = 'image/jpeg'
  else if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = 'image/png'
  else if (bytes[0] === 0x47 && bytes[1] === 0x49) mime = 'image/gif'
  else if (bytes[0] === 0x52 && bytes[1] === 0x49) mime = 'image/webp'
  if (!mime) return null
  return new Blob([bytes], { type: mime })
}

/**
 * 解析 mp3 的 ID3v2 标签
 * @param {ArrayBuffer} buf 音频文件完整内容（调用方已读成 ArrayBuffer）
 * @returns {{title: string|null, artist: string|null, album: string|null, durationMs: number, lyrics: string|null, cover: Blob|null}}
 */
export function parseID3Tags(buf) {
  const out = { title: null, artist: null, album: null, durationMs: 0, lyrics: null, cover: null }
  try {
    const b = new Uint8Array(buf)
    if (b.length < 10) return out
    if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return out // "ID3"
    const ver = b[3]
    if (ver < 3 || ver > 4) return out // v2.2 是 3 字节帧头，少见，放弃
    const flags = b[5]
    const tagSize = syncsafe4(b, 6)
    let pos = 10
    if (flags & 0x40) {
      // 扩展头：v2.4 首 4 字节为同步安全大小（含自身），v2.3 为普通大小（不含自身）
      const extSize = ver === 4 ? syncsafe4(b, pos) : plain4(b, pos)
      pos += ver === 4 ? extSize : extSize + 4
    }
    const end = Math.min(10 + tagSize, b.length)
    while (pos + 10 <= end) {
      const id = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3])
      if (!/^[A-Z0-9]{4}$/.test(id)) break // 遇到填充区/脏数据即停
      const size = ver === 4 ? syncsafe4(b, pos + 4) : plain4(b, pos + 4)
      if (size <= 0 || pos + 10 + size > end) break
      const data = b.subarray(pos + 10, pos + 10 + size)

      if (id === 'TIT2' || id === 'TPE1' || id === 'TALB') {
        if (data.length > 1) {
          const text = decodeText(data[0], data.subarray(1)).split('\0')[0].trim()
          if (text) {
            if (id === 'TIT2') out.title = text
            else if (id === 'TPE1') out.artist = text
            else out.album = text
          }
        }
      } else if (id === 'TLEN' && data.length > 1) {
        const ms = parseInt(decodeText(data[0], data.subarray(1)), 10)
        if (Number.isFinite(ms) && ms > 0) out.durationMs = ms
      } else if (id === 'USLT' && data.length > 5) {
        const enc = data[0]
        const desc = readEncodedString(enc, data, 4) // 编码(1) + 语言(3) + 描述符
        const text = decodeText(enc, data.subarray(desc.next)).trim()
        if (text && !out.lyrics) out.lyrics = text
      } else if (id === 'APIC' && data.length > 6 && !out.cover) {
        const enc = data[0]
        // 编码(1) + mime(以 0 结尾的 latin1) + 图片类型(1) + 描述符 + 数据
        let p = 1
        while (p < data.length && data[p] !== 0) p++
        p++ // 跳过 mime 终止符
        p++ // 跳过图片类型字节
        const desc = readEncodedString(enc, data, p)
        out.cover = makeCoverBlob(data.subarray(desc.next))
      }
      pos += 10 + size
    }
  } catch (e) {
    // 解析失败不阻断导入，返回已解出的字段
  }
  return out
}
