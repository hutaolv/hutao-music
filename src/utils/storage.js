// 存储工具：收藏、最近播放、下载歌曲改用 IndexedDB 持久化，
// 其余偏好（播放列表/音量/搜索/桌面歌词）仍存 localStorage。

const KEYS = {
  RECENT_PLAYS: 'musichub_recent',
  SEARCH_HISTORY: 'musichub_search_history',
  PLAY_LIST: 'musichub_playlist',
  CURRENT_SONG: 'musichub_current_song',
  VOLUME: 'musichub_volume'
}

// 收藏/最近播放上限
const MAX_ITEMS = 999

// IndexedDB 结构化克隆无法序列化 Vue 的 reactive Proxy（会抛 DataCloneError），
// 入库前统一转成纯普通对象
function toPlain(obj) {
  return JSON.parse(JSON.stringify(obj))
}

// ---------- IndexedDB 封装 ----------
const DB_NAME = 'musichub_db'
const DB_VERSION = 3
// 三个 object store：favorites 收藏、recent 最近播放、downloads 下载歌曲
const STORE_FAVORITES = 'favorites'
const STORE_RECENT = 'recent'
const STORE_DOWNLOADS = 'downloads'

let dbPromise = null

// 打开数据库（单例，惰性初始化）
function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
        db.createObjectStore(STORE_FAVORITES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_RECENT)) {
        db.createObjectStore(STORE_RECENT, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_DOWNLOADS)) {
        db.createObjectStore(STORE_DOWNLOADS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { reject(req.error) }
  })
  return dbPromise
}

// 独立打开 downloads DB（不走单例），用完即关，避免 HMR/block 问题
function openDownloadsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_FAVORITES)) db.createObjectStore(STORE_FAVORITES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_RECENT)) db.createObjectStore(STORE_RECENT, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_DOWNLOADS)) db.createObjectStore(STORE_DOWNLOADS, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// 事务中执行回调，事务状态变化时进行写操作，完成时 resolve/失败时 reject
function withStore(storeName, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    tx.oncomplete = finish
    tx.onerror = () => { done = true; reject(tx.error) }
    tx.onabort = () => { done = true; reject(tx.error) }
    fn(store, finish)
  }))
}

// 读取某个 store 的全部记录（不保证顺序，调用方再排序）
function getAllRecords(storeName) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  }))
}

// 批量写入记录，并把 store 内不在新列表中的旧记录删除
function putRecords(storeName, records) {
  return withStore(storeName, 'readwrite', (store, finish) => {
    const req = store.getAllKeys()
    req.onsuccess = () => {
      const newKeys = new Set(records.map(r => r.id))
      for (const key of req.result) {
        if (!newKeys.has(key)) store.delete(key)
      }
      for (const r of records) store.put(r)
      finish()
    }
    req.onerror = () => finish()
  })
}

function deleteRecord(storeName, id) {
  return withStore(storeName, 'readwrite', (store) => {
    store.delete(id)
  })
}

// 旧 localStorage 数据一次性迁移到 IndexedDB。
// 只迁移收藏与最近播放两个 key，保证老用户数据不丢失。
// 注意：逐一安全写入，只有写库成功才 removeItem，避免失败时把源数据也清掉。
async function migrateLegacyData() {
  const results = await Promise.allSettled([
    migrateKey('musichub_favorites', STORE_FAVORITES),
    migrateKey('musichub_recent', STORE_RECENT)
  ])
  // 任一迁移失败都不抛出，避免 migratePromise 永久卡死后续全部读写
  results.forEach(r => { if (r.status === 'rejected') console.warn('IndexedDB 迁移失败:', r.reason) })
}

