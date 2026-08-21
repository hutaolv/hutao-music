<template>
  <NavBar />
  <main class="page-container">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </main>
  <footer class="site-footer">
    <p>
      本平台为技术学习与个人使用，不存储任何音乐资源，版权归各平台所有，仅限个人非商业试听使用。
      <a href="javascript:;" class="footer-link" @click="showDisclaimer = true">查看免责声明</a>
      <span class="footer-sep">&middot;</span>
      <a class="footer-link" href="mailto:hutaolv@qq.com">反馈邮箱: hutaolv@qq.com</a>
    </p>
  </footer>
  <transition name="playerbar">
    <PlayerBar />
  </transition>
  <DesktopLyrics />

  <transition name="fade">
    <div v-if="showUpdate" class="dialog-mask" @click.self="showUpdate = false">
      <div class="dialog dialog-update">
        <div class="dialog-head">
          <span class="dialog-title">发现新版本 v{{ updateInfo.version }}</span>
          <button class="dialog-close" @click="showUpdate = false">&#x2715;</button>
        </div>
        <div class="dialog-body">
          <p v-if="updateInfo.notes" class="update-notes">{{ updateInfo.notes }}</p>
          <p>点击「下载更新」将通过系统浏览器下载最新安装包。下载完成后请前往通知栏点击安装（首次安装需在系统设置中允许"安装未知应用"）。</p>
        </div>
        <div class="dialog-foot">
          <button class="dialog-btn ghost" @click="showUpdate = false">稍后再说</button>
          <button class="dialog-btn primary" @click="downloadUpdate">下载更新</button>
        </div>
      </div>
    </div>
  </transition>

  <transition name="fade">
    <div v-if="showDisclaimer" class="dialog-mask" @click.self="showDisclaimer = false">
      <div class="dialog">
        <div class="dialog-head">
          <span class="dialog-title">免责声明</span>
          <button class="dialog-close" @click="showDisclaimer = false">&#x2715;</button>
        </div>
        <div class="dialog-body">
          <p class="dl-update">最后更新：2026-08-15</p>

          <h4>一、服务性质与定位声明</h4>
          <p>1. 本平台是一个前后端分离的音乐资源聚合与检索工具，旨在为用户提供便捷的跨平台音乐搜索与试听体验，无需注册或登录即可使用。</p>
          <p>2. 本平台展示的音乐数据（歌曲名称、歌手信息、专辑封面、歌词、音频流等）均通过后端调用第三方音乐平台的公开接口获取。本平台自身不存储、不上传、不修改任何第三方音乐资源，亦不收集用户的个人身份信息。</p>

          <h4>二、版权与知识产权声明</h4>
          <p>1. 本平台所展示音乐资源的完整知识产权均归原音乐平台或相关版权方所有。本平台仅提供数据检索与链接聚合服务，不构成对任何音乐作品的商业性发行或授权。</p>
          <p>2. 用户通过本平台获取的音乐资源，仅限用于个人学习、研究、欣赏等非商业目的。如需商业使用，请自行联系相关版权方获取合法授权。</p>
          <p>3. 若第三方平台因版权协议调整，导致本平台无法继续展示或播放某部分音乐资源，属于正常业务变动，本平台不承担由此产生的侵权责任。</p>

          <h4>三、第三方服务与稳定性免责</h4>
          <p>1. 本平台的搜索、播放等功能高度依赖第三方接口的正常运行。若因第三方平台接口升级、封禁、限流、参数变更或停止服务等原因，导致出现搜索失败、无法播放、数据缺失或延迟等情况，本平台不承担任何责任。</p>
          <p>2. 本平台将尽力维护聚合服务的稳定性，但不对第三方接口调用的成功率、响应速度及音质作绝对保证。</p>

          <h4>四、用户行为规范与本地责任</h4>
          <p>1. 用户在使用本平台时，不得利用聚合接口进行恶意抓取、高频请求、逆向工程或任何试图绕过第三方平台安全策略的行为；因滥用接口导致的封禁或法律责任，由用户自行承担。</p>
          <p>2. 用户不得利用本平台获取的音乐资源从事任何侵犯他人知识产权或违反国家法律法规的活动。</p>
          <p>3. 用户在本站产生的操作记录（如播放历史、本地收藏等）仅保存在用户本地浏览器或设备中。因设备故障、缓存清理或网络问题导致的数据丢失，本平台不承担恢复或赔偿责任。</p>

          <h4>五、侵权通知与处理机制</h4>
          <p>本平台尊重并保护知识产权。如相关版权方认为本平台的聚合展示行为超出合理使用范围或侵犯其合法权益，请及时通过下方邮箱与我们联系，并提供相关权属证明。我们将在核实后，积极配合采取断开第三方接口调用、屏蔽相关数据等措施。</p>

          <h4>六、声明的修改与解释权</h4>
          <p>本平台有权根据法律法规变化或运营需要随时修改本免责声明，修改后的声明一经公布即生效。在法律允许的范围内，本声明的最终解释权归本平台所有。</p>

          <p class="dl-contact">侵权通知与意见反馈邮箱：<a href="mailto:hutaolv@qq.com">hutaolv@qq.com</a></p>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import NavBar from './components/NavBar.vue'
