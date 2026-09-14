/**
 * electron-builder afterSign hook (macOS only): codesign embeds signatures
 * into every Mach-O binary of the .app, so the closure integrity manifest
 * can only be sealed after signing — otherwise every signed binary would
 * verify as changed (decision 0032). Repo is type:module, hence .cjs.
 */
module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  await require('./seal-closure.cjs')(context)
}
