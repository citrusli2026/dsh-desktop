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
`

/** The startup placeholder page. */
export function loadingPageHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>DSH Desktop</title>
    <style>${STYLE}</style></head><body><div class="card">
    <div class="spinner"></div>
    <h1>正在启动 DeepSeek Harness</h1>
    <p>首次启动需要初始化配置,请稍候…</p>
    </div></body></html>`
}

/**
 * The gave-up error page: restart budget exhausted, with the log tail so the
 * user can report the failure.
 * @param attempts - crash count inside the restart window.
 * @param logTail - the last harness output lines.
 */
export function errorPageHtml(attempts: number, logTail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>DSH Desktop — 启动失败</title>
    <style>${STYLE}</style></head><body><div class="card">
    <h1>DeepSeek Harness 启动失败</h1>
    <p>harness 进程在短时间内崩溃了 ${attempts} 次,已停止自动重试。</p>
    <p>完整日志位于应用数据目录的 logs/harness.log;下面是最近的输出:</p>
    <pre>${escapeHtml(logTail)}</pre>
    </div></body></html>`
}
