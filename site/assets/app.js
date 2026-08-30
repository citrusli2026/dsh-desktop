/* dsh-desktop 官网脚本 v3 (ESM):
   - 中英切换;macOS DMG / Windows EXE / Linux DEB 三端下载
   - data/release.json 渲染下载矩阵;失败回退 GitHub API;再失败保留静态兜底
   - 平台识别 CTA / 复制 / 滚动 reveal
   数据与文案字典见 ./data-model.js (纯数据层,亦被 check-site 直接导入)。
   零依赖,渐进增强。 */
import { I18N, platformOf, publicKind, splitCompositeTag, fmtSize, fmtNum, fmtDate, normalizeReleasesPayload } from './data-model.js?v=37'

var REPO = 'citrusli2026/dsh-desktop'
var RELEASES_URL = 'https://github.com/' + REPO + '/releases'
var isHomePage = !!document.querySelector('.hero')

var OS_LABEL = {
  zh: {
    mac: ['macOS', 'APPLE SILICON'],
    win: ['Windows', 'NSIS 安装包'],
    linux: ['Linux', 'DEB'],
  },
  en: {
    mac: ['macOS', 'APPLE SILICON'],
    win: ['Windows', 'NSIS INSTALLER'],
    linux: ['Linux', 'DEB'],
  },
}

/* ══ 主题状态(默认跟随系统,点按后固定浅色/深色) ═══════ */
var themeChoice = (function () {
  try {
    var saved = localStorage.getItem('dsh-site-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch (e) {}
  return null
})()
var systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false }
var THEME_COLORS = { light: '#f9f8f8', dark: '#0c0f16' }
var THEME_ICONS = {
  light: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.5"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v1.7M8 13.3V15M1 8h1.7M13.3 8H15M3 3l1.2 1.2M11.8 11.8 13 13M13 3l-1.2 1.2M4.2 11.8 3 13"/></g></svg>',
  dark: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M13.4 9.6A5.8 5.8 0 0 1 6.4 2.6a5.8 5.8 0 1 0 7 7Z"/></svg>',
}

function effectiveTheme() {
  return themeChoice || (systemDark.matches ? 'dark' : 'light')
}

function applyTheme() {
  var eff = effectiveTheme()
  document.documentElement.dataset.theme = eff
  $all('meta[name="theme-color"]').forEach(function (m) { m.content = THEME_COLORS[eff] })
  var btn = $('#theme-toggle')
  if (btn) {
    btn.innerHTML = THEME_ICONS[eff]
    btn.title = t('theme.toggle')
    btn.setAttribute('aria-label', t('theme.toggle'))
  }
}

function bindThemeToggle() {
  $('#theme-toggle').addEventListener('click', function () {
    themeChoice = effectiveTheme() === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem('dsh-site-theme', themeChoice) } catch (e) {}
    applyTheme()
  })
  var onSystemChange = function () { if (!themeChoice) applyTheme() }
  if (systemDark.addEventListener) systemDark.addEventListener('change', onSystemChange)
  else if (systemDark.addListener) systemDark.addListener(onSystemChange)
}

/* ══ 语言状态 ══════════════════════════════════════ */
var lang = (document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'
var siteData = null

function t(key) { return (I18N[lang] && I18N[lang][key]) || I18N.zh[key] || key }

/* ══ 工具 ══════════════════════════════════════════ */
function $(sel, el) { return (el || document).querySelector(sel) }
function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)) }

/* 每个资产给出两个下载源:GitCode 国内镜像(已验证可用时)+ GitHub。
   中文界面镜像排前,英文界面 GitHub 排前。 */
function linksOf(a) {
  var gh = { href: a.url, src: 'GitHub' }
  var gc = a.gitcode_url && a.gitcode_ok
    ? { href: a.gitcode_url, src: lang === 'zh' ? 'GitCode 镜像' : 'GitCode mirror' }
    : null
  if (!gc) return [gh]
  return lang === 'zh' ? [gc, gh] : [gh, gc]
}

