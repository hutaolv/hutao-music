// 存储工具：收藏与最近播放改用 IndexedDB 持久化（上限 999 条，超出删除最早加入的一条），
// 其余偏好（播放列表/音量/搜索/桌面歌词）仍存 localStorage。
// 全部收藏/历史 API 改为异步（返回 Promise）。

const KEYS = {
  RECENT_PLAYS: 'musichub_recent',
  SEARCH_HISTORY: 'musichub_search_history',
  PLAY_LIST: 'musichub_playlist',
  VOLUME: 'musichub_volume'
}

// 收藏/最近播放上限
const MAX_ITEMS = 999

// ---------- IndexedDB 封装 ----------
const DB_NAME = 'musichub_db'
const DB_VERSION = 1
// 两个 object store：favorites 收藏、recent 最近播放，keyPath 用歌曲 id
const STORE_FAVORITES = 'favorites'
const STORE_RECENT = 'recent'

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
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { reject(req.error) }
  })
  return dbPromise
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
  return withStore(storeName, 'readwrite', (store) => {
    for (const r of records) store.put(r)
  })
}

function deleteRecord(storeName, id) {
  return withStore(storeName, 'readwrite', (store) => {
    store.delete(id)
  })
}

// 旧 localStorage 数据一次性迁移到 IndexedDB。
// 只迁移收藏与最近播放两个 key，保证老用户数据不丢失。
function migrateLegacyData() {
  const migrations = [
    { key: 'musichub_favorites', store: STORE_FAVORITES },
    { key: 'musichub_recent', store: STORE_RECENT }
  ]
  return Promise.all(migrations.map(({ key, store }) => {
    const legacy = JSON.parse(localStorage.getItem(key) || '[]')
    if (!legacy.length) return Promise.resolve()
    // 根据旧数组顺序生成加入时间：靠前（index 小）越新，ts 越大
    const now = Date.now()
    const records = legacy.map((song, i) => ({
      id: song.id,
      song,
      ts: now + (legacy.length - i)
    })).slice(0, MAX_ITEMS)
    localStorage.removeItem(key)
    return putRecords(store, records)
  }))
}

// 迁移只执行一次的并发保护
let migratePromise = null
function ensureMigrated() {
  if (!migratePromise) migratePromise = migrateLegacyData()
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
  records.push({ id: song.id, song, ts: Date.now() })
  records.sort((a, b) => b.ts - a.ts)
  const kept = records.slice(0, MAX_ITEMS)
  await putRecords(storeName, kept)
}

// 把最近播放置顶：先移除同 id 旧记录，再插入最新；超限删除最早的一条
async function touchRecent(song) {
  await ensureMigrated()
  const records = (await getAllRecords(STORE_RECENT)).filter(r => r.id !== song.id)
  records.push({ id: song.id, song, ts: Date.now() })
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
  return localStorage.getItem(DL_KEYS.COLOR) || '#818cf8'
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