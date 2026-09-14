/**
 * Shared sealing logic for the electron-builder afterPack/afterSign hooks:
 * writes the closure integrity manifest over the final unpacked resources
 * tree (decision 0032). CommonJS because electron-builder loads hook files
 * with require() while the repo is type:module.
 */
module.exports = async function sealClosure(context) {
  const [{ generateClosureManifest }, { writeFileSync }, { join }] = await Promise.all([
    import('../src/main/closure-manifest.ts'),
    import('node:fs'),
    import('node:path'),
  ])
  const resourcesDir = context.packager.getResourcesDir(context.appOutDir)
  const manifest = await generateClosureManifest(resourcesDir, context.packager.appInfo.version)
  writeFileSync(join(resourcesDir, 'manifest.json'), manifest)
  const count = Object.keys(JSON.parse(manifest).files).length
  console.log(`closure manifest sealed for ${context.electronPlatformName} (${count} files)`)
}
