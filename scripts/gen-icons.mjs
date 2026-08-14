/**
 * Render build/icon.svg and build/tray.svg into the PNGs electron-builder and
 * the Tray consume: build/icon.png (1024, auto-converted to icns/ico by
 * electron-builder) and the macOS menu-bar template images. Run on demand;
 * the generated PNGs are committed so CI never needs sharp here.
 * @module scripts/gen-icons
 */
import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'

await mkdir('build', { recursive: true })

const icon = await readFile('build/icon.svg')
await sharp(icon, { density: 300 }).resize(1024, 1024).png().toFile('build/icon.png')

const tray = await readFile('build/tray.svg')
await sharp(tray, { density: 300 }).resize(16, 16).png().toFile('build/trayTemplate.png')
await sharp(tray, { density: 300 }).resize(32, 32).png().toFile('build/trayTemplate@2x.png')

console.log('gen-icons: rendered build/icon.png, trayTemplate.png, trayTemplate@2x.png')