async function migrateKey(key, storeName) {
  const legacy = JSON.parse(localStorage.getItem(key) || '[]')
  if (!Array.isArray(legacy) || !legacy.length) return
  // 过滤缺失 id 的脏数据（真实浏览器中无效 key 会令写入事务整体失败）
  const valid = legacy.filter(s => s && s.id != null && s.id !== '')
  if (!valid.length) return
  // 根据旧数组顺序生成加入时间：靠前（index 小）越新，ts 越大
  const now = Date.now()
  const records = valid.map((song, i) => ({
    id: song.id,
    song: toPlain(song),
    ts: now + (valid.length - i)
  })).slice(0, MAX_ITEMS)
  await putRecords(storeName, records)
  // 写库成功后才删除源数据，失败则不删，下次可重新迁移
  localStorage.removeItem(key)
}

// 迁移只执行一次的并发保护；一旦迁移失败重置，下次调用可重新尝试
let migratePromise = null
function ensureMigrated() {
  if (!migratePromise) {
    migratePromise = migrateLegacyData().catch(err => {
      console.warn('IndexedDB 首次迁移失败，重置以便重试:', err)
      migratePromise = null
    })
  }
  return migratePromise
}

// 取指定 store 的歌曲列表，按加入时间倒序（最新在前）
async function getSongList(storeName) {
  await ensureMigrated()
  const records = await getAllRecords(storeName)
  return records.sort((a, b) => b.ts - a.ts).map(r => r.song)
}

// 新增一条记录：相同 id 不重复插入；若超过上限则删除最早（ts 最小）的一条
async function addSongRecord(storeName, song) {
  await ensureMigrated()
  const records = await getAllRecords(storeName)
  if (records.some(r => r.id === song.id)) return
  records.push({ id: song.id, song: toPlain(song), ts: Date.now() })
  records.sort((a, b) => b.ts - a.ts)
  const kept = records.slice(0, MAX_ITEMS)
  await putRecords(storeName, kept)
}

// 把最近播放置顶：先移除同 id 旧记录，再插入最新；超限删除最早的一条
async function touchRecent(song) {
  await ensureMigrated()
  const records = (await getAllRecords(STORE_RECENT)).filter(r => r.id !== song.id)
  records.push({ id: song.id, song: toPlain(song), ts: Date.now() })
  records.sort((a, b) => b.ts - a.ts)
  const kept = records.slice(0, MAX_ITEMS)
  await putRecords(STORE_RECENT, kept)
}

// ---------- 收藏 ----------
export async function getFavorites() {
  return getSongList(STORE_FAVORITES)
}

export async function addFavorite(song) {
  await addSongRecord(STORE_FAVORITES, song)
}

export async function removeFavorite(songId) {
  await deleteRecord(STORE_FAVORITES, songId)
}

export async function isFavorite(songId) {
  const records = await getAllRecords(STORE_FAVORITES)
  return records.some(r => r.id === songId)
}

// ---------- 最近播放 ----------
export async function getRecentPlays() {
  return getSongList(STORE_RECENT)
}

export async function addRecentPlay(song) {
  await touchRecent(song)
}

// ---------- 以下仍用 localStorage ----------
export function getSearchHistory() {
  return JSON.parse(localStorage.getItem(KEYS.SEARCH_HISTORY) || '[]')
}

export function addSearchHistory(keyword) {
  let list = getSearchHistory().filter(k => k !== keyword)
  list.unshift(keyword)
  if (list.length > 10) list = list.slice(0, 10)
  localStorage.setItem(KEYS.SEARCH_HISTORY, JSON.stringify(list))
  return list
}

export function clearSearchHistory() {
  localStorage.removeItem(KEYS.SEARCH_HISTORY)
  return []
}

export function getPlaylist() {
  return JSON.parse(localStorage.getItem(KEYS.PLAY_LIST) || '[]')
}

export function savePlaylist(list) {
  localStorage.setItem(KEYS.PLAY_LIST, JSON.stringify(list))
}

export function getCurrentSong() {
  const raw = localStorage.getItem(KEYS.CURRENT_SONG)
  return raw ? JSON.parse(raw) : null
}

