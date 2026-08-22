// thirdPartyApis.js - 薄壳文件，仅保留公共函数 + 从各 hutao-*.js 重新导出
// 各平台第三方 API 已拆分到独立文件，便于维护和扩展

import axios from 'axios'
import https from 'https'

// 公共请求头
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

// 尝试调用单个 API，5秒超时，返回 { url, lyric, ... } 或 null
async function tryApi(name, fn) {
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])
    if (result?.url && result.url.startsWith('http')) {
      return result
    }
    return null
  } catch {
    return null
  }
}

// 依次尝试多个 API，返回第一个成功的播放地址
// 参数：apis - API 数组，songId - 歌曲ID，quality - 音质档位
export async function fetchWithFallback(apis, songId, quality) {
  for (const api of apis) {
    const result = await tryApi(api.name, () => api.fetch(songId, quality))
    if (result) {
      console.log(`[ThirdParty] ${api.name} success for ${songId}`)
      return result
    }
  }
  return null
}

// 从各平台独立文件重新导出，保持向后兼容
export { neteaseThirdPartyApis } from './hutao-netease.js'
export { qqThirdPartyApis } from './hutao-qq.js'
export { miguThirdPartyApis } from './hutao-migu.js'
export { kuwoThirdPartyApis } from './hutao-kuwo.js'
export { kugouThirdPartyApis } from './hutao-kugou.js'
export { thirdPartySearchApis, searchWithThirdParty } from './hutao-search.js'
