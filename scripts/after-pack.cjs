/**
 * electron-builder afterPack hook: seal the unpacked resources tree into the
 * closure integrity manifest before the installer is built (decision 0032).
 * Windows (unsigned) and Linux only — macOS seals in afterSign, because
 * codesign rewrites every Mach-O binary after this hook and the manifest
 * must describe the signed bytes. Repo is type:module, hence .cjs.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName === 'darwin') return
  await module.exports.seal(context)
}
module.exports.seal = require('./seal-closure.cjs')
