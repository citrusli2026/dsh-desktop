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
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: #f7f8fa; color: #1f2328; display: flex; align-items: center;
         justify-content: center; height: 100vh; }
  .card { max-width: 640px; padding: 32px 40px; text-align: center; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.6; color: #4b5563; margin: 8px 0; }
  .spinner { width: 28px; height: 28px; margin: 0 auto 16px; border: 3px solid #d1d5db;
             border-top-color: #4d6bfe; border-radius: 50%;
             animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  pre { text-align: left; background: #0d1117; color: #e6edf3; padding: 16px;
        border-radius: 8px; font-size: 12px; max-height: 300px; overflow: auto; }
  button { margin: 16px auto 0; padding: 10px 28px; font-size: 14px;
           background: #4d6bfe; color: #fff; border: none; border-radius: 8px;
           cursor: pointer; }
  button:hover { background: #3b57e0; }
`

/** The startup placeholder page. */
export function loadingPageHtml(): string {
  return asDataUrl(`<!doctype html><html><head><meta charset="utf-8"><title>DSH Electron Shell</title>
    <style>${STYLE}</style></head><body><div class="card">
    <div class="spinner"></div>
    <h1>正在启动 DeepSeek Harness</h1>
    <p>首次启动需要初始化配置,请稍候…</p>
    </div></body></html>`)
}

/**
 * The gave-up error page: restart budget exhausted, with the log tail so the
 * user can report the failure.
 * @param attempts - crash count inside the restart window.
 * @param logTail - the last harness output lines.
 */
export function errorPageHtml(attempts: number, logTail: string): string {
  return asDataUrl(`<!doctype html><html><head><meta charset="utf-8"><title>DSH Electron Shell — 启动失败</title>
    <style>${STYLE}</style></head><body><div class="card">
    <h1>DeepSeek Harness 启动失败</h1>
    <p>harness 进程在短时间内崩溃了 ${attempts} 次,已停止自动重试。</p>
    <p>完整日志位于应用数据目录的 logs/harness.log;下面是最近的输出:</p>
    <pre>${escapeHtml(logTail)}</pre>
    <button onclick="retry()">重试启动</button>
    <p id="hint" style="min-height: 1.2em"></p>
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
    </script>
    </div></body></html>`)
}
