/**
 * electron-builder afterSign hook (macOS only): INTENTIONALLY A NO-OP.
 *
 * Writing the closure integrity manifest here breaks the ad-hoc seal —
 * codesign seals the entire bundle, so any file added after signing makes
 * macOS report the app as damaged and it refuses to launch (#79). On macOS
 * the code signature IS the integrity guarantee: the health check verifies
 * it at runtime with `codesign --verify --deep --strict` instead of a
 * manifest. Windows/Linux seal their manifest in afterPack (decision 0032).
 */
module.exports = async function afterSign() {}