import PlayerBar from './components/PlayerBar.vue'
import DesktopLyrics from './components/DesktopLyrics.vue'
import { APP_VERSION } from './version'
import { fetchLatestVersion } from './services/api'

const showDisclaimer = ref(false)

// APK 版本检测：仅打包成 APK（Capacitor）时启用，网页版始终是最新不需提示
const showUpdate = ref(false)
const updateInfo = ref({ version: '', notes: '', apkUrl: '' })

// 点分版本号比较：a > b 返回 1，a === b 返回 0，a < b 返回 -1
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

async function checkForUpdate() {
  const info = await fetchLatestVersion()
  if (info && compareVersions(info.version, APP_VERSION) > 0) {
    updateInfo.value = info
    showUpdate.value = true
  }
}

// 跳转系统浏览器下载安装包（WebView 内无法直接安装）
function downloadUpdate() {
  if (updateInfo.value.apkUrl) window.open(updateInfo.value.apkUrl, '_system')
}

onMounted(() => {
  if ('Capacitor' in window) checkForUpdate()
})
</script>

<style>
/* 播放条出现/隐藏时的滑入滑出动画（v-show 切换触发 transition 类） */
.playerbar-enter-active { transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
.playerbar-enter-from { transform: translateY(100%); }

.site-footer {
  text-align: center;
  padding: 14px 24px;
  padding-bottom: calc(var(--player-height) + 14px);
  font-size: 12px;
  color: var(--text-muted);
}

.footer-link {
  color: var(--accent-light);
  margin-left: 4px;
}

.footer-sep {
  margin: 0 6px;
  color: var(--text-muted);
}

/* 免责声明弹窗 */
.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.dialog {
  width: 100%;
  max-width: 640px;
  max-height: 85vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.dialog-title {
  font-size: 16px;
  font-weight: 700;
}

.dialog-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: background 0.2s;
}

.dialog-close:hover {
  background: var(--bg-hover);
}

.dialog-body {
  padding: 16px 20px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.dialog-body h4 {
  font-size: 14px;
  color: var(--text-primary);
  margin: 14px 0 8px;
}

.dialog-body h4:first-child {
  margin-top: 0;
}

.dialog-body p {
  margin-bottom: 6px;
}

.dl-update {
  font-size: 12px;
  color: var(--text-muted);
}

.dl-contact {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  color: var(--text-primary);
}

.dl-contact a {
  color: var(--accent-light);
}

/* 版本更新弹窗 */
.dialog-update {
  max-width: 460px;
}

.update-notes {
  padding: 10px 12px;
  margin-bottom: 10px;
  background: var(--bg-card);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  white-space: pre-line;
}

.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
}

.dialog-btn {
  padding: 9px 22px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  transition: opacity 0.2s, background 0.2s;
}

.dialog-btn.ghost {
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.dialog-btn.ghost:hover {
  background: var(--bg-hover);
}

.dialog-btn.primary {
  color: #fff;
  background: var(--accent-light);
}

.dialog-btn.primary:hover {
  opacity: 0.85;
}

@media (max-width: 767px) {
  .dialog-mask {
    padding: 12px;
    align-items: flex-end;
  }

  .dialog {
    max-height: 85vh;
    border-radius: var(--radius) var(--radius) 0 0;
  }
}
</style>