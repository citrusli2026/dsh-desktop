/**
 * Make webserver route registration survive a plugin fiber reload (upstream
 * dsh-whale-widget#268). Cordis re-runs `apply` before disposing the old
 * execution, so a plugin that registers exact routes throws
 * `webserver: duplicate exact route` on the second pass and the desktop
 * restarts. The guard lives on globalThis so it survives this plugin's own
 * reload, and only replaces a route it registered itself.
 */
const KEY = '__dshDesktopRouteGuard'

export function installRouteGuard(webServer) {
  if (webServer === null || typeof webServer !== 'object' || typeof webServer.register !== 'function') return false
  const existing = globalThis[KEY]
  if (existing?.server === webServer) return true
  const owned = new Map()
  const original = webServer.register.bind(webServer)
  try {
    webServer.register = route => {
      const key = `${route?.kind ?? 'exact'}:${route?.path ?? ''}`
      const previous = owned.get(key)
      if (previous !== undefined) {
        try { previous() } catch { /* the old fiber already removed it */ }
      }
      const dispose = original(route)
      owned.set(key, dispose)
      return () => {
        if (owned.get(key) === dispose) owned.delete(key)
        dispose()
      }
    }
  } catch (error) {
    console.warn(`dsh-desktop-controls: route guard unavailable: ${String(error)}`)
    return false
  }
  globalThis[KEY] = { server: webServer, owned }
  return true
}
