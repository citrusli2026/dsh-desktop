/**
 * Local-only shell pages rendered as data URLs: the loading screen shown
 * while the harness boots and the error screen shown when it gives up.
 * @module main/pages
 */

import { shellText, type ShellLocale } from './locale.ts'

/** Escape one text run for embedding in the page body. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]!
  ))
}

/** Wrap a page in a data: URL — loadURL rejects bare HTML strings. */
function asDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

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
  h1 { font-size: clamp(22px, 4vw, 30px); line-height: 1.2; letter-spacing: -.02em; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.7; color: var(--muted); margin: 8px 0; }
  .progress { height: 3px; margin-top: 30px; overflow: hidden; border-radius: 3px; background: var(--line); }
  .progress::after { content: ""; display: block; width: 34%; height: 100%; background: var(--signal);
                    box-shadow: 0 0 14px rgba(77,107,254,.38); animation: travel 1.4s ease-in-out infinite; }
  .log-label { margin-top: 28px; font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace;
               letter-spacing: .12em; color: var(--muted); }
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
  @keyframes travel { 0% { transform: translateX(-110%); } 100% { transform: translateX(310%); } }
  pre { margin: 8px 0 0; text-align: left; background: var(--bg); color: var(--text); padding: 16px;
        border: 1px solid var(--line); border-radius: 8px; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
        max-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  button { padding: 10px 18px; font-size: 13px; font-weight: 700; background: var(--signal); color: #fff;
           border: 1px solid var(--signal); border-radius: 7px; cursor: pointer; }
  button:hover { filter: brightness(1.06); }
  button:disabled { opacity: .55; cursor: wait; }
  button.secondary { background: transparent; color: var(--muted); border-color: var(--line); }
  button.secondary:hover { color: var(--text); background: var(--signal-soft); }
  button:focus-visible { outline: 2px solid var(--signal); outline-offset: 3px; }
  #hint { min-height: 1.2em; margin: 14px 0 0; color: var(--danger); }
  @media (prefers-reduced-motion: reduce) { .progress::after { animation: none; width: 100%; } }
  @media (max-width: 520px) { body { padding: 16px; } .card { padding: 24px; } .brand { margin-bottom: 30px; } }
`

/** The startup placeholder page. */
export function loadingPageHtml(locale: ShellLocale = 'en'): string {
  const lang = locale === 'zh' ? 'zh-CN' : 'en'
  return asDataUrl(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>dsh-desktop</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <style>${STYLE}</style></head><body><main class="card" aria-live="polite">
    <div class="brand"><span>DSH-DESKTOP</span><span class="status">${escapeHtml(shellText(locale, 'page.startingStatus'))}</span></div>
    <h1>${escapeHtml(shellText(locale, 'page.startingTitle'))}</h1>
    <p>${escapeHtml(shellText(locale, 'page.startingBody'))}</p>
    <div class="progress" aria-hidden="true"></div>
    </main>
    </body></html>`)
}

/**
 * The gave-up error page: restart budget exhausted, with the log tail so the
 * user can report the failure.
 * @param attempts - crash count inside the restart window.
 * @param logTail - the last harness output lines.
 */
export function errorPageHtml(attempts: number, logTail: string, locale: ShellLocale = 'en'): string {
  const lang = locale === 'zh' ? 'zh-CN' : 'en'
  const retry = shellText(locale, 'page.retry')
  const retrying = shellText(locale, 'page.retrying')
  const retryFailed = shellText(locale, 'page.retryFailed')
  return asDataUrl(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>dsh-desktop — ${escapeHtml(shellText(locale, 'page.errorTitle'))}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
    <style>${STYLE}</style></head><body><main class="card">
    <div class="brand"><span>DSH-DESKTOP</span><span class="status status--error">${escapeHtml(shellText(locale, 'page.recoveryStatus'))}</span></div>
    <h1>${escapeHtml(shellText(locale, 'page.errorHeading'))}</h1>
    <p>${escapeHtml(shellText(locale, 'page.errorBody', { count: attempts }))}</p>
    <p class="log-label">${escapeHtml(shellText(locale, 'page.logLabel'))}</p>
    <pre>${escapeHtml(logTail)}</pre>
    <div class="actions"><button type="button" onclick="retry()">${escapeHtml(retry)}</button>
    <button type="button" class="secondary" onclick="exportReport()">${escapeHtml(shellText(locale, 'page.export'))}</button></div>
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
      function exportReport() {
        var bridge = window.dshDesktop && window.dshDesktop.exportDiagnostics;
        if (bridge) bridge();
      }
    </script>
    </main></body></html>`)
}
