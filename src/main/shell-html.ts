/**
 * Shared shell-owned page plumbing: HTML escaping and data-URL wrapping used
 * by every local page (loading/error screens and the LAN pairing modal).
 * Previously each page re-implemented both with subtly different escape sets;
 * one definition means a XSS-relevant change lands everywhere at once.
 * @module main/shell-html
 */

/** Escape one text run for embedding in page markup (quotes included). */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!
  ))
}

/** Wrap a page in a data: URL — loadURL rejects bare HTML strings. */
export function asDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}
