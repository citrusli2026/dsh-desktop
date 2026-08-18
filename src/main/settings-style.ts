/**
 * Shared visual language for the shell-owned settings surfaces (vision
 * settings form and first-run wizard): design tokens, base element styles,
 * and small HTML helpers. Both pages are rendered as data: URLs, so the CSS
 * is inlined from here into each document.
 * @module main/settings-style
 */

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!)
}

/**
 * The shared stylesheet. Tokens follow the shell/site palette
 * (#4d6bfe accent on a neutral, system-font base) with automatic dark mode;
 * layout is a single centered column of grouped cards, with a footer action
 * bar pinned to the window's bottom edge.
 */
export const SETTINGS_CSS = `
  :root {
    color-scheme: light dark;
    --bg: #f4f5f8; --panel: #ffffff; --panel-inset: #f6f7fa;
    --text: #1b1f27; --muted: #636b7b; --faint: #9aa2b1;
    --line: #e5e8ef; --line-strong: #d4d9e3;
    --accent: #4d6bfe; --accent-strong: #3b57e8; --accent-soft: rgba(77, 107, 254, .1);
    --success: #16a34a; --success-soft: rgba(22, 163, 74, .12);
    --warning: #b45309; --warning-soft: rgba(180, 83, 9, .12);
    --danger: #dc2626; --danger-soft: rgba(220, 38, 38, .09);
    --radius: 14px; --radius-sm: 9px;
    --shadow: 0 1px 2px rgba(16, 24, 40, .04);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #101216; --panel: #1b1e25; --panel-inset: #15171d;
      --text: #f1f2f5; --muted: #9aa2b1; --faint: #67707f;
      --line: #2b2f3a; --line-strong: #394050;
      --accent: #8195ff; --accent-strong: #9dacff; --accent-soft: rgba(129, 149, 255, .16);
      --success: #4ade80; --success-soft: rgba(74, 222, 128, .12);
      --warning: #fbbf24; --warning-soft: rgba(251, 191, 36, .12);
      --danger: #f87171; --danger-soft: rgba(248, 113, 113, .12);
      --shadow: none;
    }
  }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg); color: var(--text);
    font: 13px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex; flex-direction: column;
    user-select: none;
  }
  input, select, textarea { user-select: text; }
  ::-webkit-scrollbar { width: 10px; }
  ::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 5px; border: 3px solid transparent; background-clip: content-box; }
  ::-webkit-scrollbar-thumb:hover { background: var(--faint); background-clip: content-box; }
  ::-webkit-scrollbar-track { background: transparent; }

  .scroll { flex: 1; overflow-y: auto; padding: 22px 22px 12px; }
  .wrap { max-width: 468px; margin: 0 auto; }

  .hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
  .hdr h1 { font-size: 18px; font-weight: 700; letter-spacing: -.01em; }
  .hdr .spacer { flex: 1; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px;
    background: var(--accent-soft); color: var(--accent); white-space: nowrap;
  }
  .pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .pill--warn { background: var(--danger-soft); color: var(--danger); }
  .pill--warn::before { background: var(--danger); }

  .card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 18px 20px; margin-bottom: 14px;
    box-shadow: var(--shadow);
    animation: card-in .18s ease-out;
  }
  @keyframes card-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .card-title { font-size: 14px; font-weight: 680; margin-bottom: 3px; }
  .card-desc { font-size: 12px; color: var(--muted); margin-bottom: 14px; }

  .field { margin-bottom: 13px; }
  .field:last-child { margin-bottom: 0; }
  .field label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
  .field input, .field select {
    width: 100%; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
    background: var(--panel-inset); color: var(--text); font: inherit; outline: none;
    transition: border-color .15s, box-shadow .15s, background .15s;
  }
  .field input:hover, .field select:hover { border-color: var(--faint); }
  .field input:focus, .field select:focus {
    border-color: var(--accent); background: var(--panel);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .field input::placeholder { color: var(--faint); }
  .field select {
    appearance: none; cursor: pointer; padding-right: 32px;
    background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%);
    background-position: calc(100% - 17px) 55%, calc(100% - 12px) 55%;
    background-size: 5px 5px; background-repeat: no-repeat;
  }
  .hint { font-size: 12px; color: var(--muted); }
  .hints { margin-top: 10px; }
  .hints .hint { margin-bottom: 6px; }
  .hints .hint:last-child { margin-bottom: 0; }

  .notice {
    display: flex; align-items: center; gap: 10px;
    margin-top: 12px; padding: 9px 12px;
    background: var(--danger-soft); border: 1px solid var(--danger-soft);
    border-radius: var(--radius-sm); font-size: 12px; color: var(--danger);
  }
  .notice-text { flex: 1; min-width: 0; overflow-wrap: break-word; }

  .row {
    display: flex; align-items: center; gap: 10px; padding: 9px 0;
    border-bottom: 1px solid var(--line);
  }
  .row:last-child { border-bottom: none; }
  .row input[type=checkbox] { width: 15px; height: 15px; accent-color: var(--accent); flex-shrink: 0; }
  .row .name { font-weight: 550; }
  .row .spacer { flex: 1; }
  .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
  .chip--ok { color: var(--success); } .chip--ok::before { background: var(--success); }
  .chip--warn { color: var(--warning); } .chip--warn::before { background: var(--warning); }

  .steps { display: flex; align-items: flex-start; margin: 2px 8px 20px; }
  .step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; position: relative; text-align: center; }
  .step .dot {
    width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
    font-size: 12px; font-weight: 700; background: var(--panel); border: 1.5px solid var(--line-strong);
    color: var(--faint); position: relative; z-index: 1; transition: all .2s;
  }
  .step .label { font-size: 11px; color: var(--faint); transition: color .2s; }
  .step::before {
    content: ""; position: absolute; top: 13px; left: calc(-50% + 17px); right: calc(50% + 17px);
    height: 2px; border-radius: 1px; background: var(--line-strong);
  }
  .step:first-child::before { display: none; }
  .step.active .dot { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 4px var(--accent-soft); }
  .step.active .label { color: var(--accent); font-weight: 600; }
  .step.done .dot { border-color: var(--accent); background: var(--accent); color: #fff; }
  .step.done .label { color: var(--muted); }

  .footer {
    display: flex; align-items: center; gap: 8px;
    padding: 11px 22px; border-top: 1px solid var(--line);
    background: var(--panel);
  }
  .footer .spacer { flex: 1; }
  .btn {
    padding: 6px 15px; min-height: 30px; border-radius: var(--radius-sm);
    border: 1px solid var(--line-strong); background: var(--panel); color: var(--text);
    font: inherit; font-weight: 600; cursor: pointer;
    transition: border-color .15s, background .15s, color .15s, filter .15s, opacity .15s;
    white-space: nowrap; flex-shrink: 0;
  }
  .btn:hover { border-color: var(--accent); color: var(--accent); }
  .btn:active { background: var(--panel-inset); }
  .btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }
  .btn:disabled { opacity: .5; cursor: default; pointer-events: none; }
  .btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn--primary:hover { background: var(--accent-strong); border-color: var(--accent-strong); color: #fff; }
  .btn--primary:active { background: var(--accent); filter: brightness(.95); }
  .btn--ghost { border-color: transparent; background: none; color: var(--muted); padding: 6px 10px; }
  .btn--ghost:hover { color: var(--accent); border-color: transparent; background: var(--accent-soft); }
  .link { color: var(--accent); text-decoration: none; font-weight: 550; }
  .link:hover { text-decoration: underline; }

  .card-actions { display: flex; align-items: center; gap: 4px; margin-top: 14px; }

  .status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); min-height: 18px; min-width: 0; }
  .status:empty { display: none; }
  .status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--faint); flex-shrink: 0; }
  .status--ok { color: var(--success); } .status--ok::before { background: var(--success); }
  .status--err { color: var(--danger); } .status--err::before { background: var(--danger); }

  .sample {
    display: block; max-width: 100%; max-height: 220px; margin: 6px auto 14px;
    border: 1px solid var(--line); border-radius: var(--radius-sm);
  }
  .result {
    margin-top: 12px; padding: 11px 13px; background: var(--panel-inset);
    border: 1px solid var(--line); border-radius: var(--radius-sm);
    font: 12px/1.6 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow: auto;
    user-select: text;
  }

  @media (prefers-reduced-motion: reduce) {
    .card { animation: none; }
    .btn, .field input, .field select, .step .dot, .step .label { transition: none; }
  }
`