/* ══ 数据加载 ══════════════════════════════════════ */
function fromGitHubApi() {
  return fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=5', {
    headers: { Accept: 'application/vnd.github+json' },
  }).then(function (res) {
    if (!res.ok) throw new Error('api ' + res.status)
    return res.json()
  }).then(normalizeReleasesPayload)
}

function loadData() {
  return fetch('/api/downloads', { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('downloads ' + res.status)
      return res.json()
    })
    .then(function (data) {
      if (!data || !data.release || !Array.isArray(data.release.assets) || !data.stats) {
        throw new Error('downloads payload is incomplete')
      }
      return data
    })
    .catch(function () {
      return fetch('/data/release.json', { cache: 'no-cache' })
        .then(function (res) {
          if (!res.ok) throw new Error('local ' + res.status)
          return res.json()
        })
    })
    .catch(fromGitHubApi)
}

/* ══ 渲染 ══════════════════════════════════════════ */
function animateCount(el, target, animate) {
  if (!el || typeof target !== 'number') return
  var end = Math.max(0, Math.round(target))
  var current = typeof el.__countCurrent === 'number'
    ? el.__countCurrent
    : Number(el.getAttribute('data-count-value') || 0)
  if (!Number.isFinite(current)) current = 0
  if (el.__countFrame && window.cancelAnimationFrame) window.cancelAnimationFrame(el.__countFrame)
  el.setAttribute('data-count-value', String(end))
  if (!animate || current === end || typeof window.requestAnimationFrame !== 'function') {
    el.__countCurrent = end
    el.textContent = fmtNum(end)
    return
  }

  var started = window.performance && typeof window.performance.now === 'function'
    ? window.performance.now()
    : Date.now()
  var duration = 520
  function tick(now) {
    var progress = Math.min(1, (now - started) / duration)
    var eased = 1 - Math.pow(1 - progress, 3)
    var value = Math.round(current + (end - current) * eased)
    el.__countCurrent = value
    el.textContent = fmtNum(value)
    if (progress < 1) el.__countFrame = window.requestAnimationFrame(tick)
    else el.__countFrame = 0
  }
  el.__countFrame = window.requestAnimationFrame(tick)
}

function platformTotal(data, os) {
  return data.stats && (os === 'mac' ? data.stats.mac_downloads : os === 'win' ? data.stats.win_downloads : data.stats.linux_downloads)
}

function renderHeroDownloads(data, animate) {
  var el = $('#hero-social')
  if (!el) return
  var n = data && data.stats && data.stats.installer_downloads
  if (typeof n !== 'number') return
  var template = t('hero.downloads')
  var valueEl = $('.count-value', el)
  if (!valueEl || el.getAttribute('data-count-template') !== template) {
    var parts = template.split('{n}')
    el.innerHTML = parts[0] + '<span class="count-value count-value--hero" data-count-value="0">0</span>' + parts[1]
    el.setAttribute('data-count-template', template)
    valueEl = $('.count-value', el)
  }
  el.hidden = false
  animateCount(valueEl, n, animate)
}

function renderMeta(data) {
  var r = data.release
  // 发布时间(版本号已在 hero 与下载按钮文件名中展示,这里不重复);
  // 发布 3 天内加 NEW 徽标。rc 版本均为预发布,不显示 "PRE"。
  var label = ''
  if (r.published_at) {
    label = t('dl.released').replace('{d}', fmtDate(r.published_at))
    var ageDays = (Date.now() - new Date(r.published_at).getTime()) / 86400000
    if (ageDays >= 0 && ageDays <= 3) label += ' · <span class="new-badge">' + t('dl.new') + '</span>'
  }
  var releaseMeta = $('#release-meta')
  if (releaseMeta) releaseMeta.innerHTML = label

  var meta = $('#hero-meta')
  if (meta) meta.innerHTML = r.tag + ' · macOS / Windows / Linux · <span data-i18n="hero.meta">' + t('hero.meta') + '</span>'

  var split = splitCompositeTag(r.tag)
  if (split) {
    var core = $('#v-core')
    var shell = $('#v-shell')
    if (core) core.textContent = split.core
    if (shell) shell.textContent = split.shell
    // 图例 chip 与动态版本共用同一份解析结果,杜绝硬编码失同步
    var legendCore = $('#legend-core')
    var legendShell = $('#legend-shell')
    if (legendCore) legendCore.textContent = split.core
    if (legendShell) legendShell.textContent = split.shell
  }

  var sync = $('#sync-time')
  if (sync) sync.textContent = data.generated_at
    ? (lang === 'zh' ? '数据同步于 ' : 'data synced ') + fmtDate(data.generated_at) + ' ' + data.generated_at.slice(11, 16) + ' UTC'
    : (lang === 'zh' ? '数据来自 GitHub API 实时拉取' : 'live data via GitHub API')
}

