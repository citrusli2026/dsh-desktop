/* Shared chrome for crawlable content pages and the branded 404 page. */
(function () {
  var root = document.documentElement
  var themeChoice = null
  try {
    var saved = localStorage.getItem('dsh-site-theme')
    if (saved === 'light' || saved === 'dark') themeChoice = saved
  } catch (e) {}

  var systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false }
  var icons = {
    light: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.5"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v1.7M8 13.3V15M1 8h1.7M13.3 8H15M3 3l1.2 1.2M11.8 11.8 13 13M13 3l-1.2 1.2M4.2 11.8 3 13"/></g></svg>',
    dark: '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M13.4 9.6A5.8 5.8 0 0 1 6.4 2.6a5.8 5.8 0 1 0 7 7Z"/></svg>',
  }

  function effectiveTheme() {
    return themeChoice || (systemDark.matches ? 'dark' : 'light')
  }

  function applyTheme() {
    var theme = effectiveTheme()
    root.dataset.theme = theme
    Array.prototype.forEach.call(document.querySelectorAll('meta[name="theme-color"]'), function (meta) {
      meta.content = theme === 'dark' ? '#0c0f16' : '#f9f8f8'
    })
    var button = document.getElementById('theme-toggle')
    if (button) {
      button.innerHTML = icons[theme]
      var label = theme === 'dark' ? '切换到浅色主题 / Switch to light theme' : '切换到深色主题 / Switch to dark theme'
      button.setAttribute('aria-label', label)
      button.setAttribute('title', label)
    }
  }

  function bindTheme() {
    var button = document.getElementById('theme-toggle')
    if (!button) return
    button.addEventListener('click', function () {
      themeChoice = effectiveTheme() === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('dsh-site-theme', themeChoice) } catch (e) {}
      applyTheme()
    })
    var onSystemChange = function () { if (!themeChoice) applyTheme() }
    if (systemDark.addEventListener) systemDark.addEventListener('change', onSystemChange)
    else if (systemDark.addListener) systemDark.addListener(onSystemChange)
  }

  function bindMenu() {
    var button = document.getElementById('menu-toggle')
    var menu = document.getElementById('topbar-menu')
    if (!button || !menu) return
    function setMenu(open, focus) {
      menu.classList.toggle('is-open', open)
      button.classList.toggle('is-open', open)
      button.setAttribute('aria-expanded', open ? 'true' : 'false')
      button.setAttribute('aria-label', open ? '关闭导航 / Close navigation' : '打开导航 / Open navigation')
      if (focus) (open ? menu.querySelector('a') : button).focus()
    }
    button.addEventListener('click', function () { setMenu(!menu.classList.contains('is-open')) })
    Array.prototype.forEach.call(menu.querySelectorAll('a'), function (link) {
      link.addEventListener('click', function () { setMenu(false) })
    })
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false, true)
    })
    document.addEventListener('click', function (event) {
      if (menu.classList.contains('is-open') && !menu.contains(event.target) && !button.contains(event.target)) setMenu(false)
    })
  }

  function markCurrentPage() {
    var current = window.location.pathname.replace(/\/$/, '') || '/'
    Array.prototype.forEach.call(document.querySelectorAll('.topbar__nav a[href^="/"]'), function (link) {
      var url = new URL(link.href, window.location.origin)
      var target = url.pathname.replace(/\/$/, '') || '/'
      if (target === current) {
        link.classList.add('active')
        link.setAttribute('aria-current', 'page')
      }
    })
  }

  function bindCoreVersion() {
    var targets = document.querySelectorAll('[data-core-version]')
    if (!targets.length || !window.fetch) return
    fetch('/data/release.json')
      .then(function (response) { return response.ok ? response.json() : null })
      .then(function (payload) {
        var tag = payload && payload.release && payload.release.tag
        var match = typeof tag === 'string' ? /^v?(.+)\.shell\.\d+$/.exec(tag) : null
        if (!match) return
        Array.prototype.forEach.call(targets, function (target) { target.textContent = match[1] })
      })
      .catch(function () {})
  }

  var errorPath = document.getElementById('error-path')
  if (errorPath) errorPath.textContent = window.location.pathname
  applyTheme()
  bindTheme()
  bindMenu()
  markCurrentPage()
  bindCoreVersion()
})()
