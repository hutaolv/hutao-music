// IP 归属地日志写入器：所有 hiofd 相关日志独立成 ip-geo-YYYY-MM-DD.log
//
// 为什么单独一个文件：
// 1. 归属地是"异步补查"的结果，和请求发生的时刻不同步，混进 app 日志会与业务行错位；
// 2. 该功能依赖第三方工具站，随时可能改接口或封 IP。独立成文件后，它出故障只会在自己
//    的文件里留下 FAIL 记录，业务日志 app-*.log 一个字节都不会变；
// 3. 排查时能直接 grep 一个文件看完整链路，不用在业务日志里翻。
//
// 写 app-*.log 的只有 writeGeoBrief 这一条（紧跟业务行的精简行，仅在已解析出归属地时输出），
// 其余全部落在 ip-geo-*.log。所有函数都做了 try/catch，日志写入异常绝不向调用方抛出。
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createLogger, log as appLog } from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 与业务日志同目录，便于一起打包备份
const LOG_DIR = resolve(__dirname, 'log', 'hutao-music')
const geoLogger = createLogger(LOG_DIR, 'ip-geo')

// 精简行字段：只放 app 日志里有价值的几项（来源、运营商、位置、区、街道、经纬度）
function briefFields(rec) {
  return {
    ip: rec.ip,
    source: rec.source,
    country: rec.country,
    province: rec.province,
    city: rec.city,
    district: rec.district,
    street: rec.street,
    isp: rec.isp,
    longitude: rec.longitude,
    latitude: rec.latitude,
    queryAt: rec.queryAt
  }
}

// 写入 app 日志的精简行：由调用方在业务行之后紧邻调用，保证两行相邻。
// 只在已解析出归属地时调用；解析失败时业务日志不会多出任何一行（不写"未知"占位）。
export function writeGeoBrief(rec) {
  try {
    appLog('[IP-GEO]', briefFields(rec))
  } catch { /* 归属地日志失败不影响业务日志，也不影响请求 */ }
}

// 补写行：查询是异步的，用户可能早在几十秒前就发完了请求。
// 这一行在查到结果的那一刻写进 app 日志，用 forAt 标明它属于哪一次请求——
// 时间戳是乱的，但带上 forAt 和 waitMs 后，一个 IP 从入队到查到可以在一处看全。
// 这是"日志里有的有归属地、有的没有"的直接解法：
// 以前只有缓存命中的请求才有 [IP-GEO]，新 IP 的那次请求永远等不到；
// 现在新 IP 查到后补一行 FILL，当次请求的结果就不再是空白。
export function writeGeoFill(rec, meta) {
  try {
    appLog('[IP-GEO-FILL]', {
      ip: rec.ip,
      forAt: meta.forAt,
      waitMs: meta.waitMs,
      ...briefFields(rec)
    })
  } catch { /* 补写失败不影响业务日志，也不影响请求 */ }
}

// 全量记录写入 ip-geo 日志：hiofd 原始字段全量保留（不改字段名，方便 jq 过滤），
// 另附本次查询的耗时与排队时长，用于判断限流是否成为瓶颈
export function writeGeoRecord(rec) {
  try {
    geoLogger.log('[IP-GEO]', {
      ...briefFields(rec),
      costMs: rec.costMs,
      queueMs: rec.queueMs
    })
  } catch { /* 同上，静默 */ }
}

// 查询失败：保留上游原始错误信息（HTTP 码 / resultCode / message），
// 不自行改写描述——判断是限流还是签名失效，靠的就是这几个字段
export function writeGeoFail(info) {
  try {
    geoLogger.warn('[IP-GEO-FAIL]', {
      ip: info.ip,
      error: info.error,
      httpStatus: info.httpStatus ?? '',
      resultCode: info.resultCode ?? '',
      costMs: info.costMs,
      retryAfterMs: info.retryAfterMs
    })
  } catch { /* 静默 */ }
}

// 队列水位线：pending 持续上涨说明 5 次/分钟的额度不够用，
// 这是是否需要调整 IP_LOOKUP_INTERVAL_MS 或缓存时长的唯一依据
export function writeGeoQueue(info) {
  try {
    geoLogger.log('[IP-GEO-QUEUE]', info)
  } catch { /* 静默 */ }
}

// 队列溢出：丢弃最早入队的地址时记录，避免"某地址查不到归属地"被误判为签名失效
export function writeGeoDrop(info) {
  try {
    geoLogger.warn('[IP-GEO-QUEUE-DROP]', info)
  } catch { /* 静默 */ }
}

// 每日归档汇总：凌晨归档当天的访问统计时一并输出，便于回看当天的解析覆盖率
export function writeGeoArchive(info) {
  try {
    geoLogger.log('[IP-GEO-ARCHIVE]', info)
  } catch { /* 静默 */ }
}
