/**
 * Local-only shell pages rendered as data URLs: the loading screen shown
 * while the harness boots and the error screen shown when it gives up.
 * @module main/pages
 */

import { shellText, type ShellLocale } from './locale.ts'
import { asDataUrl, escapeHtml } from './shell-html.ts'
import type { ComposedRow } from './safe-mode.ts'
import type { HarnessStartupStage } from './supervisor.ts'

const STYLE = `
  :root { color-scheme: light dark; --bg: #f9f8f8; --panel: #ffffff; --line: #e7e7e9;
          --text: #202123; --muted: #676b73; --signal: #4d6bfe; --signal-soft: #eef1ff; --danger: #d14343; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0e0f12; --panel: #17181c; --line: #2b2d34; --text: #f4f4f5;
            --muted: #a6a9b0; --signal: #7690ff; --signal-soft: #202846; --danger: #ff8585; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; padding: 32px; font-family: -apple-system, BlinkMacSystemFont,
         "PingFang SC", "Segoe UI", sans-serif; background-color: var(--bg); color: var(--text);
	         display: grid; place-items: center; background-image: radial-gradient(circle at 50% 0, var(--signal-soft), transparent 42%); }
  .card { width: min(680px, 100%); padding: 34px; text-align: left; background: var(--panel);
          border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 80px rgba(22,27,45,.10); }
  .brand { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 38px;
           font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
  .brand span:first-child::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 9px;
                                  border-radius: 2px; background: var(--signal); box-shadow: 0 0 14px rgba(77,107,254,.42); }
  .status { color: var(--signal); font-weight: 500; }
  .status--error { color: var(--danger); }
  .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
             color: var(--muted); font-size: 14px; line-height: 1.5; }
  .loading-stage { color: var(--text); font-weight: 600; }
  .loading-detail { margin: 0; font-size: 12px; color: var(--muted); }
  .loading-line { width: 116px; height: 2px; overflow: hidden; border-radius: 2px; background: var(--line); }
  .loading-line::after { content: ""; display: block; width: 32%; height: 100%; background: var(--signal);
                         box-shadow: 0 0 12px rgba(77,107,254,.38); animation: travel 1.2s ease-in-out infinite; }
  h1 { font-size: clamp(22px, 4vw, 30px); line-height: 1.2; letter-spacing: -.02em; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.7; color: var(--muted); margin: 8px 0; }
  .log-label { margin-top: 28px; font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace;
               letter-spacing: .12em; color: var(--muted); }
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
  @keyframes travel { 0% { transform: translateX(-120%); } 100% { transform: translateX(340%); } }
  pre { margin: 8px 0 0; text-align: left; background: var(--bg); color: var(--text); padding: 16px;
        border: 1px solid var(--line); border-radius: 8px; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
        max-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  button { padding: 10px 18px; font-size: 13px; font-weight: 700; background: var(--signal); color: #fff;
           border: 1px solid var(--signal); border-radius: 7px; cursor: pointer; }
  button:hover { filter: brightness(1.06); }
  button:disabled { opacity: .55; cursor: wait; }
  button.secondary { background: transparent; color: var(--muted); border-color: var(--line); }
  button.secondary:hover { color: var(--text); background: var(--signal-soft); }
  .suspects { background: var(--signal-soft); color: var(--text); border-radius: 8px; font-size: 13px;
              font-weight: 600; line-height: 1.6; margin: 4px 0 10px; padding: 10px 12px; }
  .suspects code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .plugin-list { margin: 8px 0 4px; display: grid; gap: 8px; }
  .plugin-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px;
                border: 1px solid var(--line); border-radius: 9px; }
  .plugin-row code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
                     font-weight: 700; margin-right: auto; overflow-wrap: anywhere; }
  .plugin-row button { padding: 6px 12px; font-size: 12px; }
  .plugin-state { min-width: 100%; font-size: 12px; color: var(--muted); }
  .plugin-state[data-ok] { color: var(--signal); font-weight: 600; }
  .plugin-state[data-fail] { color: var(--danger); font-weight: 600; }
  button:focus-visible { outline: 2px solid var(--signal); outline-offset: 3px; }
  #hint { min-height: 1.2em; margin: 14px 0 0; color: var(--danger); }
  @media (prefers-reduced-motion: reduce) { .loading-line::after { animation: none; width: 100%; } }
  @media (max-width: 520px) { body { padding: 16px; } .card { padding: 24px; } .brand { margin-bottom: 30px; } }
`

