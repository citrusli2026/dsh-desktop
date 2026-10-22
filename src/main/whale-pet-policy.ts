/** Narrow, fail-closed contract shared by the optional whale companion window. */
export function whalePetUrl(base: string | undefined): string | undefined {
  try {
    if (base === undefined) return undefined
    const source = new URL(base)
    if (!['http:', 'https:'].includes(source.protocol)) return undefined
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname)) return undefined
    const target = new URL('/dsh-whale/pet', source.origin)
    const token = source.searchParams.get('token')
    if (token) target.searchParams.set('token', token)
    target.searchParams.set('dshwPet', '1')
    return target.href
  } catch { return undefined }
}

export function approvalClickScript(outcome: unknown, id: unknown): string | undefined {
  if (outcome !== 'allowed-once' && outcome !== 'rejected') return undefined
  if (typeof id !== 'string' || id.length === 0 || id.length > 1024) return undefined
  const labels = outcome === 'rejected' ? ['拒绝', 'Reject'] : ['允许一次', 'Allow once']
  return `(() => {
    const panels = Array.from(document.querySelectorAll('[data-approval-key]'));
    const panel = panels.find(p => p.getAttribute('data-approval-key') === ${JSON.stringify(id)});
    if (!panel) return { ok: false, reason: 'not-mounted' };
    const labels = ${JSON.stringify(labels)};
    const button = Array.from(panel.querySelectorAll('button')).find(b => !b.disabled && labels.includes((b.textContent || '').trim()));
    if (!button) return { ok: false, reason: 'no-button' };
    button.click();
    return { ok: true };
  })()`
}
