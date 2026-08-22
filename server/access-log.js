// 访问日志模块：聚合记录每个访问者（按 IP）的访问次数、地理位置、网络状态与设备信息，
// 定期落盘到 server/log/ 目录，供站长查看用户访问概况。
// 设计说明：
// - 以 IP 为维度聚合计数与首尾访问时间，避免高频请求刷爆磁盘
// - 外部 IPv4 尝试在线解析地理位置（国内接口优先，失败降级 unknown）
// - 设备/网络信息从 User-Agent 与连接信息解析，录音存内存，周期 flush
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// 日志目录：server/log
const LOG_DIR = resolve(__dirname, 'log')
// 聚合结果文件：server/log/access.json
const OUT_FILE = resolve(LOG_DIR, 'access.json')
// 历史归档目录：server/log/history
const HISTORY_DIR = resolve(LOG_DIR, 'history')
// 聚合数据每隔多少毫秒落盘一次
const FLUSH_INTERVAL = 30000
// 在线 IP 归属地接口超时（毫秒）
const GEO_TIMEOUT = 4000

mkdirSync(LOG_DIR, { recursive: true })
mkdirSync(HISTORY_DIR, { recursive: true })

// 聚合表：ip -> { requests, firstSeen, lastSeen, geo, isp, network, device, os, browser, paths }
const stats = new Map()

// 读取历史汇总（重启后保留累计访问次数）
let persisted = {}
if (existsSync(OUT_FILE)) {
  try {
    persisted = JSON.parse(readFileSync(OUT_FILE, 'utf8') || '{}')
  } catch { persisted = {} }
}

// 解析 User-Agent，返回 { device, os, browser, network }
function parseUA(ua = '') {
  const u = ua.toLowerCase()
  let device = '桌面端'
  let os = '未知系统'
  let browser = '未知浏览器'
  // 设备类型：优先按常见关键字判断
  if (/ipad|tablet/.test(u)) device = '平板'
  else if (/iphone|android|mobile/.test(u)) device = '移动端'
  // 操作系统
  if (u.includes('windows')) os = 'Windows'
  else if (u.includes('android')) os = 'Android'
  else if (u.includes('iphone') || u.includes('ipad') || u.includes('ios')) os = 'iOS'
  else if (u.includes('mac os')) os = 'macOS'
  else if (u.includes('linux')) os = 'Linux'
  // 浏览器/App
  if (u.includes('micromessenger')) browser = '微信内置'
  else if (u.includes('capacitor')) browser = 'Capacitor(APK)'
  else if (u.includes('edg/') || u.includes('edge/')) browser = 'Edge'
  else if (u.includes('opera') || u.includes('opr/')) browser = 'Opera'
  else if (u.includes('qqbrowser')) browser = 'QQ浏览器'
  else if (u.includes('ucbrowser')) browser = 'UC浏览器'
  else if (u.includes('chrome')) browser = 'Chrome'
  else if (u.includes('firefox')) browser = 'Firefox'
  else if (u.includes('safari')) browser = 'Safari'
  // 网络状态：优先从 UA 特征推断，其次标记 WebView/移动网络不可直接推断，仅区分已知标记
  let network = '未知网络'
  if (u.includes('wv') || u.includes('webview') || u.includes('capacitor')) {
    network = 'App内WebView'
    if (u.includes('android')) network = 'Android WebView'
    if (u.includes('iphone') || u.includes('ipad')) network = 'iOS WebView'
  } else if (u.includes('micromessenger')) {
    network = '微信内置浏览器'
  }
  // 移动设备走移动网络/无线，桌面走有线/无线，仅作粗略标注
  if (network === '未知网络') network = device === '移动端' ? '移动网络/无线' : '有线/无线'
  return { device, os, browser, network }
}