function updatePlatformCounts(data, animate) {
  ;['mac', 'win', 'linux'].forEach(function (os) {
    var el = $('.platform-hist__value[data-platform-count="' + os + '"]')
    var n = platformTotal(data, os)
    if (el && typeof n === 'number') animateCount(el, n, animate)
  })
}

function renderPlatforms(data, animate) {
  var rows = $('#platform-rows')
  if (!rows) return
  var installers = data.release.assets.filter(function (a) { return a.kind === 'installer' })
  var groups = { mac: [], win: [], linux: [] }
  installers.forEach(function (a) {
    var p = platformOf(a.name)
    if (p && groups[p.os]) groups[p.os].push(Object.assign({}, a, p))
  })

  var labels = OS_LABEL[lang]
  var html = ''
  ;['mac', 'win', 'linux'].forEach(function (os) {
    var list = groups[os]
    if (!list.length) return
    list.sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0) })
    // 该平台全版本累计下载(仅数字,说明放 tooltip)
    var hist = platformTotal(data, os)
    html += '<div class="platform-group">'
    html += '<div class="platform-group__head"><h3>' + labels[os][0] + '</h3><span>' + labels[os][1] + '</span>'
    if (typeof hist === 'number') {
      var totalParts = t('dl.platformTotal').split('{n}')
      html += '<span class="platform-hist" title="' + t('dl.total.note') + '">' + totalParts[0]
        + '<span class="platform-hist__value" data-platform-count="' + os + '" data-count-value="0">'
        + (animate ? '0' : fmtNum(hist)) + '</span>' + totalParts[1] + '</span>'
    }
    html += '</div>'
    list.forEach(function (a) {
      var links = linksOf(a)
      html += '<div class="asset-row">'
      html += '<span class="asset-row__name" title="' + a.name + '">' + a.name + '</span>'
      html += '<span class="asset-row__meta">' + fmtSize(a.size) + '</span>'
      html += '<span class="asset-row__actions">'
      links.forEach(function (link, i) {
        var btnText = a.fmt + ' · ' + link.src
        html += '<a class="dl-btn' + (i === 0 && a.primary ? '' : ' dl-btn--alt') + '" data-platform="' + os + '" href="' + link.href + '" aria-label="' + btnText + '">'
          + '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 11.5 3.5 7l1.4-1.4L7 7.7V1h2v6.7l2.1-2.1L12.5 7 8 11.5ZM2 13.5h12V15H2v-1.5Z"/></svg>'
          + btnText + '</a>'
      })
      html += '<button class="copybtn" type="button" data-copy="' + links[0].href + '">' + t('copy.link') + '</button>'
      html += '</span></div>'
    })
    html += '</div>'
  })
  if (html) {
    rows.innerHTML = html
    updatePlatformCounts(data, animate)
  }
}

function tunePrimaryCta(data) {
  var os = detectPlatform()
  var cta = $('#cta-primary')
  if (!cta) return
  // 手机/平板浏览时不下发桌面安装包,引导到下载区(在电脑上下载)。
  if (os === 'mobile') {
    cta.href = '#download'
    cta.textContent = t('hero.ctaMobile')
    return
  }
  if (!os) return
  var hit = data.release.assets.filter(function (a) {
    var p = platformOf(a.name)
    return p && p.os === os && p.primary
  })[0]
  if (!hit) return
  var link = linksOf(hit)[0]
  cta.href = link.href
  cta.textContent = (lang === 'zh'
    ? '下载 ' + OS_LABEL.zh[os][0] + ' 版'
    : 'Download for ' + OS_LABEL.en[os][0]) + ' · ' + fmtSize(hit.size)
}

