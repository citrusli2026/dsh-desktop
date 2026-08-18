/** Three-step first-run vision setup wizard rendered as a data: URL page. */
import type { ShellLocale } from './locale.ts'
import { escapeHtml, SETTINGS_CSS } from './settings-style.ts'
import type { VisionPluginInfo } from './vision.ts'

export function guidePage(
  locale: ShellLocale,
  t: Record<string, string>,
  vision: VisionPluginInfo,
  sampleImageDataUrl: string,
): string {
  const lang = locale === 'zh' ? 'zh-CN' : 'en'
  const g = locale === 'zh' ? {
    wizardTitle: '视觉引擎设置向导',
    step1Title: '自动探测',
    step1Heading: '复用本机引擎',
    step1Desc: '检测到以下本机 CLI 登录。勾选后即可复用为视觉引擎，无需新注册。',
    step1Empty: '未探测到可用的本机引擎，继续下一步添加一个免费引擎。',
    step2Title: '添加引擎',
    step2Heading: '添加免费引擎',
    step2Desc: '没有可用引擎？免费申请一个 Gemini API Key，粘贴后即可测试。',
    step3Title: '测试识别',
    step3Heading: '测试识别',
    step3Desc: '用内置示例图走一次真实识别，确认引擎可用。',
    next: '继续',
    back: '上一步',
    skip: '跳过',
    test: '开始测试',
    testing: '识别中…',
    done: '识别成功，引擎可用',
    testFailed: '识别失败',
    finish: '完成',
    getKey: '获取免费 Gemini API Key',
    found: '已找到',
    notLoggedIn: '未登录',
    notFound: '未安装',
    saveAndTest: '保存并测试',
    keyRequired: '请先粘贴 API Key',
    close: '关闭',
    diagnosis: '诊断',
    diagnosing: '诊断中…',
    diagnosisFailed: '诊断失败',
    retry: '重试',
    hintQuota: '引擎返回配额/用量限制（403）。等待配额刷新，或换用其他引擎。',
    hintAgy: '默认引擎 Antigravity CLI 未安装。终端执行 curl -fsSL https://antigravity.google/cli/install.sh | bash，然后运行 agy 登录。',
    hintApiKey: '引擎缺少 API 密钥。可到 aistudio.google.com/apikey 申请免费 Gemini Key，回上一步粘贴。',
    hintPiAuth: 'pi 凭据需要重新登录：在终端运行 pi 并完成浏览器登录。',
    hintClaudeLogin: 'claude-cli 调用失败：先在终端运行 claude 确认能正常对话。原因通常是未登录，或当前后端（如 CC Switch 所选的供应商）余额/配额不足（例如 402）。',
  } : {
    wizardTitle: 'Vision Setup Wizard',
    step1Title: 'Detect',
    step1Heading: 'Reuse local engines',
    step1Desc: 'Found these local CLI logins. Check any you want to reuse as a vision engine.',
    step1Empty: 'No usable local engine detected — continue to add a free one.',
    step2Title: 'Add engine',
    step2Heading: 'Add a free engine',
    step2Desc: 'No usable engine yet? Get a free Gemini API key, paste it below, and test.',
    step3Title: 'Test',
    step3Heading: 'Test recognition',
    step3Desc: 'Run a real recognition against a built-in sample image to confirm the engine works.',
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    test: 'Run test',
    testing: 'Recognizing…',
    done: 'Recognition succeeded — engine ready',
    testFailed: 'Recognition failed',
    finish: 'Finish',
    getKey: 'Get free Gemini API Key',
    found: 'Found',
    notLoggedIn: 'Not signed in',
    notFound: 'Not installed',
    saveAndTest: 'Save and test',
    keyRequired: 'Paste an API key first',
    close: 'Close',
    diagnosis: 'Diagnosis',
    diagnosing: 'Diagnosing…',
    diagnosisFailed: 'Diagnosis failed',
    retry: 'Retry',
    hintQuota: 'The engine hit a quota/usage limit (403). Wait for the quota to refresh, or use another engine.',
    hintAgy: 'The default engine, Antigravity CLI, is not installed. Run curl -fsSL https://antigravity.google/cli/install.sh | bash, then run agy to sign in.',
    hintApiKey: 'The engine is missing an API key. Get a free Gemini key at aistudio.google.com/apikey and paste it in the previous step.',
    hintPiAuth: 'The pi credential needs a fresh login: run pi in a terminal and sign in.',
    hintClaudeLogin: 'claude-cli failed: run claude in a terminal to check it can chat. Usually a missing login, or the selected backend (e.g. CC Switch provider) is out of balance/quota (e.g. 402).',
  }

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"><title>${escapeHtml(g.wizardTitle)}</title><style>${SETTINGS_CSS}
    .actions { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
    .actions .spacer { flex: 1; }
  </style></head><body>
  <div class="scroll"><div class="wrap">
    <div class="hdr">
      <h1>${escapeHtml(g.wizardTitle)}</h1>
      <span class="pill ${vision.installed ? '' : 'pill--warn'}">${vision.installed ? `ModLens v${escapeHtml(vision.version)}` : escapeHtml(t.notInstalled!)}</span>
      <span class="spacer"></span>
      <button class="btn btn--ghost" id="close">${escapeHtml(g.close)}</button>
    </div>

    <div class="steps">
      <div class="step active" id="step-label-1"><span class="dot">1</span><span class="label">${escapeHtml(g.step1Title)}</span></div>
      <div class="step" id="step-label-2"><span class="dot">2</span><span class="label">${escapeHtml(g.step2Title)}</span></div>
      <div class="step" id="step-label-3"><span class="dot">3</span><span class="label">${escapeHtml(g.step3Title)}</span></div>
    </div>

    <div class="card" id="step-1">
      <div class="card-title">${escapeHtml(g.step1Heading)}</div>
      <div class="card-desc">${escapeHtml(g.step1Desc)}</div>
      <div class="hint" id="step1-loading">${escapeHtml(t.loading!)}</div>
      <div id="reuse-list"></div>
      <div class="hint" id="step1-empty" style="display:none">${escapeHtml(g.step1Empty)}</div>
      <div class="notice" id="step1-error" style="display:none">
        <span class="notice-text" id="step1-error-text"></span>
        <button class="btn btn--ghost" id="step1-retry">${escapeHtml(g.retry)}</button>
      </div>
      <div class="actions">
        <span class="spacer"></span>
        <button class="btn btn--primary" id="step1-next">${escapeHtml(g.next)}</button>
      </div>
    </div>

    <div class="card" id="step-2" style="display:none">
      <div class="card-title">${escapeHtml(g.step2Heading)}</div>
      <div class="card-desc">${escapeHtml(g.step2Desc)}</div>
      <p style="margin-bottom:12px"><a class="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">${escapeHtml(g.getKey)} ↗</a></p>
      <div class="field">
        <label for="gemini-key">${escapeHtml(t.apiKey!)}</label>
        <input type="password" id="gemini-key" placeholder="${escapeHtml(t.apiKeyPlaceholder!)}">
      </div>
      <div class="actions">
        <button class="btn btn--ghost" id="step2-skip">${escapeHtml(g.skip)}</button>
        <span class="spacer"></span>
        <span class="status" id="step2-status"></span>
        <button class="btn btn--primary" id="step2-save">${escapeHtml(g.saveAndTest)}</button>
      </div>
    </div>

    <div class="card" id="step-3" style="display:none">
      <div class="card-title">${escapeHtml(g.step3Heading)}</div>
      <div class="card-desc">${escapeHtml(g.step3Desc)}</div>
      <img class="sample" src="${sampleImageDataUrl}" alt="sample">
      <div class="actions">
        <button class="btn btn--ghost" id="step3-back">${escapeHtml(g.back)}</button>
        <span class="spacer"></span>
        <span class="status" id="step3-status"></span>
        <button class="btn" id="step3-diagnosis">${escapeHtml(g.diagnosis)}</button>
        <button class="btn btn--primary" id="step3-test">${escapeHtml(g.test)}</button>
        <button class="btn btn--primary" id="finish" style="display:none">${escapeHtml(g.finish)}</button>
      </div>
      <div class="hints" id="step3-hints" style="display:none"></div>
      <div class="result" id="step3-result" style="display:none"></div>
      <div class="result" id="step3-diagnosis-report" style="display:none"></div>
    </div>
  </div></div>
<script>
  (function() {
    var g = ${JSON.stringify(g)};
    var t = ${JSON.stringify(t)};
    var summary = null, draft = null;
    var REUSE = ['claude','codex','opencode','pi','grok'];
    var HINT_TEXT = {
      quota: g.hintQuota,
      agy: g.hintAgy,
      'api-key': g.hintApiKey,
      'pi-auth': g.hintPiAuth,
      'claude-login': g.hintClaudeLogin,
    };
    function $(id) { return document.getElementById(id); }
    function renderHints(hints) {
      var box = $('step3-hints');
      box.innerHTML = '';
      var items = Array.isArray(hints) ? hints : [];
      items.forEach(function(h) {
        var line = document.createElement('div');
        line.className = 'hint';
        line.textContent = HINT_TEXT[h.kind] || h.message || '';
        box.appendChild(line);
      });
      box.style.display = items.length > 0 ? 'block' : 'none';
    }
    function showStep(n) {
      for (var i = 1; i <= 3; i++) {
        $('step-' + i).style.display = i === n ? 'block' : 'none';
        var label = $('step-label-' + i);
        label.className = 'step' + (i === n ? ' active' : i < n ? ' done' : '');
        if (i < n) label.querySelector('.dot').textContent = '✓';
        else label.querySelector('.dot').textContent = String(i);
      }
    }
    function setStatus(id, text, kind) {
      var el = $(id);
      el.textContent = text || '';
      el.className = 'status' + (kind ? ' status--' + kind : '');
    }
    function renderReuse() {
      var list = $('reuse-list');
      list.innerHTML = '';
      var probes = summary && Array.isArray(summary.discovery) ? summary.discovery : [];
      $('step1-empty').style.display = probes.length === 0 ? 'block' : 'none';
      probes.forEach(function(p) {
        var row = document.createElement('div'); row.className = 'row';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!draft.reuse[p.harness];
        cb.dataset.harness = p.harness;
        row.appendChild(cb);
        var name = document.createElement('span'); name.className = 'name'; name.textContent = p.harness; row.appendChild(name);
        var spacer = document.createElement('span'); spacer.className = 'spacer'; row.appendChild(spacer);
        var status = document.createElement('span');
        if (!p.cliFound) { status.className = 'chip'; status.textContent = g.notFound; }
        else if (p.loggedIn === false) { status.className = 'chip chip--warn'; status.textContent = g.notLoggedIn; }
        else { status.className = 'chip chip--ok'; status.textContent = g.found; }
        row.appendChild(status);
        list.appendChild(row);
      });
    }
    function selectedReuse() {
      var selected = {};
      var byHarness = {};
      if (summary && Array.isArray(summary.discovery)) {
        summary.discovery.forEach(function(p) { byHarness[p.harness] = p; });
      }
      var boxes = document.querySelectorAll('#reuse-list input[type=checkbox]');
      for (var i = 0; i < boxes.length; i++) {
        var box = boxes[i];
        if (!box.checked) continue;
        var p = byHarness[box.dataset.harness];
        if (p && p.cliFound && p.loggedIn !== false) selected[box.dataset.harness] = true;
      }
      return selected;
    }
    function load() {
      var loading = $('step1-loading');
      var errorBox = $('step1-error');
      loading.style.display = 'block';
      errorBox.style.display = 'none';
      $('step1-empty').style.display = 'none';
      window.dshDesktop.modlensConfig('GET', undefined).then(function(r) {
        loading.style.display = 'none';
        if (r.status !== 200) {
          // A 503 here just means the harness is not ready yet; retrying
          // after a moment is the right move, so surface it instead of
          // pretending the machine has no engines.
          summary = null; draft = null;
          $('step1-error-text').textContent = (r.data && r.data.error) || t.loadFailed;
          errorBox.style.display = 'flex';
          return;
        }
        summary = r.data;
        draft = { provider: summary.provider || '', apiKey: '', baseUrl: '', model: '', reuse: Object.assign({}, summary.reuse || {}) };
        renderReuse();
      }).catch(function(error) {
        loading.style.display = 'none';
        summary = null; draft = null;
        $('step1-error-text').textContent = String(error && error.message ? error.message : error) || t.loadFailed;
        errorBox.style.display = 'flex';
      });
    }
    $('step1-retry').addEventListener('click', load);
    $('step1-next').addEventListener('click', function() {
      if (!summary || !draft) { showStep(2); return; }
      var reuse = selectedReuse();
      var reusePayload = {};
      REUSE.forEach(function(k) { if (!!reuse[k] !== !!draft.reuse[k]) reusePayload[k] = !!reuse[k]; });
      draft.reuse = Object.assign({}, draft.reuse, reuse);
      var hasEngine = Object.keys(reuse).length > 0 || (summary.provider && summary.provider !== '');
      function advance() { if (hasEngine) showStep(3); else showStep(2); }
      if (Object.keys(reusePayload).length === 0) { advance(); return; }
      // The next step runs a real recognition against these grants, so wait
      // for the reuse save to land before moving on.
      $('step1-next').disabled = true;
      window.dshDesktop.modlensConfig('POST', JSON.stringify({ reuse: reusePayload })).then(function() {
        advance();
      }).catch(function() {
        advance();
      }).finally(function() { $('step1-next').disabled = false; });
    });
    $('step2-skip').addEventListener('click', function() { showStep(3); });
    $('step2-save').addEventListener('click', function() {
      var key = $('gemini-key').value.trim();
      if (!key) { setStatus('step2-status', g.keyRequired, 'err'); return; }
      $('step2-save').disabled = true;
      setStatus('step2-status', g.testing);
      var payload = { provider: 'gemini-api', engine: 'gemini-api', apiKey: key, baseUrl: '', model: '' };
      window.dshDesktop.modlensConfig('POST', JSON.stringify(payload)).then(function(r) {
        if (r.status !== 200) {
          setStatus('step2-status', (r.data && r.data.error) || t.error, 'err');
          $('step2-save').disabled = false;
          return;
        }
        summary = r.data;
        return window.dshDesktop.testVision().then(function(test) {
          if (test.ok) {
            setStatus('step2-status', g.done, 'ok');
            showStep(3);
            showTestResult(test);
            return window.dshDesktop.completeVisionGuide();
          }
          setStatus('step2-status', test.error || t.error, 'err');
          renderHints(test.hints);
          $('step2-save').disabled = false;
        });
      }).catch(function(error) {
        setStatus('step2-status', String(error && error.message ? error.message : error) || t.error, 'err');
        $('step2-save').disabled = false;
      });
    });
    $('step3-back').addEventListener('click', function() { showStep(2); });
    $('step3-test').addEventListener('click', function() {
      $('step3-test').disabled = true;
      setStatus('step3-status', g.testing);
      window.dshDesktop.testVision().then(function(test) {
        showTestResult(test);
        if (test.ok) {
          setStatus('step3-status', g.done, 'ok');
          return window.dshDesktop.completeVisionGuide();
        }
        setStatus('step3-status', g.testFailed, 'err');
      }).catch(function(error) {
        $('step3-result').style.display = 'block';
        $('step3-result').textContent = String(error && error.message ? error.message : error) || t.error;
        setStatus('step3-status', g.testFailed, 'err');
      }).finally(function() { $('step3-test').disabled = false; });
    });
    $('step3-diagnosis').addEventListener('click', function() {
      var report = $('step3-diagnosis-report');
      $('step3-diagnosis').disabled = true;
      setStatus('step3-status', g.diagnosing);
      window.dshDesktop.visionDoctor().then(function(d) {
        report.style.display = 'block';
        report.textContent = d.ok && d.report ? d.report : (d.error || g.diagnosisFailed);
        setStatus('step3-status', d.ok ? '' : g.diagnosisFailed, d.ok ? '' : 'err');
      }).catch(function(error) {
        report.style.display = 'block';
        report.textContent = String(error && error.message ? error.message : error) || g.diagnosisFailed;
        setStatus('step3-status', g.diagnosisFailed, 'err');
      }).finally(function() { $('step3-diagnosis').disabled = false; });
    });
    function showTestResult(test) {
      var el = $('step3-result');
      el.style.display = 'block';
      if (test.ok && test.result) {
        var text = typeof test.result === 'string' ? test.result : JSON.stringify(test.result, null, 2);
        el.textContent = text;
        renderHints(null);
        $('finish').style.display = '';
        $('step3-test').style.display = 'none';
      } else {
        el.textContent = test.error || t.error;
        renderHints(test.hints);
        $('finish').style.display = 'none';
      }
    }
    $('finish').addEventListener('click', function() { window.dshDesktop.closeSettings(); });
    $('close').addEventListener('click', function() { window.dshDesktop.closeSettings(); });
    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') window.dshDesktop.closeSettings();
    });
    load();
  })();
  </script></body></html>`
}
