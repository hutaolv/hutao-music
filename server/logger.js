// 应用日志模块：同时输出到控制台和日志文件
// 日志文件按天滚动：server/log/app-YYYY-MM-DD.log
import { appendFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 日志目录：server/log/hutao-music/
const LOG_DIR = resolve(__dirname, 'log', 'hutao-music')
mkdirSync(LOG_DIR, { recursive: true })

// 本地时区日期字符串
function localDateStr(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 本地时区时间戳
function localTime(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 当前日志文件句柄（按天切换）
let currentDate = localDateStr(new Date())
let currentFile = resolve(LOG_DIR, `app-${currentDate}.log`)

function rotateIfNeeded() {
  const today = localDateStr(new Date())
  if (today !== currentDate) {
    currentDate = today
    currentFile = resolve(LOG_DIR, `app-${currentDate}.log`)
  }
}

// 统一日志入口：console 输出 + 追加写入日志文件
export function log(...args) {
  rotateIfNeeded()
  const ts = localTime(new Date())
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  console.log(msg)
  try {
    appendFileSync(currentFile, `${ts} ${msg}\n`)
  } catch {}
}

export function warn(...args) {
  rotateIfNeeded()
  const ts = localTime(new Date())
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  console.warn(msg)
  try {
    appendFileSync(currentFile, `${ts} [WARN] ${msg}\n`)
  } catch {}
}

export function error(...args) {
  rotateIfNeeded()
  const ts = localTime(new Date())
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  console.error(msg)
  try {
    appendFileSync(currentFile, `${ts} [ERROR] ${msg}\n`)
  } catch {}
}

export default { log, warn, error }
