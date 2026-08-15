/* dsh-electron-shell 官网脚本 v2:
   - 中英切换(中文默认;中文模式下载链接走 GitCode 镜像,英文走 GitHub)
   - data/release.json 渲染下载矩阵;失败回退 GitHub API;再失败保留静态兜底
   - 平台识别 CTA / 复制 / Tab / 滚动 reveal
   零依赖,渐进增强。 */
(function () {
  'use strict'

  var REPO = 'citrusli2026/dsh-electron-shell'
  var RELEASES_URL = 'https://github.com/' + REPO + '/releases'

  /* ══ 文案字典 ══════════════════════════════════════ */
  var I18N = {
    zh: {
      'nav.download': '下载', 'nav.features': '特性', 'nav.version': '版本号', 'nav.faq': '常见问题', 'nav.cta': '立即下载',
      'hero.kicker': '// 非官方社区打包 · MIT 开源',
      'hero.h1': '给 DeepSeek Harness<br />一扇 <em>桌面窗口</em>。',
      'hero.sub': 'dsh-desktop 是 DeepSeek Harness 的 Electron 桌面壳:自带 Node.js 运行时与完整依赖,双击即用;独立数据目录,与命令行互不影响。',
      'hero.cta': '下载桌面版',
      'hero.meta': '无需 Node.js',
      'dl.marker': '下载', 'dl.title': '选择你的平台',
      'dl.lead': '国内用户默认走 GitCode 镜像(华为云 CDN 直连);页面数据随每次发版自动同步。',
      'dl.fallback': '版本数据加载失败时,可直接前往 <a href="https://github.com/citrusli2026/dsh-electron-shell/releases" target="_blank" rel="noopener">GitHub Releases</a> 或 <a href="https://gitcode.com/citrusli2026/dsh-electron-shell/releases" target="_blank" rel="noopener">GitCode 镜像</a> 下载。',
      'dl.note': '命令行方式同样可用;桌面壳功能与其完全一致,但使用独立数据目录 <code>~/.dsh-desktop</code>,互不干扰。',
      'dl.allfiles': '全部文件(含差量更新元数据)',
      'dl.th.file': '文件', 'dl.th.size': '大小', 'dl.th.dl': '下载量',
      'ft.marker': '特性', 'ft.title': '为什么用它',
      'ft.tab1': '零配置', 'ft.tab2': '独立环境', 'ft.tab3': '稳定守护', 'ft.tab4': '自动更新',
      'ft.p1': '<h3>无需安装 Node.js</h3><p>壳内置 Node.js 22 LTS 运行时与 <code>@deepseek-ai/dsh</code> 完整依赖闭包,版本与 SHA-256 逐平台锁定。下载安装包 → 双击 → 使用,没有任何环境配置。</p>',
      'ft.p2': '<h3>独立数据目录,环境隔离</h3><p>桌面版默认使用 <code>~/.dsh-desktop</code>:设置、会话、API Key、插件都是独立的一份,安装卸载都不影响你的命令行工作流。需要共享时,设 <code>DSH_HOME=~/.dsh</code> 即可。</p>',
      'ft.p3': '<h3>崩溃自愈,指数退避</h3><p>进程崩溃自动重启(指数退避),错误页可手动重试并查看日志尾部;单实例锁防止多开,托盘常驻,日志落盘可查。</p>',
      'ft.p4': '<h3>Windows / Linux 自动更新</h3><p>基于 electron-updater 的原地自动更新;macOS 在签名前检查新版本并引导至下载页。每日 <code>dsh-watch</code> 工作流跟踪上游 npm,有新版本自动发起升级 PR。</p>',
      'vr.marker': '版本号', 'vr.title': '版本号怎么读',
      'vr.core': '<b>内核版本</b> —— 内置的 <code>@deepseek-ai/dsh</code> 版本。每日工作流自动检查 npm 上游,有新版本就开升级 PR。',
      'vr.shell': '<b>壳修订号</b> —— 壳自身(窗口、守护、打包)的修订次数。同一内核可以有多次壳修订。',
      'faq.marker': '常见问题', 'faq.title': '常见问题',
      'faq.q1': 'macOS 提示"无法打开,因为无法验证开发者"?',
      'faq.a1': 'macOS 版目前未签名(决策记录 0004)。首次启动请 <b>右键 → 打开</b>,在弹窗中确认即可,之后正常双击启动。',
      'faq.q2': 'Windows SmartScreen 拦截怎么办?',
      'faq.a2': '安装包未购买代码签名证书。点击 <b>"更多信息" → "仍要运行"</b> 即可。安装包由 GitHub Actions 从公开源码构建,可全程审计。',
      'faq.q3': '这和 DeepSeek 官方是什么关系?',
      'faq.a3': '非官方社区打包,与 DeepSeek AI 无关联。DeepSeek Harness 是 DeepSeek 的商标;本仓库仅在 MIT 许可下再打包 <a href="https://www.npmjs.com/package/@deepseek-ai/dsh" target="_blank" rel="noopener">@deepseek-ai/dsh</a>,不改变其任何行为。',
      'faq.q4': '我在用 npx @deepseek-ai/dsh web,配置会带过来吗?',
      'faq.a4': '不会——桌面版是独立环境,数据放在 <code>~/.dsh-desktop</code>,与 CLI 的 <code>~/.dsh</code> 互不影响(决策记录 0012)。想沿用 CLI 配置,启动前设 <code>DSH_HOME=~/.dsh</code> 即可。',
      'faq.q5': 'Apple Silicon 以外的 Mac 可以用吗?',
      'faq.a5': '当前仅提供 Apple Silicon(arm64)安装包。Intel Mac 可暂时使用命令行方式 <code>npx @deepseek-ai/dsh web</code>,功能完全一致。',
      'footer.legal': 'MIT © 2026 dsh-desktop contributors<br />非官方社区打包,与 DeepSeek AI 无关联',
      'footer.mirror': 'GitCode 镜像', 'footer.releases': '全部版本', 'footer.issues': '问题反馈',
      'footer.sync': '纯静态站点 · 部署于 Vercel<br />版本数据由 GitHub Actions 自动同步',
      'copy': '复制', 'copy.link': '复制链接', 'copied': '已复制 ✓',
    },
    en: {
      'nav.download': 'DOWNLOAD', 'nav.features': 'FEATURES', 'nav.version': 'VERSIONING', 'nav.faq': 'FAQ', 'nav.cta': 'Download',
      'hero.kicker': '// UNOFFICIAL COMMUNITY PACKAGING · MIT',
      'hero.h1': 'DeepSeek Harness,<br />behind its own <em>desktop window</em>.',
      'hero.sub': 'dsh-desktop is the unofficial Electron desktop shell for DeepSeek Harness: bundled Node.js runtime and full dependency closure — download and run. Isolated data home, fully separate from the CLI.',
      'hero.cta': 'Download for Desktop',
      'hero.meta': 'NO NODE.JS REQUIRED',
      'dl.marker': 'DOWNLOAD', 'dl.title': 'Pick your platform',
      'dl.lead': 'Direct downloads from GitHub Releases. Data on this page syncs automatically with every release.',
      'dl.fallback': 'If live data fails to load, head to <a href="https://github.com/citrusli2026/dsh-electron-shell/releases" target="_blank" rel="noopener">GitHub Releases</a> directly.',
      'dl.note': 'The CLI route works too; the shell is functionally identical but keeps its own data home at <code>~/.dsh-desktop</code> — no interference either way.',
      'dl.allfiles': 'All files (incl. delta-update metadata)',
      'dl.th.file': 'FILE', 'dl.th.size': 'SIZE', 'dl.th.dl': 'DOWNLOADS',
      'ft.marker': 'FEATURES', 'ft.title': 'Why this shell',
      'ft.tab1': 'Zero setup', 'ft.tab2': 'Isolated home', 'ft.tab3': 'Supervision', 'ft.tab4': 'Auto-update',
      'ft.p1': '<h3>No Node.js install required</h3><p>The shell bundles a pinned Node.js 22 LTS runtime and the complete <code>@deepseek-ai/dsh</code> dependency closure, SHA-256 locked per platform. Download → double-click → use.</p>',
      'ft.p2': '<h3>Isolated data home</h3><p>The desktop app defaults to <code>~/.dsh-desktop</code>: settings, sessions, API keys, and plugins are its own copy — installing or uninstalling never touches your CLI workflow. Set <code>DSH_HOME=~/.dsh</code> to share again.</p>',
      'ft.p3': '<h3>Crash-proof supervision</h3><p>Auto-restart with exponential backoff, manual retry on the error page with a log tail, single-instance lock, system tray, logs on disk.</p>',
      'ft.p4': '<h3>Auto-update on Windows / Linux</h3><p>In-place updates via electron-updater; macOS checks and points to the download page until signing lands. A daily <code>dsh-watch</code> workflow tracks upstream npm and files upgrade PRs automatically.</p>',
      'vr.marker': 'VERSIONING', 'vr.title': 'Reading the version',
      'vr.core': '<b>Kernel version</b> — the bundled <code>@deepseek-ai/dsh</code> release. A daily workflow checks upstream npm and files an upgrade PR automatically.',
      'vr.shell': '<b>Shell revision</b> — how many times the shell itself (window, supervision, packaging) has been revised on this kernel.',
      'faq.marker': 'FAQ', 'faq.title': 'Frequently asked',
      'faq.q1': 'macOS says "cannot be opened because the developer cannot be verified"?',
      'faq.a1': 'The macOS build is unsigned for now (decision 0004). <b>Right-click → Open</b> on first launch and confirm; afterwards it starts normally.',
      'faq.q2': 'Windows SmartScreen blocks the installer?',
      'faq.a2': 'The installer is unsigned. Choose <b>"More info" → "Run anyway"</b>. Builds are produced by GitHub Actions from public source — fully auditable.',
      'faq.q3': 'Is this affiliated with DeepSeek?',
      'faq.a3': 'No. Unofficial community packaging, not affiliated with DeepSeek AI. DeepSeek Harness is a trademark of DeepSeek; this repo only repackages <a href="https://www.npmjs.com/package/@deepseek-ai/dsh" target="_blank" rel="noopener">@deepseek-ai/dsh</a> under MIT without changing its behavior.',
      'faq.q4': 'I use npx @deepseek-ai/dsh web — will my config carry over?',
      'faq.a4': 'No — the desktop app is an isolated environment storing data in <code>~/.dsh-desktop</code>, separate from the CLI\'s <code>~/.dsh</code> (decision 0012). To reuse your CLI setup, start it with <code>DSH_HOME=~/.dsh</code>.',
      'faq.q5': 'Macs beyond Apple Silicon?',
      'faq.a5': 'Only Apple Silicon (arm64) builds are provided for now. Intel Macs can use <code>npx @deepseek-ai/dsh web</code> — functionally identical.',
      'footer.legal': 'MIT © 2026 dsh-desktop contributors<br />Unofficial community packaging, not affiliated with DeepSeek AI',
      'footer.mirror': 'GitCode mirror', 'footer.releases': 'All releases', 'footer.issues': 'Issues',
      'footer.sync': 'Static site · deployed on Vercel<br />Release data auto-synced by GitHub Actions',
      'copy': 'COPY', 'copy.link': 'COPY LINK', 'copied': 'COPIED ✓',
    },
  }

  var OS_LABEL = {
    zh: {
      mac: ['macOS', 'APPLE SILICON · 未签名,首次请右键 → 打开'],
      win: ['Windows', 'NSIS 安装包 · SmartScreen 选"更多信息 → 仍要运行"'],
      linux: ['Linux', 'APPIMAGE 开箱即跑;DEB 适合 DEBIAN / UBUNTU 系'],
    },
    en: {
      mac: ['macOS', 'APPLE SILICON · UNSIGNED; RIGHT-CLICK → OPEN ON FIRST LAUNCH'],
      win: ['Windows', 'NSIS INSTALLER · SMARTSCREEN: "MORE INFO → RUN ANYWAY"'],
      linux: ['Linux', 'APPIMAGE RUNS ANYWHERE; DEB FOR DEBIAN / UBUNTU'],
    },
  }
  var OS_NOTE = {
    zh: {
      mac: '.dmg 拖入"应用程序"即可;.zip 解压后直接运行。',
      win: '支持 Windows 10 及以上(64 位);安装后自动更新。',
      linux: 'AppImage 需 chmod +x;两种格式均支持自动更新。',
    },
    en: {
      mac: 'Drag the .dmg into Applications; or unzip and run directly.',
      win: 'Windows 10+ (64-bit); auto-updates after install.',
      linux: 'chmod +x the AppImage; both formats auto-update.',
    },
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

  function fmtSize(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return bytes + ' B'
  }
  function fmtDate(iso) {
    var d = new Date(iso)
    if (isNaN(d)) return iso
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  function platformOf(name) {
    if (/arm64-mac\.dmg$/.test(name)) return { os: 'mac', primary: true, fmt: 'dmg' }
    if (/arm64-mac\.zip$/.test(name)) return { os: 'mac', primary: false, fmt: 'zip' }
    if (/setup-.*\.exe$/.test(name)) return { os: 'win', primary: true, fmt: 'exe' }
    if (/x86_64\.AppImage$/.test(name)) return { os: 'linux', primary: true, fmt: 'AppImage' }
    if (/amd64\.deb$/.test(name)) return { os: 'linux', primary: false, fmt: 'deb' }
    return null
  }

  /* 按语言选下载源:中文优先 GitCode 镜像(已验证可用),英文一律 GitHub */
  function linkOf(a) {
    if (lang === 'zh' && a.gitcode_url && a.gitcode_ok) {
      return { href: a.gitcode_url, badge: '<span class="src-badge src-badge--gc">GITCODE · 国内镜像</span>' }
    }
    return { href: a.url, badge: '<span class="src-badge src-badge--gh">GITHUB</span>' }
  }

  /* ══ 数据加载 ══════════════════════════════════════ */
  function fromGitHubApi() {
    return fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=5', {
      headers: { Accept: 'application/vnd.github+json' },
    }).then(function (res) {
      if (!res.ok) throw new Error('api ' + res.status)
      return res.json()
    }).then(function (releases) {
      var r = releases.filter(function (x) { return !x.draft })
        .sort(function (a, b) { return new Date(b.published_at) - new Date(a.published_at) })[0]
      if (!r) throw new Error('no release')
      return {
        generated_at: null,
        repo: { stars: null },
        release: {
          tag: r.tag_name, name: r.name || r.tag_name, html_url: r.html_url,
          published_at: r.published_at, prerelease: r.prerelease,
          assets: r.assets.map(function (a) {
            return {
              name: a.name, size: a.size, downloads: a.download_count,
              url: a.browser_download_url,
              kind: a.name.endsWith('.blockmap') ? 'blockmap' : (/^latest.*\.yml$/.test(a.name) ? 'update-meta' : 'installer'),
              gitcode_url: null, gitcode_ok: false,
            }
          }),
        },
      }
    })
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
  function renderMeta(data) {
    var r = data.release
    $('#release-meta').textContent = r.tag + ' · ' + fmtDate(r.published_at) + (r.prerelease ? ' · PRE' : '')

    var chip = $('#version-chip')
    chip.textContent = r.tag
    chip.href = r.html_url

    var meta = $('#hero-meta')
    meta.innerHTML = r.tag + ' · macOS / Windows / Linux · <span data-i18n="hero.meta">' + t('hero.meta') + '</span>'

    var ver = r.tag.replace(/^v/, '')
    var m = ver.match(/^(.*)\.(shell\.\d+)$/)
    if (m) { $('#v-core').textContent = m[1]; $('#v-shell').textContent = m[2] }

    if (data.repo && typeof data.repo.stars === 'number') $('#stars').textContent = '★ ' + data.repo.stars
    $('#sync-time').textContent = data.generated_at
      ? (lang === 'zh' ? '数据同步于 ' : 'data synced ') + fmtDate(data.generated_at) + ' ' + data.generated_at.slice(11, 16) + ' UTC'
      : (lang === 'zh' ? '数据来自 GitHub API 实时拉取' : 'live data via GitHub API')
  }

  function renderPlatforms(data) {
    var installers = data.release.assets.filter(function (a) { return a.kind === 'installer' })
    var groups = { mac: [], win: [], linux: [] }
    installers.forEach(function (a) {
      var p = platformOf(a.name)
      if (p) groups[p.os].push(Object.assign({}, a, p))
    })

    var labels = OS_LABEL[lang]
    var notes = OS_NOTE[lang]
    var html = ''
    ;['mac', 'win', 'linux'].forEach(function (os) {
      var list = groups[os]
      if (!list.length) return
      list.sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0) })
      html += '<div class="platform-group">'
      html += '<div class="platform-group__head"><h3>' + labels[os][0] + '</h3><span>' + labels[os][1] + '</span></div>'
      list.forEach(function (a) {
        var link = linkOf(a)
        html += '<div class="asset-row">'
        html += '<span class="asset-row__name" title="' + a.name + '">' + a.name + '</span>'
        html += '<span class="asset-row__meta">' + fmtSize(a.size) + ' · ↓ ' + a.downloads + '</span>'
        html += '<span class="asset-row__actions">' + link.badge
        html += '<a class="dl-btn' + (a.primary ? '' : ' dl-btn--alt') + '" href="' + link.href + '">'
          + '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 11.5 3.5 7l1.4-1.4L7 7.7V1h2v6.7l2.1-2.1L12.5 7 8 11.5ZM2 13.5h12V15H2v-1.5Z"/></svg>'
          + a.fmt + '</a>'
        html += '<button class="copybtn" type="button" data-copy="' + link.href + '">' + t('copy.link') + '</button>'
        html += '</span></div>'
      })
      html += '<p class="platform-note">' + notes[os] + '</p>'
      html += '</div>'
    })
    if (html) $('#platform-rows').innerHTML = html
  }

  function renderAllFiles(data) {
    var rows = data.release.assets.map(function (a) {
      var link = linkOf(a)
      var kind = a.kind === 'blockmap'
        ? ' <span style="color:var(--faint)">(' + (lang === 'zh' ? '差量更新' : 'delta update') + ')</span>'
        : a.kind === 'update-meta'
          ? ' <span style="color:var(--faint)">(' + (lang === 'zh' ? '更新元数据' : 'update metadata') + ')</span>'
          : ''
      return '<tr><td><a href="' + link.href + '">' + a.name + '</a>' + kind + '</td><td>'
        + fmtSize(a.size) + '</td><td>' + a.downloads + '</td>'
        + '<td><button class="copybtn" type="button" data-copy="' + link.href + '">' + t('copy.link') + '</button></td></tr>'
    }).join('')
    if (rows) $('#all-files').innerHTML = rows
  }

  function tunePrimaryCta(data) {
    var ua = navigator.userAgent
    var os = /Mac/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'win' : /Linux/.test(ua) ? 'linux' : null
    if (!os) return
    var hit = data.release.assets.filter(function (a) {
      var p = platformOf(a.name)
      return p && p.os === os && p.primary
    })[0]
    if (!hit) return
    var link = linkOf(hit)
    var cta = $('#cta-primary')
    cta.href = link.href
    cta.textContent = (lang === 'zh'
      ? '下载 ' + OS_LABEL.zh[os][0] + ' 版'
      : 'Download for ' + OS_LABEL.en[os][0]) + ' · ' + fmtSize(hit.size)
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

  function bindTabs() {
    $all('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        $all('.tab').forEach(function (x) { x.classList.remove('is-active'); x.setAttribute('aria-selected', 'false') })
        $all('.tab-panel').forEach(function (p) { p.classList.remove('is-active') })
        tab.classList.add('is-active'); tab.setAttribute('aria-selected', 'true')
        var panel = document.getElementById(tab.getAttribute('data-tab'))
        if (panel) panel.classList.add('is-active')
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
      ? 'dsh-electron-shell — DeepSeek Harness 桌面壳 · 下载'
      : 'dsh-electron-shell — DeepSeek Harness desktop shell · Download'
    $all('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n')
      if (I18N[lang][key] !== undefined) el.innerHTML = I18N[lang][key]
    })
    $('#lang-toggle').textContent = lang === 'zh' ? 'EN' : '中'
    if (siteData) {
      renderMeta(siteData)
      renderPlatforms(siteData)
      renderAllFiles(siteData)
      tunePrimaryCta(siteData)
      bindCopy($('#platform-rows'))
      bindCopy($('#all-files'))
    }
  }

  function bindLangToggle() {
    $('#lang-toggle').addEventListener('click', function () {
      lang = lang === 'zh' ? 'en' : 'zh'
      try { localStorage.setItem('dsh-site-lang', lang) } catch (e) {}
      applyLang()
    })
  }

  /* ══ 启动 ══════════════════════════════════════════ */
  bindTabs()
  bindReveal()
  bindLangToggle()
  bindCopy(document)
  if (lang === 'en') applyLang()

  loadData()
    .then(function (data) {
      siteData = data
      renderMeta(data)
      renderPlatforms(data)
      renderAllFiles(data)
      tunePrimaryCta(data)
      bindCopy($('#platform-rows'))
      bindCopy($('#all-files'))
    })
    .catch(function () {
      $('#release-meta').textContent = 'OFFLINE → GITHUB'
      $('#release-meta').parentElement.addEventListener('click', function () {
        window.open(RELEASES_URL, '_blank')
      })
    })
})()
