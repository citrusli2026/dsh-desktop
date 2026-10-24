/**
 * Shell-supplied companion descriptors for known third-party plugins (ADR 0044).
 *
 * The shell must not require a plugin to change before it can be hosted: when a
 * recognised package ships no `dsh.companion` declaration, the shell serves its
 * own adapter page and supplies the descriptor here. A declaration from the
 * plugin always wins, so an upstream adoption simply replaces this entry.
 */
export interface CompanionCompatDescriptor {
  route: string
  width: number
  height: number
  title: string
  showOnMinimize: boolean
}

/** Adapter route served by `plugins/dsh-desktop-controls` (host half). */
export const COMPANION_ADAPTER_ROUTE = '/__dsh-desktop/whale-pet'

const COMPAT: Record<string, { versions: RegExp; descriptor: CompanionCompatDescriptor }> = {
  'dsh-whale-widget': {
    // The widget's DOM contract (`dshwIsChatRoot`, `.dshwv-*`) is what the
    // adapter relies on; only the reviewed 0.4.x line is claimed. A newer
    // major/minor falls back to normal plugin behaviour until re-verified.
    versions: /^0\.4\./,
    descriptor: {
      route: COMPANION_ADAPTER_ROUTE,
      width: 560,
      height: 620,
      title: '小鲸鱼',
      showOnMinimize: true,
    },
  },
}

/** Descriptor for a recognised package version, or undefined to stay hands-off. */
export function compatCompanionDescriptor(id: string, version: string): CompanionCompatDescriptor | undefined {
  const entry = COMPAT[id]
  if (entry === undefined) return undefined
  return entry.versions.test(version) ? entry.descriptor : undefined
}
