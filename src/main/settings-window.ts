/** Settings window for vision plugin configuration. */
import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { guidePage } from './guide-page.ts'
import type { ShellLocale } from './locale.ts'
import { escapeHtml, SETTINGS_CSS } from './settings-style.ts'
import { shouldShowVisionGuide } from './shell-preferences.ts'
import { getVisionPluginInfo, SAMPLE_IMAGE_DATA_URL } from './vision.ts'

let settingsWindow: BrowserWindow | undefined

function settingsPage(locale: ShellLocale, showGuide: boolean): string {
  const vision = getVisionPluginInfo()
  const lang = locale === 'zh' ? 'zh-CN' : 'en'
  const t = locale === 'zh' ? {
    title: '视觉识别设置',
    notInstalled: '未安装',
    engine: '视觉引擎',
    engineDesc: '为纯文本模型提供图片理解能力（OCR、布局分析、语义结构化）。',
    automatic: '自动（按故障转移链选择）',
    apiKey: 'API 密钥',
    apiKeyPlaceholder: '输入 API Key',
    apiKeyStored: '已保存，留空即不改动',
    baseUrl: '接口地址',
    baseUrlPlaceholder: '使用默认地址',
    model: '模型',
    modelPlaceholder: '使用默认模型',
    save: '保存',
    saving: '保存中…',
    saved: '已保存',
    error: '出现错误',
    close: '关闭',
    openConfig: '打开配置文件',
    cliNote: '该引擎通过自己的 CLI 登录，无需密钥',
    autoMode: 'Auto 模式',
    autoHint: '复用本机已有的视觉引擎，勾选即启用',
    found: '已找到',
    notLoggedIn: '未登录',
    notFound: '未安装',
    loading: '读取配置中…',
    loadFailed: '配置加载失败',
    test: '测试识别',
    testing: '识别中…',
    testOk: '识别成功，引擎可用',
    testFailed: '识别失败',
    hintQuota: '引擎返回配额/用量限制（403）。等待配额刷新，或换用其他引擎。',
    hintAgy: '默认引擎 Antigravity CLI 未安装。终端执行 curl -fsSL https://antigravity.google/cli/install.sh | bash，然后运行 agy 登录。',
    hintApiKey: '引擎缺少 API 密钥。可到 aistudio.google.com/apikey 申请免费 Gemini Key 填入。',
    hintPiAuth: 'pi 凭据需要重新登录：在终端运行 pi 并完成浏览器登录。',
    hintClaudeLogin: 'claude-cli 调用失败：先在终端运行 claude 确认能正常对话。原因通常是未登录，或当前后端（如 CC Switch 所选的供应商）余额/配额不足（例如 402）。',
  } : {
    title: 'Vision Settings',
    notInstalled: 'Not installed',
    engine: 'Vision Engine',
    engineDesc: 'Gives text-only models image understanding (OCR, layout analysis, semantic structuring).',
    automatic: 'Automatic (failover chain)',
    apiKey: 'API Key',
    apiKeyPlaceholder: 'Enter API Key',
    apiKeyStored: 'Stored, leave empty to keep',
    baseUrl: 'Base URL',
    baseUrlPlaceholder: 'Use default',
    model: 'Model',
    modelPlaceholder: 'Use default',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Something went wrong',
    close: 'Close',
    openConfig: 'Open config file',
    cliNote: 'This engine uses its own CLI login, no key needed',
    autoMode: 'Auto Mode',
    autoHint: 'Reuse vision engines already on this machine',
    found: 'Found',
    notLoggedIn: 'Not signed in',
    notFound: 'Not installed',
    loading: 'Loading configuration…',
    loadFailed: 'Failed to load configuration',
    test: 'Test vision',
    testing: 'Recognizing…',
    testOk: 'Recognition succeeded — engine ready',
    testFailed: 'Recognition failed',
    hintQuota: 'The engine hit a quota/usage limit (403). Wait for the quota to refresh, or use another engine.',
    hintAgy: 'The default engine, Antigravity CLI, is not installed. Run curl -fsSL https://antigravity.google/cli/install.sh | bash, then run agy to sign in.',
    hintApiKey: 'The engine is missing an API key. Get a free Gemini key at aistudio.google.com/apikey and paste it here.',
    hintPiAuth: 'The pi credential needs a fresh login: run pi in a terminal and sign in.',
    hintClaudeLogin: 'claude-cli failed: run claude in a terminal to check it can chat. Usually a missing login, or the selected backend (e.g. CC Switch provider) is out of balance/quota (e.g. 402).',
  }

  if (showGuide) return guidePage(locale, t as Record<string, string>, vision, SAMPLE_IMAGE_DATA_URL)

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>${escapeHtml(t.title)}</title><style>${SETTINGS_CSS}</style></head><body>
  <div class="scroll"><div class="wrap">
    <div class="hdr">
      <h1>${escapeHtml(t.title)}</h1>
      <span class="pill ${vision.installed ? '' : 'pill--warn'}">${vision.installed ? `ModLens v${escapeHtml(vision.version)}` : escapeHtml(t.notInstalled)}</span>
    </div>

    <div class="card">
      <div class="card-title">${escapeHtml(t.engine)}</div>
      <div class="card-desc">${escapeHtml(t.engineDesc)}</div>
      <div class="field">
        <label for="provider">${escapeHtml(t.engine)}</label>
        <select id="provider"><option value="">${escapeHtml(t.automatic)}</option></select>
      </div>
      <div id="engine-fields"></div>
      <div id="cli-note" style="display:none" class="hint">${escapeHtml(t.cliNote)}</div>
      <div class="card-actions">
        <button class="btn btn--ghost" id="open-config">${escapeHtml(t.openConfig)}</button>
        <button class="btn btn--ghost" id="test">${escapeHtml(t.test)}</button>
      </div>
      <div class="hints" id="test-hints" style="display:none"></div>
      <div class="result" id="test-result" style="display:none"></div>
    </div>

    <div class="card" id="auto-card" style="display:none">
      <div class="card-title">${escapeHtml(t.autoMode)}</div>
      <div class="card-desc">${escapeHtml(t.autoHint)}</div>
      <div id="reuse-list"></div>
    </div>
  </div></div>

  <div class="footer">
    <span class="status" id="status">${escapeHtml(t.loading)}</span>
    <span class="spacer"></span>
    <button class="btn" id="close">${escapeHtml(t.close)}</button>
    <button class="btn btn--primary" id="save" disabled>${escapeHtml(t.save)}</button>
  </div>
<script>
  (function() {
    var ENGINES = ['gemini-api','openai','anthropic','antigravity-cli','claude-cli'];
    var KEYLESS = ['antigravity-cli','claude-cli'];
    var REUSE = ['claude','codex','opencode','pi','grok'];
    var t = ${JSON.stringify(t)};
    var summary = null, draft = null;
    var HINT_TEXT = {
      quota: t.hintQuota,
      agy: t.hintAgy,
      'api-key': t.hintApiKey,
      'pi-auth': t.hintPiAuth,
      'claude-login': t.hintClaudeLogin,
    };

    function $(id) { return document.getElementById(id); }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function(c) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
      });
    }

    function setStatus(text, kind) {
      var el = $('status');
      el.textContent = text || '';
      el.className = 'status' + (kind ? ' status--' + kind : '');
    }

    function setDraft(key, val) {
      if (!draft) return;
      draft[key] = val;
      updateDirty();
    }

    function updateDirty() {
      if (!summary || !draft) return;
      var pristine = makeDraft(summary, draft.provider);
      var dirty = draft.provider !== summary.provider ||
        draft.apiKey !== '' ||
        draft.baseUrl !== pristine.baseUrl ||
        draft.model !== pristine.model ||
        REUSE.some(function(k) { return draft.reuse[k] !== summary.reuse[k]; });
      $('save').disabled = !dirty;
      if (dirty) setStatus('');
    }

    function makeDraft(sum, provider) {
      var e = sum.engines[provider] || {baseUrl:'',model:''};
      return { provider: provider, apiKey: '', baseUrl: e.baseUrl, model: e.model, reuse: Object.assign({}, sum.reuse) };
    }

    function render() {
      if (!summary || !draft) return;
      var prov = $('provider');
      prov.innerHTML = '<option value="">' + t.automatic + '</option>';
      ENGINES.forEach(function(name) {
        var o = document.createElement('option'); o.value = name; o.textContent = name;
        if (name === draft.provider) o.selected = true;
        prov.appendChild(o);
      });

      var fields = $('engine-fields');
      var cliNote = $('cli-note');
      var isKeyless = KEYLESS.indexOf(draft.provider) >= 0;
      var current = summary.engines[draft.provider] || {hasKey:false};

      if (draft.provider === '') {
        fields.innerHTML = '';
        cliNote.style.display = 'none';
      } else if (isKeyless) {
        fields.innerHTML = '';
        cliNote.style.display = 'block';
      } else {
        fields.innerHTML =
          '<div class="field"><label for="apiKey">' + t.apiKey + '</label><input type="password" id="apiKey" placeholder="' + (current.hasKey ? t.apiKeyStored : t.apiKeyPlaceholder) + '"></div>' +
          '<div class="field"><label for="baseUrl">' + t.baseUrl + '</label><input type="text" id="baseUrl" placeholder="' + t.baseUrlPlaceholder + '" value="' + escapeHtml(draft.baseUrl) + '"></div>' +
          '<div class="field"><label for="model">' + t.model + '</label><input type="text" id="model" placeholder="' + t.modelPlaceholder + '" value="' + escapeHtml(draft.model) + '"></div>';
        cliNote.style.display = 'none';
        var ak = $('apiKey'); if (ak) ak.addEventListener('input', function() { setDraft('apiKey', this.value); });
        var bu = $('baseUrl'); if (bu) bu.addEventListener('input', function() { setDraft('baseUrl', this.value); });
        var md = $('model'); if (md) md.addEventListener('input', function() { setDraft('model', this.value); });
      }

      var autoCard = $('auto-card');
      var probes = summary.discovery;
      var reuseList = $('reuse-list');
      if (probes && Array.isArray(probes) && probes.length > 0) {
        autoCard.style.display = 'block';
        reuseList.innerHTML = '';
        probes.forEach(function(p) {
          var row = document.createElement('div'); row.className = 'row';
          var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!draft.reuse[p.harness];
          cb.addEventListener('change', function() { draft.reuse[p.harness] = this.checked; updateDirty(); });
          row.appendChild(cb);
          var name = document.createElement('span'); name.className = 'name'; name.textContent = p.harness; row.appendChild(name);
          var spacer = document.createElement('span'); spacer.className = 'spacer'; row.appendChild(spacer);
          var status = document.createElement('span');
          if (!p.cliFound) { status.className = 'chip'; status.textContent = t.notFound; }
          else if (p.loggedIn === false) { status.className = 'chip chip--warn'; status.textContent = t.notLoggedIn; }
          else { status.className = 'chip chip--ok'; status.textContent = t.found; }
          row.appendChild(status);
          reuseList.appendChild(row);
        });
      } else {
        autoCard.style.display = 'none';
      }
    }

    function load() {
      window.dshDesktop.modlensConfig('GET', undefined).then(function(r) {
        if (r.status !== 200) { setStatus((r.data && r.data.error) || t.loadFailed, 'err'); return; }
        summary = r.data;
        draft = makeDraft(summary, summary.provider);
        render(); updateDirty();
        setStatus('');
      }).catch(function(error) {
        setStatus(String(error && error.message ? error.message : error) || t.loadFailed, 'err');
      });
    }

    $('provider').addEventListener('change', function() {
      draft = makeDraft(summary, this.value);
      render(); updateDirty();
    });

    $('save').addEventListener('click', function() {
      if (!summary || !draft) return;
      var payload = {};
      if (draft.provider !== summary.provider) payload.provider = draft.provider;
      var pristine = makeDraft(summary, draft.provider);
      var edited = draft.apiKey !== '' || draft.baseUrl !== pristine.baseUrl || draft.model !== pristine.model;
      if (draft.provider !== '' && KEYLESS.indexOf(draft.provider) < 0 && edited) {
        payload.engine = draft.provider;
        if (draft.apiKey !== '') payload.apiKey = draft.apiKey;
        payload.baseUrl = draft.baseUrl;
        payload.model = draft.model;
      }
      var reuse = {};
      REUSE.forEach(function(k) { if (draft.reuse[k] !== summary.reuse[k]) reuse[k] = draft.reuse[k]; });
      if (Object.keys(reuse).length > 0) payload.reuse = reuse;
      $('save').disabled = true; setStatus(t.saving);
      window.dshDesktop.modlensConfig('POST', JSON.stringify(payload)).then(function(r) {
        if (r.status === 200) {
          // The route's POST response is a plain summary without the probed
          // discovery section; keep the previously loaded one so the
          // auto-mode card does not vanish after a save.
          if (r.data && !r.data.discovery && summary.discovery) r.data.discovery = summary.discovery;
          summary = r.data; draft = makeDraft(summary, summary.provider);
          render(); updateDirty();
          setStatus(t.saved, 'ok');
        } else {
          setStatus((r.data && r.data.error) || t.error, 'err');
          $('save').disabled = false;
        }
      }).catch(function(error) {
        setStatus(String(error && error.message ? error.message : error) || t.error, 'err');
        $('save').disabled = false;
      });
    });

    $('open-config').addEventListener('click', function() {
      window.dshDesktop.modlensConfig('POST', JSON.stringify({open:true})).catch(function(error) {
        setStatus(String(error && error.message ? error.message : error) || t.error, 'err');
      });
    });

    function showTestOutcome(test) {
      var hints = $('test-hints');
      var result = $('test-result');
      hints.innerHTML = '';
      var items = Array.isArray(test.hints) ? test.hints : [];
      items.forEach(function(h) {
        var line = document.createElement('div');
        line.className = 'hint';
        line.textContent = HINT_TEXT[h.kind] || h.message || '';
        hints.appendChild(line);
      });
      hints.style.display = items.length > 0 ? 'block' : 'none';
      if (test.ok) {
        setStatus(t.testOk, 'ok');
        result.style.display = test.result ? 'block' : 'none';
        result.textContent = typeof test.result === 'string' ? test.result : JSON.stringify(test.result, null, 2);
      } else {
        setStatus(t.testFailed, 'err');
        result.style.display = 'block';
        result.textContent = test.error || t.error;
      }
    }

    $('test').addEventListener('click', function() {
      var btn = $('test');
      btn.disabled = true;
      setStatus(t.testing);
      window.dshDesktop.testVision().then(showTestOutcome).catch(function(error) {
        showTestOutcome({ ok: false, error: String(error && error.message ? error.message : error) || t.error });
      }).finally(function() { btn.disabled = false; });
    });

    $('close').addEventListener('click', function() { window.dshDesktop.closeSettings(); });

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') window.dshDesktop.closeSettings();
    });

    load();
  })();
  </script></body></html>`
}

export function showSettingsWindow(parent: BrowserWindow | undefined, locale: ShellLocale): BrowserWindow {
  if (settingsWindow !== undefined && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return settingsWindow
  }
  const showGuide = process.env.DSH_DESKTOP_FORCE_VISION_GUIDE === '1' || shouldShowVisionGuide()
  const window = new BrowserWindow({
    width: 560,
    height: 640,
    minWidth: 480,
    minHeight: 520,
    resizable: true,
    show: false,
    modal: parent !== undefined,
    parent,
    center: true,
    title: locale === 'zh' ? '视觉识别设置' : 'Vision Settings',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
    },
  })
  settingsWindow = window
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (settingsWindow === window) settingsWindow = undefined
  })
  window.webContents.on('will-navigate', event => {
    event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(settingsPage(locale, showGuide))}`)
  return window
}

export function isSettingsWindow(window: BrowserWindow | undefined | null): window is BrowserWindow {
  return window !== undefined && window !== null && !window.isDestroyed() && window === settingsWindow
}

export function closeSettingsWindow(): void {
  if (settingsWindow !== undefined && !settingsWindow.isDestroyed()) settingsWindow.close()
  settingsWindow = undefined
}
