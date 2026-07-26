const KEYS = {
  FAVORITES: 'musichub_favorites',
  RECENT_PLAYS: 'musichub_recent',
  SEARCH_HISTORY: 'musichub_search_history',
  PLAY_LIST: 'musichub_playlist',
  VOLUME: 'musichub_volume'
}

export function getFavorites() {
  return JSON.parse(localStorage.getItem(KEYS.FAVORITES) || '[]')
}

export function addFavorite(song) {
  const list = getFavorites()
  if (!list.find(s => s.id === song.id)) {
    list.unshift(song)
    localStorage.setItem(KEYS.FAVORITES, JSON.stringify(list))
  }
  return list
}

export function removeFavorite(songId) {
  const list = getFavorites().filter(s => s.id !== songId)
  localStorage.setItem(KEYS.FAVORITES, JSON.stringify(list))
  return list
}

export function isFavorite(songId) {
  return getFavorites().some(s => s.id === songId)
}

export function getRecentPlays() {
  return JSON.parse(localStorage.getItem(KEYS.RECENT_PLAYS) || '[]')
}

export function addRecentPlay(song) {
  let list = getRecentPlays().filter(s => s.id !== song.id)
  list.unshift(song)
  if (list.length > 30) list = list.slice(0, 30)
  localStorage.setItem(KEYS.RECENT_PLAYS, JSON.stringify(list))
  return list
}

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
