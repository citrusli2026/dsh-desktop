/* dsh-electron-shell 官网脚本 v3 (ESM):
   - 中英切换;macOS DMG / Windows EXE 双端下载
   - data/release.json 渲染下载矩阵;失败回退 GitHub API;再失败保留静态兜底
   - 平台识别 CTA / 复制 / 滚动 reveal
   数据与文案字典见 ./data-model.js (纯数据层,亦被 check-site 直接导入)。
   零依赖,渐进增强。 */
import { I18N, mergeLiveCounts, platformOf, publicKind, splitCompositeTag, fmtSize, fmtNum, fmtDate, normalizeReleasesPayload } from './data-model.js'

var REPO = 'citrusli2026/dsh-electron-shell'
var RELEASES_URL = 'https://github.com/' + REPO + '/releases'

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
var lang = (function () {
  try {
    var saved = localStorage.getItem('dsh-site-lang')
    if (saved === 'zh' || saved === 'en') return saved
  } catch (e) {}
  return (navigator.language || 'zh').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'
})()
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
  return fetch('/data/release.json', { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('local ' + res.status)
      return res.json()
    })
    .catch(fromGitHubApi)
}

/* ══ 渲染 ══════════════════════════════════════════ */
function renderHeroDownloads(data) {
  var el = $('#hero-social')
  if (!el) return
  var n = data && data.stats && data.stats.installer_downloads
  if (typeof n !== 'number') return
  el.textContent = t('hero.downloads').replace('{n}', fmtNum(n))
  el.hidden = false
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
  $('#release-meta').innerHTML = label

  var meta = $('#hero-meta')
  meta.innerHTML = r.tag + ' · macOS / Windows / Linux · <span data-i18n="hero.meta">' + t('hero.meta') + '</span>'

  var split = splitCompositeTag(r.tag)
  if (split) {
    $('#v-core').textContent = split.core
    $('#v-shell').textContent = split.shell
    // 图例 chip 与动态版本共用同一份解析结果,杜绝硬编码失同步
    var legendCore = $('#legend-core')
    var legendShell = $('#legend-shell')
    if (legendCore) legendCore.textContent = split.core
    if (legendShell) legendShell.textContent = split.shell
  }

  $('#sync-time').textContent = data.generated_at
    ? (lang === 'zh' ? '数据同步于 ' : 'data synced ') + fmtDate(data.generated_at) + ' ' + data.generated_at.slice(11, 16) + ' UTC'
    : (lang === 'zh' ? '数据来自 GitHub API 实时拉取' : 'live data via GitHub API')
}

function renderPlatforms(data) {
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
    var hist = data.stats && (os === 'mac' ? data.stats.mac_downloads : os === 'win' ? data.stats.win_downloads : data.stats.linux_downloads)
    html += '<div class="platform-group">'
    html += '<div class="platform-group__head"><h3>' + labels[os][0] + '</h3><span>' + labels[os][1] + '</span>'
    if (typeof hist === 'number') {
      html += '<span class="platform-hist" title="' + t('dl.total.note') + '">' + t('dl.platformTotal').replace('{n}', fmtNum(hist)) + '</span>'
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
  if (html) $('#platform-rows').innerHTML = html
}

function fetchRealTimeDownloads(data) {
  fetch('/api/downloads')
    .then(function (res) { return res.json() })
    .then(function (live) {
      if (!live || !live.assets || !live.assets.length) return
      // 纯合并:返回新对象,无变化时返回 null(跳过重渲染)
      var merged = mergeLiveCounts(data, live)
      if (merged) {
        siteData = merged
        renderPlatforms(siteData)
        renderHeroDownloads(siteData)
        bindCopy($('#platform-rows'))
        bindDownloadGuide()
      }
      // 更新同步时间文案为实时模式
      var syncEl = $('#sync-time')
      if (syncEl) {
        syncEl.textContent = (lang === 'zh'
          ? '下载数实时同步于 GitHub · ' + live.generated_at.slice(11, 16) + ' UTC'
          : 'download count live-synced from GitHub · ' + live.generated_at.slice(11, 16) + ' UTC')
      }
    })
    .catch(function () { /* silent fallback */ })
}

function tunePrimaryCta(data) {
  var os = detectPlatform()
  var cta = $('#cta-primary')
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
      if (os === 'mac' || os === 'win') renderFirstRun(os)
      if (!guide.hidden) {
        guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        guide.classList.remove('is-flash')
        void guide.offsetWidth
        guide.classList.add('is-flash')
      }
      showDownloadToast(os)
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
    + '<a class="download-toast__star" href="https://github.com/citrusli2026/dsh-electron-shell" target="_blank" rel="noopener">'
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
  if (!('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('is-in') })
    return
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
    })
  }, { threshold: 0.12 })
  els.forEach(function (el) { io.observe(el) })
}

/* ══ 语言切换 ══════════════════════════════════════ */
function applyLang() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  document.title = lang === 'zh'
    ? 'dsh-desktop — DeepSeek Harness 桌面壳 · 下载'
    : 'dsh-desktop — DeepSeek Harness desktop shell · Download'
  $all('[data-i18n]').forEach(function (el) {
    var key = el.getAttribute('data-i18n')
    if (I18N[lang][key] !== undefined) el.innerHTML = I18N[lang][key]
  })
  fillFaqVersion()
  $('#lang-toggle').textContent = lang === 'zh' ? 'EN' : '中'
  var mbtn = $('#menu-toggle')
  if (mbtn) {
    var mlabel = t(mbtn.classList.contains('is-open') ? 'a11y.menuClose' : 'a11y.menuOpen')
    mbtn.setAttribute('aria-label', mlabel)
    mbtn.setAttribute('title', mlabel)
  }
  renderFirstRun()
  if (siteData) {
    renderMeta(siteData)
    renderHeroDownloads(siteData)
    renderPlatforms(siteData)
    tunePrimaryCta(siteData)
    bindCopy($('#platform-rows'))
    bindDownloadGuide()
  }
}

function bindLangToggle() {
  $('#lang-toggle').addEventListener('click', function () {
    lang = lang === 'zh' ? 'en' : 'zh'
    try { localStorage.setItem('dsh-site-lang', lang) } catch (e) {}
    applyLang()
  })
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

/* ══ 启动 ══════════════════════════════════════════ */
bindReveal()
bindLangToggle()
bindThemeToggle()
bindMenuToggle()
bindCopy(document)
applyTheme()
if (lang === 'en') applyLang()

loadData()
  .then(function (data) {
    siteData = data
    renderMeta(data)
    renderHeroDownloads(data)
    renderPlatforms(data)
    tunePrimaryCta(data)
    renderFirstRun()
    fillFaqVersion()
    bindCopy($('#platform-rows'))
    bindDownloadGuide()
    fetchRealTimeDownloads(data)
  })
  .catch(function () {
    $('#release-meta').textContent = 'OFFLINE → GITHUB'
    $('#release-meta').parentElement.addEventListener('click', function () {
      window.open(RELEASES_URL, '_blank')
    })
  })
