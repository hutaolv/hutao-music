// 应用日志模块：同时输出到控制台和日志文件
// 日志文件按天滚动：server/log/hutao-music/app-YYYY-MM-DD.log
//
// 从 v1（只写 app 日志）抽出了 createLogger 工厂：
// IP 归属地查询需要写自己的 ip-geo-YYYY-MM-DD.log，如果各自复制一份"按天滚动"逻辑，
// 早晚会出现某一边跨天不切文件、时间戳格式不一致的问题。所以滚动逻辑只保留这一份，
// 业务日志与归属地日志都通过 createLogger 创建各自的 writer。
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

// 创建一组按天滚动的日志写入器。
// 参数：dir 日志目录；prefix 文件名前缀（最终文件为 <prefix>-YYYY-MM-DD.log）
// 返回：{ log, warn, error, currentFile }，与原 log/warn/error 行为一致
export function createLogger(dir, prefix = 'app') {
  mkdirSync(dir, { recursive: true })
  // 当前日志文件句柄（按天切换）
  let currentDate = localDateStr(new Date())
  let currentFile = resolve(dir, `${prefix}-${currentDate}.log`)

  function rotateIfNeeded() {
    const today = localDateStr(new Date())
    if (today !== currentDate) {
      currentDate = today
      currentFile = resolve(dir, `${prefix}-${currentDate}.log`)
    }
  }

  // 实际写入：level 为空表示普通日志，'[WARN]' / '[ERROR]' 会插在时间戳之后。
  // 控制台输出保持原样（不带时间戳和级别前缀），文件里才带——与改造前完全一致
  function write(level, consoleFn, args) {
    rotateIfNeeded()
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    consoleFn(msg)
    try {
      const ts = localTime(new Date())
      appendFileSync(currentFile, `${ts} ${level ? level + ' ' : ''}${msg}\n`)
    } catch { /* 写盘失败不影响控制台输出，也不应中断请求 */ }
  }

  return {
    log: (...args) => write('', console.log, args),
    warn: (...args) => write('[WARN]', console.warn, args),
    error: (...args) => write('[ERROR]', console.error, args),
    // 供调试/自测查看当前落盘文件
    currentFile: () => currentFile
  }
}

// 业务日志实例（app-YYYY-MM-DD.log），对外接口与改造前保持不变
const appLogger = createLogger(LOG_DIR, 'app')

// 统一日志入口：console 输出 + 追加写入日志文件
export function log(...args) {
  appLogger.log(...args)
}

export function warn(...args) {
  appLogger.warn(...args)
}

export function error(...args) {
  appLogger.error(...args)
}

export default { log, warn, error }