export function saveCurrentSong(song) {
  if (song) {
    localStorage.setItem(KEYS.CURRENT_SONG, JSON.stringify(song))
  } else {
    localStorage.removeItem(KEYS.CURRENT_SONG)
  }
}

export function getVolume() {
  return parseFloat(localStorage.getItem(KEYS.VOLUME) || '0.7')
}

export function saveVolume(v) {
  localStorage.setItem(KEYS.VOLUME, String(v))
}

const DL_KEYS = {
  COLOR: 'musichub_desktop_lyrics_color',
  POS: 'musichub_desktop_lyrics_pos'
}

export function getDesktopLyricsColor() {
  return localStorage.getItem(DL_KEYS.COLOR) || '#60a5fa'
}

export function setDesktopLyricsColor(c) {
  localStorage.setItem(DL_KEYS.COLOR, c)
}

export function getDesktopLyricsPos() {
  const saved = localStorage.getItem(DL_KEYS.POS)
  if (!saved) return { top: 80, left: 24 }
  const pos = JSON.parse(saved)
  // 兼容旧版本存的是 right：转成 left
  if (pos.left == null && pos.right != null) {
    const width = parseInt(localStorage.getItem('musichub_dl_width')) || 320
    return { top: pos.top, left: Math.max(0, window.innerWidth - pos.right - width) }
  }
  return { top: pos.top, left: pos.left }
}

export function setDesktopLyricsPos(pos) {
  localStorage.setItem(DL_KEYS.POS, JSON.stringify(pos))
}

// ---------- 下载歌曲 ----------
// 获取所有下载歌曲（按添加时间倒序），返回纯元数据数组（不含 audioBlob）
// 用 cursor 逐条读取，避免 getAll() 将全部音频二进制加载到内存
export async function getDownloads() {
  try {
    const db = await openDownloadsDB()
    const result = await new Promise((resolve) => {
      const tx = db.transaction(STORE_DOWNLOADS, 'readonly')
      const store = tx.objectStore(STORE_DOWNLOADS)
      const results = []
      const req = store.openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          const { audioBlob, ...meta } = cursor.value.song || {}
          results.push(meta)
          cursor.continue()
        } else {
          resolve(results.sort((a, b) => (b.ts || 0) - (a.ts || 0)))
        }
      }
      req.onerror = () => resolve([])
    })
    db.close()
    return result
  } catch (err) {
    console.error('getDownloads error:', err)
    return []
  }
}

// 添加下载歌曲：song 为元数据对象，audioBlob 为音频文件二进制
export async function addDownload(song, audioBlob) {
  const db = await openDownloadsDB()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOWNLOADS, 'readwrite')
      const store = tx.objectStore(STORE_DOWNLOADS)
      const plain = toPlain(song)
      store.put({ id: plain.id, song: { ...plain, audioBlob }, ts: Date.now() })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => { console.error('addDownload tx error:', tx.error); reject(tx.error) }
    })
  } finally {
    db.close()
  }
}

// 删除下载歌曲
export async function removeDownload(songId) {
  const db = await openDownloadsDB()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOWNLOADS, 'readwrite')
      tx.objectStore(STORE_DOWNLOADS).delete(songId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

// 检查是否已下载
export async function isDownloaded(songId) {
  const db = await openDownloadsDB()
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_DOWNLOADS, 'readonly')
      const req = tx.objectStore(STORE_DOWNLOADS).get(songId)
      req.onsuccess = () => resolve(!!req.result)
      req.onerror = () => resolve(false)
    })
  } finally {
    db.close()
  }
}

// 获取下载歌曲的音频 Blob（播放时使用）
export async function getDownloadBlob(songId) {
  const db = await openDownloadsDB()
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_DOWNLOADS, 'readonly')
      const req = tx.objectStore(STORE_DOWNLOADS).get(songId)
      req.onsuccess = () => resolve(req.result?.song?.audioBlob || null)
      req.onerror = () => resolve(null)
    })
  } finally {
    db.close()
  }
}