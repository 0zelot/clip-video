/**
 * Packages the desktop app.
 *
 *   node scripts/build-desktop.mjs            → for the current OS
 *   node scripts/build-desktop.mjs --linux    → Linux AppImage
 *   node scripts/build-desktop.mjs --win      → Windows portable .exe
 *   node scripts/build-desktop.mjs --mac      → macOS .zip (Apple Silicon + Intel)
 *   node scripts/build-desktop.mjs --all      → all of the above
 *
 * Every target builds on every OS:
 *  - electron-builder makes the Windows and Linux packages. Its AppImage step
 *    needs `mksquashfs`, which does not exist on Windows - there a built-in
 *    writer stands in for it (scripts/desktop/squashfs.mjs).
 *  - electron-builder packages for macOS only on a Mac, so elsewhere
 *    scripts/desktop/mac.mjs builds the same unsigned .app zip.
 *
 * Run `npm run build` first (or use `npm run build:desktop`): the static web
 * build in `.output/public` is copied into the app as `resources/web`.
 * Results land in `dist-desktop/`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { buildMacZip } from './desktop/mac.mjs'
import { useBuiltInMksquashfs } from './desktop/squashfs.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const builder = require('electron-builder')

if (!existsSync(join(root, '.output/public/index.html'))) {
  console.error('No web build found in .output/public - run "npm run build" first.')
  process.exit(1)
}

const electronVersion = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')).version
const desktopPackage = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8'))
const appVersion = desktopPackage.version
const args = new Set(process.argv.slice(2))
const output = join(root, 'dist-desktop')

const targets = new Map()
const want = (flag) => args.has(flag) || args.has('--all')
const onMac = process.platform === 'darwin'
if (want('--linux')) targets.set(builder.Platform.LINUX, ['AppImage'])
if (want('--win')) targets.set(builder.Platform.WINDOWS, ['portable'])
if (want('--mac') && onMac) targets.set(builder.Platform.MAC, ['zip'])
const macZips = want('--mac') && !onMac ? ['arm64', 'x64'] : []
if (targets.size === 0 && macZips.length === 0) {
  const current = { linux: builder.Platform.LINUX, win32: builder.Platform.WINDOWS, darwin: builder.Platform.MAC }[process.platform]
  targets.set(current, process.platform === 'win32' ? ['portable'] : onMac ? ['zip'] : ['AppImage'])
}
if (process.platform === 'win32' && targets.has(builder.Platform.LINUX)) useBuiltInMksquashfs()

const config = {
  appId: 'app.clip.editor',
  productName: 'Clip',
  copyright: `Copyright © ${new Date().getFullYear()} ${desktopPackage.author.split(' <')[0]}`,
  electronVersion,
  buildVersion: appVersion,
  directories: { app: '.', output, buildResources: 'build' },
  files: ['main.cjs', 'preload.cjs', 'package.json'],
  extraResources: [{ from: 'web', to: 'web' }],
  npmRebuild: false,
  asar: true,
  artifactName: 'Clip-${version}-${os}-${arch}.${ext}',
  linux: { target: 'AppImage', icon: 'build/icon.png', category: 'AudioVideo' },
  win: { target: 'portable', icon: 'build/icon.png', signAndEditExecutable: false },
  portable: { artifactName: 'Clip-${version}-windows-portable.exe' },
  mac: { target: 'zip', icon: 'build/icon.png', category: 'public.app-category.video', identity: null },
  publish: null,
}

// Stage a tiny, dependency-free app folder so the root node_modules (Nuxt,
// build tools, …) never end up inside the package.
const stage = join(output, '.stage')
rmSync(stage, { recursive: true, force: true })
mkdirSync(join(stage, 'build'), { recursive: true })
for (const file of ['main.cjs', 'preload.cjs', 'package.json']) cpSync(join(root, 'desktop', file), join(stage, file))
cpSync(join(root, '.output/public'), join(stage, 'web'), { recursive: true })
cpSync(join(root, 'public/icon-512.png'), join(stage, 'build/icon.png'))

const built = []
try {
  if (targets.size > 0) {
    const result = await builder.build({
      projectDir: stage,
      targets: new Map([...targets].map(([platform, list]) => [platform, builder.createTargets([platform], ...list).get(platform)])),
      config,
    })
    built.push(...result.filter((f) => !f.endsWith('.blockmap')))
  }
  for (const arch of macZips) {
    console.log(`  • building        target=zip (Clip.app) arch=${arch}`)
    built.push(
      await buildMacZip({
        stage,
        arch,
        electronVersion,
        output: join(output, `Clip-${appVersion}-mac-${arch}.zip`),
        app: { appId: config.appId, productName: config.productName, version: appVersion, category: config.mac.category, copyright: config.copyright },
      }),
    )
  }
} finally {
  rmSync(stage, { recursive: true, force: true })
}
console.log('\nBuilt:\n' + built.map((f) => `  ${f}`).join('\n'))
