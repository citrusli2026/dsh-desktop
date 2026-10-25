/**
 * Pure policy for installed-plugin companion windows (ADR 0043).
 *
 * A plugin opts in from its own package.json:
 *   "dsh": { "companion": { "route": "/dsh-whale/pet", "width": 560, "height": 620 } }
 *
 * Nothing here executes plugin code or touches Electron, so the contract can
 * be unit-tested without a window.
 */

export interface CompanionDescriptor {
  /** Installed package name; also the stable controller id. */
  id: string
  /** Absolute path on the Harness origin, never a full URL. */
  route: string
  width: number
  height: number
  title: string
  /** Show automatically when the main window is minimized. */
  showOnMinimize: boolean
}

export const COMPANION_LIMITS = {
  minSize: 240,
  maxSize: 1200,
  defaultWidth: 480,
  defaultHeight: 600,
  maxRouteLength: 200,
  maxTitleLength: 80,
  maxCompanions: 8,
  /** Upper bound for scanning one profile's node_modules. */
  maxPackages: 400,
} as const

export function isCompanionRoute(route: string): boolean {
  if (route.length === 0 || route.length > COMPANION_LIMITS.maxRouteLength) return false
  if (!route.startsWith('/') || route.startsWith('//')) return false
  if (route.includes('\\') || route.includes('..') || route.includes('?') || route.includes('#')) return false
  return !/[\s\u0000-\u001f]/.test(route)
}

function companionSize(raw: unknown, fallback: number): number | undefined {
  if (raw === undefined) return fallback
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) return undefined
  if (raw < COMPANION_LIMITS.minSize || raw > COMPANION_LIMITS.maxSize) return undefined
  return raw
}

/** Validate one package's `dsh.companion` value; anything malformed is ignored. */
export function parseCompanionDescriptor(id: string, raw: unknown): CompanionDescriptor | undefined {
  if (typeof id !== 'string' || id === '' || id.length > 214) return undefined
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  if (typeof value.route !== 'string' || !isCompanionRoute(value.route)) return undefined
  const width = companionSize(value.width, COMPANION_LIMITS.defaultWidth)
  const height = companionSize(value.height, COMPANION_LIMITS.defaultHeight)
  if (width === undefined || height === undefined) return undefined
  const title = typeof value.title === 'string' && value.title.trim() !== ''
    ? value.title.trim().slice(0, COMPANION_LIMITS.maxTitleLength)
    : id
  return {
    id,
    route: value.route,
    width,
    height,
    title,
    showOnMinimize: value.showOnMinimize !== false,
  }
}

/**
 * Build the companion URL from the Harness URL. Only a loopback HTTP(S)
 * Harness is accepted; the path comes from the declaration, never from the
 * page, and only the login token is forwarded.
 */
export function companionUrl(base: string | undefined, route: string, extraParams?: Record<string, string>): string | undefined {
  if (!isCompanionRoute(route) || base === undefined) return undefined
  try {
    const source = new URL(base)
    if (!['http:', 'https:'].includes(source.protocol)) return undefined
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname)) return undefined
    const target = new URL(route, source.origin)
    const token = source.searchParams.get('token')
    if (token !== null) target.searchParams.set('token', token)
    target.searchParams.set('dshCompanion', '1')
    for (const [key, value] of Object.entries(extraParams ?? {})) target.searchParams.set(key, value)
    return target.href
  } catch {
    return undefined
  }
}

/**
 * Click-through relies on `forward` being honoured: only darwin/win32 forward
 * mouse moves to a window that ignores them. Elsewhere the page could never
 * re-enable interaction, so the window stays interactive.
 */
export function canForwardMouseMoves(platform: NodeJS.Platform): boolean {
  return platform === 'darwin' || platform === 'win32'
}

/** A companion is shown only after the Harness serves a real HTML page. */
export function isCompanionResponseOk(status: number, contentType: string | null): boolean {
  if (status < 200 || status >= 300) return false
  return contentType !== null && /^text\/html\b/i.test(contentType)
}

/** Bottom-right placement with a small cascade for multiple companions. */
export function companionPosition(
  workArea: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
  index = 0,
): { x: number; y: number } {
  const margin = 8
  const offset = Math.max(0, index) * 24
  return {
    x: Math.max(workArea.x, workArea.x + workArea.width - size.width - margin - offset),
    y: Math.max(workArea.y, workArea.y + workArea.height - size.height - margin - offset),
  }
}
