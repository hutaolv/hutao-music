// 公共请求头
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
}

import axios from 'axios'

// ==================== 咪咕音乐第三方 API ====================
export const miguThirdPartyApis = [
  // gdstudio-migu：固定 br=999 获取最高音质
  {
    name: 'gdstudio-migu',
    fetch: async (id, quality) => {
      const { data } = await axios.get(`https://music-api.gdstudio.xyz/api.php`, {
        params: { types: 'url', id, source: 'migu', br: 999 },
        headers, timeout: 5000
      })
      return { url: data?.url }
    }
  }
]