/** The startup placeholder page. */
export function loadingPageHtml(
  locale: ShellLocale = 'en',
  stage: HarnessStartupStage = 'launching',
  retryDelayMs = 0,
): string {
  const lang = locale === 'zh' ? 'zh-CN' : 'en'
  const titleKey = stage === 'waiting-for-ready'
    ? 'page.waitingForReadyTitle'
    : stage === 'retrying'
      ? 'page.retryingTitle'
      : 'page.launchingTitle'
  const detail = stage === 'retrying'
    ? `<small class="loading-detail">${escapeHtml(shellText(locale, 'page.retryingDetail', { seconds: Math.ceil(retryDelayMs / 1000) }))}</small>`
    : ''
  return asDataUrl(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>dsh-desktop</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <style>${STYLE}</style></head><body><main class="loading" aria-live="polite">
    <span class="loading-line" aria-hidden="true"></span><span class="loading-stage">${escapeHtml(shellText(locale, titleKey))}</span>${detail}
    </main>
    </body></html>`)
}

/**
 * The recovery center: restart budget exhausted, with the log tail and the
 * recovery actions (retry, Safe Mode toggle, export, open logs).
 * @param attempts - crash count inside the restart window.
 * @param logTail - the last harness output lines.
 * @param safeMode - whether the profile is currently booted in Safe Mode.
 * @param suspects - failing-plugin rows extracted from the log tail.
 * @param locale - the active shell locale.
 * @param cause - classified failure cause; `kernel-api` swaps the hint copy
 *   to the upgrade-cliff message (update the plugin, don't reinstall the kernel).
 */
export function errorPageHtml(
  attempts: number,
  logTail: string,
  safeMode = false,
  suspects: readonly ComposedRow[] = [],
  locale: ShellLocale = 'en',
  cause: 'kernel-api' | 'unknown' = 'unknown',
): string {
  const lang = locale === 'zh' ? 'zh-CN' : 'en'
  const retry = shellText(locale, 'page.retry')
  const retrying = shellText(locale, 'page.retrying')
  const retryFailed = shellText(locale, 'page.retryFailed')
  const safeModeLabel = safeMode ? shellText(locale, 'page.safeModeExit') : shellText(locale, 'page.safeModeStart')
  const suspect = suspects[0]
  const suspectLine = suspect === undefined
    ? ''
    : `<p class="suspects">${escapeHtml(shellText(locale, 'page.suspects'))}</p>`
      .replace('{id}', escapeHtml(suspect.id))
      .replace('{name}', escapeHtml(suspect.name ?? ''))
  // One recovery row per unique failing package; patch rows of the same
  // bundle collapse onto the package the user can actually update or disable.
  const pluginNames = [...new Set(suspects.map(row => row.name).filter((name): name is string => typeof name === 'string' && name !== ''))]
  const pluginSection = pluginNames.length === 0
    ? ''
    : `<p class="log-label">${escapeHtml(shellText(locale, 'page.pluginsHeading'))}</p>
    <p>${escapeHtml(shellText(locale, cause === 'kernel-api' ? 'page.pluginsHintKernel' : 'page.pluginsHint'))}</p>
    <div class="plugin-list">${pluginNames.map(name => `
      <div class="plugin-row"><code>${escapeHtml(name)}</code>
      <button type="button" data-plugin-action="update" data-plugin="${escapeHtml(name)}">${escapeHtml(shellText(locale, 'page.pluginUpdate'))}</button>
      <button type="button" class="secondary" data-plugin-action="disable" data-plugin="${escapeHtml(name)}">${escapeHtml(shellText(locale, 'page.pluginDisable'))}</button>
      <span class="plugin-state" data-plugin-state="${escapeHtml(name)}"></span></div>`).join('')}
    </div>
    <div class="actions"><button type="button" data-plugin-action="update-all">${escapeHtml(shellText(locale, 'page.pluginUpdateAll'))}</button></div>`
  return asDataUrl(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>dsh-desktop — ${escapeHtml(shellText(locale, 'page.errorTitle'))}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
    <style>${STYLE}</style></head><body><main class="card">
    <div class="brand"><span>DSH-DESKTOP</span><span class="status status--error">${escapeHtml(shellText(locale, 'page.recoveryStatus'))}</span></div>
    <h1>${escapeHtml(shellText(locale, 'page.errorHeading'))}</h1>
    <p>${escapeHtml(shellText(locale, 'page.errorBody', { count: attempts }))}</p>
    ${suspectLine}
    ${pluginSection}
    <p class="log-label">${escapeHtml(shellText(locale, 'page.logLabel'))}</p>
    <pre>${escapeHtml(logTail)}</pre>
    <div class="actions"><button type="button" onclick="retry()">${escapeHtml(retry)}</button>
    <button type="button" onclick="bootSafe()">${escapeHtml(safeModeLabel)}</button>
    <button type="button" class="secondary" onclick="exportReport()">${escapeHtml(shellText(locale, 'page.export'))}</button>
    <button type="button" class="secondary" onclick="openLogs()">${escapeHtml(shellText(locale, 'page.openLogs'))}</button>
    <button type="button" class="secondary" onclick="getHelp()">${escapeHtml(shellText(locale, 'page.getHelp'))}</button></div>
    <p id="hint" aria-live="polite"></p>
    <script>
      function retry() {
        var button = document.querySelector('button');
        var hint = document.getElementById('hint');
        button.disabled = true;
        button.textContent = ${JSON.stringify(retrying)};
        // A resolved false means the restart never reached readiness; the
        // page must not stay stuck on "正在启动…" in that case.
        function restore() {
          button.disabled = false;
          button.textContent = ${JSON.stringify(retry)};
          hint.textContent = ${JSON.stringify(retryFailed)};
        }
        try {
          var bridge = window.dshDesktop && window.dshDesktop.retryHarness;
          var result = bridge ? bridge() : undefined;
          if (result instanceof Promise) {
            result.then(function (ok) { if (!ok) restore(); }).catch(restore);
          } else {
            restore();
          }
        } catch (error) {
          restore();
        }
      }
      function bootSafe() {
        var bridge = window.dshDesktop && window.dshDesktop.safeModeBoot;
        var enabled = ${JSON.stringify(!safeMode)};
        if (!bridge) return;
        var button = document.querySelectorAll('button')[1];
        button.disabled = true;
        // A resolved false (store write failure) must re-enable the button,
        // not leave it stuck disabled.
        function restore() { button.disabled = false; }
        bridge(enabled).then(function (ok) { if (!ok) restore(); }).catch(restore);
      }
      function exportReport() {
        var bridge = window.dshDesktop && window.dshDesktop.exportDiagnostics;
        if (bridge) bridge();
      }
      function openLogs() {
        var bridge = window.dshDesktop && window.dshDesktop.openLogsFolder;
        if (bridge) bridge();
      }
      var WORKING = ${JSON.stringify(shellText(locale, 'page.pluginWorking'))};
      var UPDATED = ${JSON.stringify(shellText(locale, 'page.pluginUpdated'))};
      var ALREADY_CURRENT = ${JSON.stringify(shellText(locale, 'page.pluginAlreadyCurrent'))};
      var ACTION_FAILED = ${JSON.stringify(shellText(locale, 'page.pluginActionFailed'))};
      function pluginBridge() { return window.dshDesktop || {}; }
      function setState(name, text, ok) {
        var state = document.querySelector('[data-plugin-state="' + name + '"]');
        if (!state) return;
        state.textContent = text;
        if (ok === true) state.setAttribute('data-ok', '');
        if (ok === false) state.setAttribute('data-fail', '');
      }
      function setPluginBusy(busy) {
        document.querySelectorAll('[data-plugin-action]').forEach(function (button) { button.disabled = busy; });
      }
      // The recovery bridge resolves true when the plugin moved to a newer
      // version, 'current' when it was already the newest obtainable one
      // (registry metadata can trail a just-published dist-tag), and false on
      // failure — all three restart the harness.
      function afterRecovery(state, ok) {
        setPluginBusy(false);
        if (ok === 'current') { setState(state, ALREADY_CURRENT, true); }
        else if (ok !== true) { setState(state, ACTION_FAILED, false); return; }
        else { setState(state, UPDATED, true); }
        var bridge = pluginBridge().retryHarness;
        if (bridge) bridge();
      }
      function runPluginAction(action, name) {
        var bridge = pluginBridge();
        var invoke = action === 'disable' ? bridge.disablePlugin : bridge.updatePlugin;
        if (!invoke) return;
        setPluginBusy(true);
        document.querySelectorAll('[data-plugin-state]').forEach(function (state) {
          if (name === undefined || state.dataset.pluginState === name) state.textContent = WORKING;
        });
        var all = action === 'update-all';
        invoke(all ? undefined : name).then(function (ok) {
          afterRecovery(all ? null : name, ok === true ? true : ok === 'current' ? 'current' : false);
        }).catch(function () { afterRecovery(all ? null : name, false); });
      }
      function getHelp() {
        var bridge = pluginBridge().openSupportIssue;
        if (bridge) bridge();
      }
      document.addEventListener('click', function (event) {
        var button = event.target instanceof Element && event.target.closest('[data-plugin-action]');
        if (!button || button.disabled) return;
        var action = button.dataset.pluginAction;
        runPluginAction(action, action === 'update-all' ? undefined : button.dataset.plugin);
      });
    </script>
    </main></body></html>`)
}
