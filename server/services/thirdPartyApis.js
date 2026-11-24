// thirdPartyApis.js - 薄壳文件，仅保留公共函数 + 从各 hutao-*.js 重新导出
// 各平台第三方 API 已拆分到独立文件，便于维护和扩展

import axios from 'axios'
import https from 'https'
import { log } from '../logger.js'

// 公共请求头
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

// 源健康度熔断：连续失败达到阈值的源在冷却期内直接跳过，不再发起请求。
// 背景：实测酷狗 8 个第三方源里 6 个已失效（403/503/405/超时），
// 并行调度下它们不影响"有源成功"的速度，但一旦全军覆没，调用方要白等满 5 秒超时
// 才能确认失败 —— 熔断后这类源直接不发起，失败能秒回，再由上层换源兜底。
// 注意：只统计"异常/超时"，源正常返回但没有该首歌不算不健康（换首歌可能就有）。
const FAIL_THRESHOLD = 3
const COOLDOWN_MS = 5 * 60 * 1000
// name -> { fails: 连续失败次数, until: 冷却截止时间戳 }
const sourceHealth = new Map()

function isCoolingDown(name) {
  const h = sourceHealth.get(name)
  return !!h && h.until > Date.now()
}
function markFail(name, ip) {
  const h = sourceHealth.get(name) || { fails: 0, until: 0 }
  h.fails++
  if (h.fails >= FAIL_THRESHOLD && h.until <= Date.now()) {
    h.until = Date.now() + COOLDOWN_MS
    h.fails = 0
    log(`[${ip || '-'}] [ThirdParty] ${name} 连续失败 ${FAIL_THRESHOLD} 次，暂停 ${COOLDOWN_MS / 60000} 分钟`)
  }
  sourceHealth.set(name, h)
}
function markOk(name) {
  const h = sourceHealth.get(name)
  if (h && (h.fails || h.until)) sourceHealth.set(name, { fails: 0, until: 0 })
}

// 尝试调用单个 API，5秒超时，返回 { url, lyric, ... } 或 null
async function tryApi(name, fn, ip) {
  if (isCoolingDown(name)) return null
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])
    if (result?.url && result.url.startsWith('http')) {
      markOk(name)
      return result
    }
    // 源可用但没有该首资源：不计失败，只清掉可能存在的历史失败累计
    markOk(name)
    return null
  } catch {
    markFail(name, ip)
    return null
  }
}

// 并行尝试多个 API，返回第一个成功的播放地址
// 参数：apis - API 数组，songId - 歌曲ID，quality - 音质档位，ip - 客户端IP（日志埋点用）
export async function fetchWithFallback(apis, songId, quality, ip) {
  if (apis.length === 0) return null
  // 熔断中的源直接剔除；全被剔除时立即返回 null，不让调用方空等超时
  const alive = apis.filter(a => !isCoolingDown(a.name))
  if (alive.length === 0) return null
  if (alive.length === 1) return tryApi(alive[0].name, () => alive[0].fetch(songId, quality), ip)
  // 并行发起，第一个成功的立即返回，其余静默丢弃
  return new Promise(resolve => {
    let settled = false
    let remaining = alive.length
    alive.forEach(api => {
      tryApi(api.name, () => api.fetch(songId, quality), ip).then(result => {
        if (!settled && result) {
          settled = true
          log(`[${ip || '-'}] [ThirdParty] ${api.name} success for ${songId}`)
          resolve(result)
        }
        if (--remaining === 0 && !settled) resolve(null)
      }).catch(() => {
        if (--remaining === 0 && !settled) resolve(null)
      })
    })
  })
}

// 从各平台独立文件重新导出，保持向后兼容
export { neteaseThirdPartyApis } from './hutao-netease.js'
export { qqThirdPartyApis } from './hutao-qq.js'
export { miguThirdPartyApis } from './hutao-migu.js'
export { kuwoThirdPartyApis } from './hutao-kuwo.js'
export { kugouThirdPartyApis } from './hutao-kugou.js'
export { thirdPartySearchApis, searchWithThirdParty } from './hutao-search.js'
