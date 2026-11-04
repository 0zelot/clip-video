/**
 * Packages the desktop app with electron-builder.
 *
 *   node scripts/build-desktop.mjs            → for the current OS
 *   node scripts/build-desktop.mjs --linux    → Linux AppImage
 *   node scripts/build-desktop.mjs --win      → Windows portable .exe
 *   node scripts/build-desktop.mjs --mac      → macOS .zip (build on a Mac)
 *   node scripts/build-desktop.mjs --all      → Linux + Windows
 *
 * Run `npm run build` first (or use `npm run build:desktop`): the static web
 * build in `.output/public` is copied into the app as `resources/web`.
 * Results land in `dist-desktop/`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const builder = require('electron-builder')

if (!existsSync(join(root, '.output/public/index.html'))) {
  console.error('No web build found in .output/public - run "npm run build" first.')
  process.exit(1)
}

const electronVersion = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')).version
const appVersion = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8')).version
const args = new Set(process.argv.slice(2))

const targets = new Map()
const want = (flag) => args.has(flag) || args.has('--all')
if (want('--linux')) targets.set(builder.Platform.LINUX, ['AppImage'])
if (want('--win')) targets.set(builder.Platform.WINDOWS, ['portable'])
if (args.has('--mac')) targets.set(builder.Platform.MAC, ['zip'])
if (targets.size === 0) {
  const current = { linux: builder.Platform.LINUX, win32: builder.Platform.WINDOWS, darwin: builder.Platform.MAC }[process.platform]
  targets.set(current, process.platform === 'win32' ? ['portable'] : process.platform === 'darwin' ? ['zip'] : ['AppImage'])
}

// Stage a tiny, dependency-free app folder so the root node_modules (Nuxt,
// build tools, …) never end up inside the package.
const stage = join(root, 'dist-desktop', '.stage')
rmSync(stage, { recursive: true, force: true })
mkdirSync(join(stage, 'build'), { recursive: true })
for (const file of ['main.cjs', 'preload.cjs', 'package.json']) cpSync(join(root, 'desktop', file), join(stage, file))
cpSync(join(root, '.output/public'), join(stage, 'web'), { recursive: true })
cpSync(join(root, 'public/icon-512.png'), join(stage, 'build/icon.png'))

const result = await builder.build({
  projectDir: stage,
  targets: new Map([...targets].map(([platform, list]) => [platform, builder.createTargets([platform], ...list).get(platform)])),
  config: {
    appId: 'app.clip.editor',
    productName: 'Clip',
    electronVersion,
    buildVersion: appVersion,
    directories: { app: '.', output: join(root, 'dist-desktop'), buildResources: 'build' },
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
  },
})
rmSync(stage, { recursive: true, force: true })
console.log('\nBuilt:\n' + result.filter((f) => !f.endsWith('.blockmap')).map((f) => `  ${f}`).join('\n'))