/* FAQ 命令示例里的 {ver} 占位符按当前版本填充(与 release.json 同一来源,
   避免命令示例与实际文件名失同步)。 */
function fillFaqVersion() {
  if (!siteData) return
  var ver = siteData.release.tag.replace(/^v/, '')
  $all('[data-i18n^="faq.a"]').forEach(function (el) {
    if (el.innerHTML.indexOf('{ver}') === -1) return
    el.innerHTML = el.innerHTML.split('{ver}').join(ver)
  })
}

/* 访问者平台识别。注意:iOS Safari 的 UA 含 "Macintosh",必须先排除
   移动端,否则 iPhone/iPad 会被误判成 macOS(表现为默认展示 macOS 引导
   卡、点 Windows 下载按钮不滚动)。 */
function detectPlatform() {
  var ua = navigator.userAgent
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return 'mobile'
  if (/Mac/.test(ua)) return 'mac'
  if (/Windows/.test(ua)) return 'win'
  if (/Linux/.test(ua)) return 'linux'
  return null
}
var uaOs = detectPlatform()

/* 首次打开引导卡:默认按访问者平台显示;点击下载按钮时按按钮平台渲染
   (移动端访问者点击任意平台按钮都会看到对应平台的打开提示)。 */
function renderFirstRun(os) {
  var el = $('#first-run')
  if (!el) return
  os = os || uaOs
  if (!os || os === 'mobile') {
    el.hidden = true
    return
  }
  el.innerHTML =
    '<div class="first-run__card first-run__card--' + os + '">'
    + '<h4>' + t('guide.' + os + '.title') + '</h4>'
    + t('guide.' + os + '.steps')
    + '</div>'
  el.hidden = false
}

/* 点下载按钮:渲染对应平台的打开提示卡,滚动到引导卡并短暂高亮;
   同时弹出下载后提示(校验方式 + Star 邀请)。 */
function bindDownloadGuide() {
  var guide = $('#first-run')
  if (!guide) return
  $all('.dl-btn').forEach(function (btn) {
    if (btn.__guideBound) return
    btn.__guideBound = true
    btn.addEventListener('click', function () {
      var os = btn.getAttribute('data-platform')
      if (os === 'mac' || os === 'win' || os === 'linux') renderFirstRun(os)
      if (!guide.hidden) {
        guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        guide.classList.remove('is-flash')
        void guide.offsetWidth
        guide.classList.add('is-flash')
      }
      showDownloadToast(os)
      // 只给 GitCode 计引导点击(GitHub 有官方下载计数 API,不再重复计)。
      try {
        if (btn.href.indexOf('gitcode.com') !== -1) {
          navigator.sendBeacon('/api/beacon?source=gitcode&platform=' + os)
        }
      } catch (e) { /* 计数失败不影响下载 */ }
    })
  })
}

/* ══ 下载后提示(如何运行 + GitHub Star 邀请) ═══════ */
function showDownloadToast(os) {
  var toast = $('#download-toast')
  if (!toast) return
  var firstOpen = os === 'win' ? t('toast.firstOpenWin') : os === 'linux' ? t('toast.firstOpenLinux') : t('toast.firstOpenMac')
  toast.innerHTML =
    '<div class="download-toast__head"><b>' + t('toast.title') + '</b>'
    + '<button class="download-toast__close" type="button" aria-label="' + t('toast.close') + '">×</button></div>'
    + '<p class="download-toast__first">' + firstOpen + '</p>'
    + '<a class="download-toast__star" href="https://github.com/citrusli2026/dsh-desktop" target="_blank" rel="noopener">'
    + '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 .5 10 5.4l5.2.4-4 3.4 1.2 5L8 11.2 3.6 14.2l1.2-5-4-3.4L6 5.4 8 .5Z"/></svg>'
    + t('toast.star') + '</a>'
  toast.hidden = false
  var close = toast.querySelector('.download-toast__close')
  if (close) {
    close.onclick = function () { toast.hidden = true }
  }
}

