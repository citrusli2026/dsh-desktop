/** Shared unpacked-app locator for packaged smoke and packaged E2E. */
import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

async function filesBelow(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) result.push(...await filesBelow(path))
    else result.push(path)
  }
  return result
}

function isExecutable(path) {
  const normalized = path.replaceAll('\\', '/')
  if (process.platform === 'darwin') return normalized.endsWith('/dsh-desktop.app/Contents/MacOS/dsh-desktop')
  if (process.platform === 'win32') return basename(path).toLowerCase() === 'dsh-desktop.exe' && normalized.includes('/win-unpacked/')
  return basename(path) === 'dsh-desktop' && normalized.includes('/linux-unpacked/')
}

/** Absolute path of the current platform's unpacked app binary under distRoot. */
export async function locatePackagedExecutable(distRoot = 'dist') {
  const executable = (await filesBelow(distRoot)).find(isExecutable)
  if (executable === undefined) throw new Error(`packaged executable not found under ${distRoot} for ${process.platform}`)
  return executable
}
