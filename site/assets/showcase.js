/* Real screenshot carousel for the bilingual homepage. */
(function () {
  var roots = document.querySelectorAll('[data-showcase]')
  if (!roots.length) return

  var isChinese = (document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0
  var labels = isChinese
    ? { pause: '暂停自动轮播', resume: '恢复自动轮播', previous: '上一张', next: '下一张', slide: '第 {n} 张' }
    : { pause: 'Pause auto-advance', resume: 'Resume auto-advance', previous: 'Previous screenshot', next: 'Next screenshot', slide: 'Slide {n}' }

  Array.prototype.forEach.call(roots, function (root) {
    var track = root.querySelector('[data-showcase-track]')
    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-showcase-slide]'))
    var dots = root.querySelector('[data-showcase-dots]')
    var counter = root.querySelector('[data-showcase-counter]')
    var previous = root.querySelector('[data-showcase-prev]')
    var next = root.querySelector('[data-showcase-next]')
    var toggle = root.querySelector('[data-showcase-toggle]')
    var reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false }
    var index = 0
    var timer = 0
    var engaged = false
    var manuallyPaused = false

    if (!track || slides.length < 1) return

    function stop() {
      if (timer) window.clearInterval(timer)
      timer = 0
    }

    function mayAutoAdvance() {
      return slides.length > 1 && !engaged && !manuallyPaused && !document.hidden && !reducedMotion.matches
    }

    function schedule() {
      stop()
      if (mayAutoAdvance()) timer = window.setInterval(function () { go(index + 1) }, 6000)
    }

    function updateToggle() {
      if (!toggle) return
      var label = manuallyPaused ? labels.resume : labels.pause
      toggle.setAttribute('aria-label', label)
      toggle.setAttribute('title', label)
      toggle.setAttribute('aria-pressed', manuallyPaused ? 'true' : 'false')
      var icon = toggle.querySelector('[aria-hidden="true"]')
      if (icon) icon.textContent = manuallyPaused ? '▶' : 'Ⅱ'
    }

    function updateDots() {
      if (dots) {
        Array.prototype.forEach.call(dots.children, function (dot, dotIndex) {
          dot.setAttribute('aria-current', dotIndex === index ? 'true' : 'false')
        })
      }
      slides.forEach(function (slide, slideIndex) {
        slide.setAttribute('aria-hidden', slideIndex === index ? 'false' : 'true')
      })
      if (counter) counter.textContent = String(index + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0')
    }

    function go(nextIndex) {
      index = (nextIndex + slides.length) % slides.length
      track.style.transform = 'translate3d(-' + (index * 100) + '%, 0, 0)'
      updateDots()
      schedule()
    }

    if (dots) {
      slides.forEach(function (_, dotIndex) {
        var dot = document.createElement('button')
        dot.type = 'button'
        dot.className = 'showcase__dot'
        dot.setAttribute('aria-label', labels.slide.replace('{n}', String(dotIndex + 1)))
        dot.addEventListener('click', function () { go(dotIndex) })
        dots.appendChild(dot)
      })
    }

    if (previous) {
      previous.setAttribute('aria-label', labels.previous)
      previous.setAttribute('title', labels.previous)
      previous.addEventListener('click', function () { go(index - 1) })
    }
    if (next) {
      next.setAttribute('aria-label', labels.next)
      next.setAttribute('title', labels.next)
      next.addEventListener('click', function () { go(index + 1) })
    }
    if (toggle) {
      toggle.addEventListener('click', function () {
        manuallyPaused = !manuallyPaused
        updateToggle()
        schedule()
      })
    }

    root.addEventListener('mouseenter', function () { engaged = true; schedule() })
    root.addEventListener('mouseleave', function () { engaged = false; schedule() })
    root.addEventListener('focusin', function () { engaged = true; schedule() })
    root.addEventListener('focusout', function (event) {
      if (!root.contains(event.relatedTarget)) {
        engaged = false
        schedule()
      }
    })
    document.addEventListener('visibilitychange', schedule)
    if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', schedule)
    else if (reducedMotion.addListener) reducedMotion.addListener(schedule)

    root.dataset.showcaseReady = 'true'
    updateToggle()
    updateDots()
    schedule()
  })
})()
