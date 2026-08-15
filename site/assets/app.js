/* dsh-electron-shell 官网脚本:
   1. 读取 data/release.json(GitHub Actions 定时同步)渲染下载矩阵;
      失败时回退到 GitHub API 直连,再失败则保留静态兜底。
   2. 平台识别 → 主 CTA 直达对应安装包。
   3. 复制、加速链接拼装、特性 Tab、Hero 窗口拖动。
   零依赖,渐进增强。 */
(function () {
  'use strict'

  var REPO = 'citrusli2026/dsh-electron-shell'
  var RELEASES_URL = 'https://github.com/' + REPO + '/releases'

  /* ── 工具 ─────────────────────────────────────────── */

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

  function relDays(iso) {
    var days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    if (days <= 0) return '今天发布'
    if (days === 1) return '昨天发布'
    return days + ' 天前发布'
  }

  /* 资产分类 → 平台 */
  function platformOf(name) {
    if (/arm64-mac\.dmg$/.test(name)) return { os: 'mac', primary: true, fmt: 'dmg' }
    if (/arm64-mac\.zip$/.test(name)) return { os: 'mac', primary: false, fmt: 'zip' }
    if (/setup-.*\.exe$/.test(name)) return { os: 'win', primary: true, fmt: 'exe' }
    if (/x86_64\.AppImage$/.test(name)) return { os: 'linux', primary: true, fmt: 'AppImage' }
    if (/amd64\.deb$/.test(name)) return { os: 'linux', primary: false, fmt: 'deb' }
    return null
  }

  var OS_LABEL = {
    mac: ['macOS', 'Apple Silicon · 未签名,首次请右键 → 打开'],
    win: ['Windows', 'NSIS 安装包 · SmartScreen 请选择"更多信息 → 仍要运行"'],
    linux: ['Linux', 'AppImage 开箱即跑;deb 适合 Debian / Ubuntu 系'],
  }

  /* ── 数据加载:release.json → GitHub API 回退 ────── */

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
          tag: r.tag_name,
          name: r.name || r.tag_name,
          html_url: r.html_url,
          published_at: r.published_at,
          prerelease: r.prerelease,
          assets: r.assets.map(function (a) {
            return {
              name: a.name, size: a.size, downloads: a.download_count,
              url: a.browser_download_url,
              kind: a.name.endsWith('.blockmap') ? 'blockmap' : (/^latest.*\.yml$/.test(a.name) ? 'update-meta' : 'installer'),
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

  /* ── 渲染 ─────────────────────────────────────────── */

  function renderMeta(data) {
    var r = data.release
    $('#release-meta').textContent =
      r.tag + ' · ' + fmtDate(r.published_at) + (r.prerelease ? ' · pre-release' : '')

    var chip = $('#version-chip')
    chip.textContent = r.tag
    chip.href = r.html_url

    var ver = r.tag.replace(/^v/, '')
    var m = ver.match(/^(.*)\.(shell\.\d+)$/)
    if (m) { $('#v-core').textContent = m[1]; $('#v-shell').textContent = m[2] }

    if (data.repo && typeof data.repo.stars === 'number') {
      $('#stars').textContent = '★ ' + data.repo.stars
    }
    if (data.generated_at) {
      $('#sync-time').textContent = '数据同步于 ' + fmtDate(data.generated_at) +
        (data.generated_at.indexOf('T') > 0 ? ' ' + data.generated_at.slice(11, 16) + ' UTC' : '')
    } else {
      $('#sync-time').textContent = '数据来自 GitHub API 实时拉取'
    }
  }

  function renderPlatforms(data) {
    var installers = data.release.assets.filter(function (a) { return a.kind === 'installer' })
    var groups = { mac: [], win: [], linux: [] }
    installers.forEach(function (a) {
      var p = platformOf(a.name)
      if (p) groups[p.os].push(Object.assign({}, a, p))
    })

    var html = ''
    ;['mac', 'win', 'linux'].forEach(function (os) {
      var list = groups[os]
      if (!list.length) return
      list.sort(function (a, b) { return (b.primary ? 1 : 0) - (a.primary ? 1 : 0) })
      var label = OS_LABEL[os]
      html += '<div class="platform-group">'
      html += '<div class="platform-group__head"><h3>' + label[0] + '</h3><span>' + label[1] + '</span></div>'
      list.forEach(function (a) {
        html += '<div class="asset-row">'
        html += '<span class="asset-row__name" title="' + a.name + '">' + a.name + '</span>'
        html += '<span class="asset-row__meta">' + fmtSize(a.size) + ' · ↓ ' + a.downloads + '</span>'
        html += '<span class="asset-row__actions">'
        html += '<a class="dl-btn' + (a.primary ? '' : ' dl-btn--alt') + '" href="' + a.url + '">'
          + '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M8 11.5 3.5 7l1.4-1.4L7 7.7V1h2v6.7l2.1-2.1L12.5 7 8 11.5ZM2 13.5h12V15H2v-1.5Z"/></svg>'
          + a.fmt + '</a>'
        html += '<button class="copybtn" type="button" data-copy="' + a.url + '">复制链接</button>'
        html += '</span></div>'
      })
      html += '<p class="platform-note">' + (os === 'mac' ? '.dmg 拖入"应用程序"即可;.zip 解压后直接运行。'
        : os === 'win' ? '支持 Windows 10 及以上(64 位);安装后自动更新。'
        : 'AppImage 需 chmod +x;两种格式均支持自动更新。') + '</p>'
      html += '</div>'
    })

    if (html) $('#platform-rows').innerHTML = html
  }

  function renderAllFiles(data) {
    var rows = data.release.assets.map(function (a) {
      var kind = a.kind === 'blockmap' ? ' <span style="color:var(--muted)">(差量更新)</span>'
        : a.kind === 'update-meta' ? ' <span style="color:var(--muted)">(更新元数据)</span>' : ''
      return '<tr><td><a href="' + a.url + '">' + a.name + '</a>' + kind + '</td><td>'
        + fmtSize(a.size) + '</td><td>' + a.downloads + '</td>'
        + '<td><button class="copybtn" type="button" data-copy="' + a.url + '">复制链接</button></td></tr>'
    }).join('')
    if (rows) $('#all-files').innerHTML = rows
  }

  function renderMirrorSelect(data) {
    var sel = $('#mirror-select')
    var opts = data.release.assets
      .filter(function (a) { return a.kind === 'installer' })
      .map(function (a) { return '<option value="' + a.url + '">' + a.name + '</option>' })
    if (opts.length) {
      sel.innerHTML = opts.join('')
      updateMirrorUrl()
    }
  }

  /* 平台识别 → 主 CTA */
  function tunePrimaryCta(data) {
    var ua = navigator.userAgent
    var os = /Mac/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'win' : /Linux/.test(ua) ? 'linux' : null
    if (!os) return
    var hit = data.release.assets.filter(function (a) {
      var p = platformOf(a.name)
      return p && p.os === os && p.primary
    })[0]
    if (!hit) return
    var cta = $('#cta-primary')
    cta.href = hit.url
    cta.textContent = '下载 ' + OS_LABEL[os][0] + ' 版 · ' + fmtSize(hit.size)
  }

  /* ── 交互 ─────────────────────────────────────────── */

  function bindCopy(root) {
    $all('.copybtn', root).forEach(function (btn) {
      if (btn.__bound) return
      btn.__bound = true
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy') || $('#mirror-url').textContent
        var done = function () {
          var old = btn.textContent
          btn.textContent = '已复制 ✓'
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

  function updateMirrorUrl() {
    var sel = $('#mirror-select')
    var prefix = ($('.mirror-prefix.is-active') || {}).getAttribute
      ? $('.mirror-prefix.is-active').getAttribute('data-prefix') : 'https://ghproxy.net/'
    if (sel && sel.value) {
      $('#mirror-url').textContent = prefix + sel.value
      $('#mirror-copy').setAttribute('data-copy', prefix + sel.value)
    }
  }

  function bindMirror() {
    $all('.mirror-prefix').forEach(function (b) {
      b.addEventListener('click', function () {
        $all('.mirror-prefix').forEach(function (x) { x.classList.remove('is-active') })
        b.classList.add('is-active')
        updateMirrorUrl()
      })
    })
    var sel = $('#mirror-select')
    if (sel) sel.addEventListener('change', updateMirrorUrl)
  }

  function bindTabs() {
    $all('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        $all('.tab').forEach(function (t) {
          t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false')
        })
        $all('.tab-panel').forEach(function (p) { p.classList.remove('is-active') })
        tab.classList.add('is-active'); tab.setAttribute('aria-selected', 'true')
        var panel = document.getElementById(tab.getAttribute('data-tab'))
        if (panel) panel.classList.add('is-active')
      })
    })
  }

  /* Hero 窗口拖动:仅桌面指针设备 */
  function bindDrag() {
    var bar = $('#hero-titlebar')
    var win = $('#hero-window')
    if (!bar || !win) return
    if (window.matchMedia('(hover: none)').matches) return

    var sx = 0, sy = 0, dx = 0, dy = 0, dragging = false

    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('a,button')) return
      dragging = true
      sx = e.clientX - dx; sy = e.clientY - dy
      bar.classList.add('is-dragging')
      bar.setPointerCapture(e.pointerId)
    })
    bar.addEventListener('pointermove', function (e) {
      if (!dragging) return
      dx = e.clientX - sx; dy = e.clientY - sy
      win.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'
    })
    var end = function () { dragging = false; bar.classList.remove('is-dragging') }
    bar.addEventListener('pointerup', end)
    bar.addEventListener('pointercancel', end)
  }

  /* ── 启动 ─────────────────────────────────────────── */

  bindCopy(document)
  bindMirror()
  bindTabs()
  bindDrag()

  loadData()
    .then(function (data) {
      renderMeta(data)
      renderPlatforms(data)
      renderAllFiles(data)
      renderMirrorSelect(data)
      tunePrimaryCta(data)
      bindCopy($('#platform-rows'))
      bindCopy($('#all-files'))
    })
    .catch(function () {
      $('#release-meta').textContent = '数据加载失败 → GitHub Releases'
      $('#release-meta').parentElement.addEventListener('click', function () {
        window.open(RELEASES_URL, '_blank')
      })
    })
})()
