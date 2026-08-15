/**
 * Local-only shell pages rendered as data URLs: the loading screen shown
 * while the harness boots and the error screen shown when it gives up.
 * @module main/pages
 */

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
  :root { color-scheme: dark; --bg: #0a0b0d; --panel: #121316; --line: #262a31;
          --text: #fbfbfb; --muted: #aeb4bd; --signal: #00f48e; --danger: #ff836d; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; padding: 32px; font-family: -apple-system, BlinkMacSystemFont,
         "PingFang SC", "Segoe UI", sans-serif; background-color: var(--bg); color: var(--text);
         display: grid; place-items: center; background-image: linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
         linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px); background-size: 56px 56px; }
  .card { width: min(680px, 100%); padding: 34px; text-align: left; background: rgba(18,19,22,.94);
          border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 30px 90px rgba(0,0,0,.45); }
  .brand { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 38px;
           font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }
  .brand span:first-child::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 9px;
                                  border-radius: 2px; background: var(--signal); box-shadow: 0 0 14px rgba(0,244,142,.55); }
  .status { color: var(--signal); font-weight: 500; }
  .status--error { color: var(--danger); }
  h1 { font-size: clamp(22px, 4vw, 30px); line-height: 1.2; letter-spacing: -.02em; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.7; color: var(--muted); margin: 8px 0; }
  .progress { height: 3px; margin-top: 30px; overflow: hidden; border-radius: 3px; background: var(--line); }
  .progress::after { content: ""; display: block; width: 34%; height: 100%; background: var(--signal);
                    box-shadow: 0 0 14px rgba(0,244,142,.5); animation: travel 1.4s ease-in-out infinite; }
  .log-label { margin-top: 28px; font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace;
               letter-spacing: .12em; color: var(--muted); }
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
  @keyframes travel { 0% { transform: translateX(-110%); } 100% { transform: translateX(310%); } }
  pre { margin: 8px 0 0; text-align: left; background: #08090b; color: #cfd3da; padding: 16px;
        border: 1px solid var(--line); border-radius: 8px; font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
        max-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  button { padding: 10px 18px; font-size: 13px; font-weight: 700; background: var(--signal); color: #04150d;
           border: 1px solid var(--signal); border-radius: 7px; cursor: pointer; }
  button:hover { background: #4dffb3; }
  button:disabled { opacity: .55; cursor: wait; }
  button.secondary { background: transparent; color: var(--muted); border-color: var(--line); }
  button.secondary:hover { color: var(--text); background: #191b1f; }
  button:focus-visible { outline: 2px solid var(--signal); outline-offset: 3px; }
  #hint { min-height: 1.2em; margin: 14px 0 0; color: var(--danger); }
  @media (prefers-reduced-motion: reduce) { .progress::after { animation: none; width: 100%; } }
  @media (max-width: 520px) { body { padding: 16px; } .card { padding: 24px; } .brand { margin-bottom: 30px; } }
`

/** The startup placeholder page. */
export function loadingPageHtml(): string {
  return asDataUrl(`<!doctype html><html><head><meta charset="utf-8"><title>dsh-desktop</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <style>${STYLE}</style></head><body><main class="card" aria-live="polite">
    <div class="brand"><span>DSH-DESKTOP</span><span class="status">LOCAL · STARTING</span></div>
    <h1>正在建立本地 Harness 会话</h1>
    <p>运行时、数据目录与进程守护正在就绪。首次启动可能需要稍多一点时间。</p>
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
export function errorPageHtml(attempts: number, logTail: string): string {
  return asDataUrl(`<!doctype html><html><head><meta charset="utf-8"><title>dsh-desktop — 启动失败</title>
    <meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
    <style>${STYLE}</style></head><body><main class="card">
    <div class="brand"><span>DSH-DESKTOP</span><span class="status status--error">RECOVERY · PAUSED</span></div>
    <h1>本地 Harness 未能保持运行</h1>
    <p>进程在短时间内退出了 ${attempts} 次,自动重试已暂停。你可以再次启动,或导出一份本地诊断报告后排查。</p>
    <p class="log-label">RECENT HARNESS OUTPUT</p>
    <pre>${escapeHtml(logTail)}</pre>
    <div class="actions"><button type="button" onclick="retry()">重试启动</button>
    <button type="button" class="secondary" onclick="exportReport()">导出诊断报告</button></div>
    <p id="hint" aria-live="polite"></p>
    <script>
      function retry() {
        var button = document.querySelector('button');
        var hint = document.getElementById('hint');
        button.disabled = true;
        button.textContent = '正在启动…';
        // A resolved false means the restart never reached readiness; the
        // page must not stay stuck on "正在启动…" in that case.
        function restore() {
          button.disabled = false;
          button.textContent = '重试启动';
          hint.textContent = '启动仍未成功,请查看日志后再试。';
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