/* ══ 交互 ══════════════════════════════════════════ */
function bindCopy(root) {
  $all('.copybtn', root).forEach(function (btn) {
    if (btn.__bound) return
    btn.__bound = true
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy')
      if (!text) return
      var done = function () {
        var old = btn.textContent
        btn.textContent = t('copied')
        btn.classList.add('is-copied')
        setTimeout(function () { btn.textContent = old; btn.classList.remove('is-copied') }, 1600)
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done)
      } else {
        var ta = document.createElement('textarea')
        ta.value = text; document.body.appendChild(ta); ta.select()
        try { document.execCommand('copy') } catch (e) {}
        document.body.removeChild(ta); done()
      }
    })
  })
}

/* 滚动 reveal */
function bindReveal() {
  var els = $all('[data-reveal]')
  if (!('IntersectionObserver' in window)) return
  // Content is visible by default. Only opt into the hidden start state after
  // we know the observer that will reveal it is available.
  els.forEach(function (el) { el.classList.add('reveal-pending') })
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
    })
  }, { threshold: 0.12 })
  els.forEach(function (el) { io.observe(el) })
}

/* ══ 移动端菜单(≤960px 替代隐藏的导航) ═════════════ */
function setMenu(open, focus) {
  var btn = $('#menu-toggle')
  var menu = $('#topbar-menu')
  if (!btn || !menu) return
  menu.classList.toggle('is-open', open)
  btn.classList.toggle('is-open', open)
  btn.setAttribute('aria-expanded', open ? 'true' : 'false')
  var label = t(open ? 'a11y.menuClose' : 'a11y.menuOpen')
  btn.setAttribute('aria-label', label)
  btn.setAttribute('title', label)
  if (focus) (open ? menu.querySelector('a') : btn).focus()
}

function bindMenuToggle() {
  var btn = $('#menu-toggle')
  var menu = $('#topbar-menu')
  if (!btn || !menu) return
  btn.addEventListener('click', function () {
    setMenu(!menu.classList.contains('is-open'))
  })
  $all('a', menu).forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false) })
  })
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false, true)
  })
  document.addEventListener('click', function (e) {
    if (menu.classList.contains('is-open') && !menu.contains(e.target) && !btn.contains(e.target)) {
      setMenu(false)
    }
  })
}

/* 单页导航:滚动时高亮当前章节(固定顶栏下方的一条侦测带),并标记
   aria-current 供屏幕阅读器。 */
function bindSectionSpy() {
  var links = $all('.topbar__nav a[href^="#"]')
  if (!links.length || !('IntersectionObserver' in window)) return
  var byHref = {}
  links.forEach(function (a) { byHref[a.getAttribute('href')] = a })
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return
      $all('.topbar__nav a.active').forEach(function (a) {
        a.classList.remove('active')
        a.removeAttribute('aria-current')
      })
      var link = byHref['#' + e.target.id]
      if (link) {
        link.classList.add('active')
        link.setAttribute('aria-current', 'location')
      }
    })
  }, { rootMargin: '-72px 0px -72% 0px', threshold: 0 })
  ;['workflow', 'showcase', 'download', 'features', 'market', 'faq'].forEach(function (id) {
    var el = document.getElementById(id)
    if (el) spy.observe(el)
  })
}

/* ══ 启动 ══════════════════════════════════════════ */
bindReveal()
if (isHomePage) {
  bindThemeToggle()
  bindMenuToggle()
  bindSectionSpy()
  applyTheme()
}
bindCopy(document)

loadData()
  .then(function (data) {
    siteData = data
    renderMeta(data)
    renderHeroDownloads(data, true)
    renderPlatforms(data, true)
    tunePrimaryCta(data)
    renderFirstRun()
    fillFaqVersion()
    bindCopy($('#platform-rows'))
    bindDownloadGuide()
  })
  .catch(function () {
    var releaseMeta = $('#release-meta')
    if (!releaseMeta) return
    releaseMeta.textContent = 'OFFLINE → GITHUB'
    releaseMeta.parentElement.addEventListener('click', function () {
      window.open(RELEASES_URL, '_blank')
    })
  })