// 记录一次访问：internalIp 为内网地址时跳过归属地在线解析，标注为本地网络
async function record(req) {
  // 跳过健康检查与静态资源请求，避免首页/JS/CSS 刷爆统计（只记真实访问入口）
  if (req.path === '/api/health') return
  // 常见静态资源扩展名：不动用 bulk 匹配，快速判断
  if (/\.(js|css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|map|json)(\?|$)/i.test(req.path)) return
  // 支持 x-forwarded-for（Nginx 反代时取真实客户端 IP）
  const xff = req.headers['x-forwarded-for']
  const ip = (xff ? String(xff).split(',')[0].trim() : (req.socket?.remoteAddress || '')).replace(/^::ffff:/, '')
  const ua = req.headers['user-agent'] || ''
  // 前端通过 api.js 上报真实网络类型（wifi/4g/3g/2g），有则覆盖 UA 猜测
  const reportedNetwork = String(req.headers['x-network-type'] || '').trim()
  const now = new Date()
  const { device, os, browser, network: guessedNetwork } = parseUA(ua)
  const network = reportedNetwork || guessedNetwork
  // 生成本次记录字段（不记录查询参数，避免入库搜索关键词等敏感信息）
  const entry = {
    method: req.method,
    path: req.path,
    at: now.toISOString()
  }

  let s = stats.get(ip)
  if (!s) {
    // 首次见到该 IP：优先复用历史累计次数，再异步解析归属地
    const hist = persisted[ip] || {}
    s = {
      requests: (hist.requests || 0) + 1,
      firstSeen: hist.firstSeen || now.toISOString(),
      lastSeen: now.toISOString(),
      // 优先用本次上报/新解析的网络类型，历史值仅作无上报时的兜底
      geo: hist.geo || localGeoLabel(ip),
      isp: hist.isp || '',
      network: network || hist.network || '',
      device: device || hist.device || '',
      os: os || hist.os || '',
      browser: browser || hist.browser || '',
      paths: (hist.paths || {})
    }
    stats.set(ip, s)
    // 首次见到该 IP：异步解析归属地（内网地址跳过在线解析）
    resolveGeo(ip, s)
  } else {
    s.requests++
    s.lastSeen = now.toISOString()
    // 后续访问用最新上报/解析的网络类型覆盖（网络环境可能切换）
    if (network) s.network = network
  }
  // 累计路径访问次数
  s.paths[entry.method + ' ' + entry.path] = (s.paths[entry.method + ' ' + entry.path] || 0) + 1
}

// 内网/本机地址的可见标注，替代空 geo
function localGeoLabel(ip) {
  if (!ip || ip === 'unknown') return '未知'
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return '本机(127.0.0.1)'
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return '内网'
  if (ip.startsWith('172.')) return '内网'
  if (ip.includes(':')) return '本机(IPv6)'
  return ''
}

// 判定是否为外部 IPv4（可在线解析归属地）：内网/本机/IPv6 均返回 false
function isExternalIPv4(ip) {
  if (!ip || ip === 'unknown' || ip.includes(':')) return false
  if (ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) return false
  return true
}

// 在线解析 IP 归属地：优先 ipinfo.io（精度高），失败回退 ip-api.com。
// 内网/本机地址已在上游标注，无需在线解析（这里只处理外网 IPv4）
async function resolveGeo(ip, s) {
  if (!isExternalIPv4(ip)) return
  // 接口一：ipinfo.io（精度高，包含 ASN/运营商信息）
  try {
    const res = await fetch(`https://ipinfo.io/${ip}/json`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(GEO_TIMEOUT)
    })
    const json = await res.json()
    if (json?.city) {
      // 拼接为 "国家 省份 城市" 格式
      s.geo = [json.country, json.region, json.city].filter(Boolean).join(' ')
      // 从 org 字段提取运营商（格式：ASxxxx 运营商名）
      s.isp = (json.org || '').replace(/^AS\d+\s+/, '') || ''
      return
    }
  } catch { /* 该接口失败则继续尝试下一个 */ }
  // 接口二：ip-api.com（UTF-8，国际可访问，兜底）
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,country,regionName,city,isp`, {
      signal: AbortSignal.timeout(GEO_TIMEOUT)
    })
    const json = await res.json()
    if (json?.status === 'success') {
      s.geo = [json.country, json.regionName, json.city].filter(Boolean).join(' ')
      s.isp = json.isp || ''
    }
  } catch { /* 全部失败则保留 unknown */ }
}

// 将内存聚合数据落盘
function flush() {
  const now = new Date()
  for (const [ip, s] of stats) {
    // 合并历史与本次数据，写入总数与最近状态
    persisted[ip] = {
      requests: s.requests,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      geo: s.geo || '',
      isp: s.isp || '',
      network: s.network,
      device: s.device,
      os: s.os,
      browser: s.browser,
      paths: s.paths,
      updatedAt: now.toISOString()
    }
  }
  try {
    writeFileSync(OUT_FILE, JSON.stringify(persisted, null, 2), 'utf8')
  } catch (e) {
    console.warn('访问日志写入失败:', e.message)
  }
}

// 每日归档：把昨天的聚合快照写一份历史 json（文件名带日期）
function archiveDaily() {
  const now = new Date()
  const ymd = now.toISOString().slice(0, 10)
  const histFile = resolve(HISTORY_DIR, `access-${ymd}.json`)
  if (!existsSync(histFile)) {
    try {
      writeFileSync(histFile, JSON.stringify(Object.fromEntries(stats), null, 2), 'utf8')
    } catch { /* 归档失败不影响主流程 */ }
  }
}

// 定时 flush + 每日归档
setInterval(flush, FLUSH_INTERVAL)
setInterval(archiveDaily, 60 * 60 * 1000)
// 进程退出前落盘，避免丢失最后一段时间的数据
process.on('exit', flush)

// Express 中间件：每个请求记录一次访问（不阻塞响应）
export default function accessLogger(req, res, next) {
  // 响应完成后再记录，能包含最终访问事件；即使请求失败也记录
  record(req).catch(() => {})
  next()
}

// 供测试/调试使用
export { stats, flush, OUT_FILE }