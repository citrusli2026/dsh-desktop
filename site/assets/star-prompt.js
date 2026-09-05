/* dsh-desktop 官网脚本 v1 (IIFE):
   首页停留引导:真实浏览 30 秒后弹出 GitHub Star 邀请(复用 .download-toast 样式)。
   - 计时只累计页面可见时间,后台标签页不推进
   - 点过 Star 或关闭过 → localStorage 记录,之后不再打扰
   - 同页已弹出下载后提示(里面已带 Star 邀请)→ 不重复弹
   仅被 zh/en 首页引用;英文首页不加载 app.js,故独立成零依赖小脚本。 */
;(function () {
  'use strict'

  var REPO_URL = 'https://github.com/citrusli2026/dsh-desktop'
  var STORE_KEY = 'dsh-site-star-prompt'
  var DWELL_MS = 30000
  var TICK_MS = 1000

  var COPY = {
    zh: {
      title: '觉得还不错？',
      body: '你在这里逛了一会儿 —— 如果喜欢 DSH Desktop，去 GitHub 点个 Star 吧，让更多人也发现它。',
      cta: '去 GitHub 点个 Star 支持一下 →',
      close: '关闭',
    },
    en: {
      title: 'Enjoying it so far?',
      body: 'You have been browsing for a bit — if you like DSH Desktop, a GitHub Star helps more people discover it.',
      cta: 'Star us on GitHub →',
      close: 'Close',
    },
  }

  var toast = document.getElementById('star-toast')
  if (!toast) return

  var alreadyDone = false
  try {
    alreadyDone = localStorage.getItem(STORE_KEY) === 'done'
  } catch (e) {}

  function markDone() {
    try { localStorage.setItem(STORE_KEY, 'done') } catch (e) {}
  }

  function show() {
    // 下载后提示正在展示时里面已带 Star 邀请,不再叠加第二个弹框。
    var dlToast = document.getElementById('download-toast')
    if (dlToast && !dlToast.hidden) return
    var copy = COPY[(document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en']
    toast.innerHTML =
      '<div class="download-toast__head"><b>' + copy.title + '</b>'
      + '<button class="download-toast__close" type="button" aria-label="' + copy.close + '">×</button></div>'
      + '<p class="download-toast__first">' + copy.body + '</p>'
      + '<a class="download-toast__star" href="' + REPO_URL + '" target="_blank" rel="noopener">'
      + '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 .5 10 5.4l5.2.4-4 3.4 1.2 5L8 11.2 3.6 14.2l1.2-5-4-3.4L6 5.4 8 .5Z"/></svg>'
      + copy.cta + '</a>'
    toast.hidden = false
    var close = toast.querySelector('.download-toast__close')
    if (close) close.onclick = function () { toast.hidden = true; markDone() }
    var star = toast.querySelector('.download-toast__star')
    if (star) star.addEventListener('click', markDone)
  }

  if (alreadyDone) return

  // 只累计页面可见的停留时间:隐藏时暂停,回来自动续上。
  var remaining = DWELL_MS
  var timer = setInterval(function () {
    if (document.hidden) return
    remaining -= TICK_MS
    if (remaining > 0) return
    clearInterval(timer)
    show()
  }, TICK_MS)
})()
