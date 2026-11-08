/**
 * Builds the macOS app (.zip with Clip.app) on any OS, without electron-builder
 * (which refuses to package for macOS on Windows).
 *
 * It does what electron-builder does for an unsigned build (`identity: null`):
 * takes the official Electron.app, renames it, puts our app.asar, web build and
 * icon into Resources and rewrites Info.plist. Electron's binaries keep their
 * own (linker) signatures - the bundle has no resource seal to break. Like any
 * unsigned app, macOS asks to confirm it on first launch.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { fileMode, isSymlink, openZip, ZipWriter } from './zip.mjs'

const require = createRequire(import.meta.url)
const fromBuilder = createRequire(require.resolve('app-builder-lib/package.json'))
const asar = fromBuilder('@electron/asar')
const plist = fromBuilder('plist')
const { downloadArtifact } = createRequire(require.resolve('electron/package.json'))('@electron/get')

/** .icns built from PNGs (the PNG-based icon types macOS reads since 10.7). */
async function makeIcns(pngFile) {
  const sharp = (await import('sharp')).default
  const types = [['ic11', 32], ['ic12', 64], ['ic07', 128], ['ic13', 256], ['ic08', 256], ['ic14', 512], ['ic09', 512]]
  const chunks = []
  for (const [type, size] of types) {
    const png = await sharp(pngFile).resize(size, size).png().toBuffer()
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    chunks.push(header, png)
  }
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      yield { path, directory: true }
      yield* walk(path)
    } else yield { path, directory: false }
  }
}

/**
 * @param {object} options
 * @param {string} options.stage folder with main.cjs, preload.cjs, package.json, web/ and build/icon.png
 * @param {string} options.output zip file to write
 * @param {'arm64' | 'x64'} options.arch
 * @param {string} options.electronVersion
 * @param {{ appId: string, productName: string, version: string, category: string, copyright: string }} options.app
 */
export async function buildMacZip({ stage, output, arch, electronVersion, app }) {
  const electronZip = await downloadArtifact({ version: electronVersion, platform: 'darwin', arch, artifactName: 'electron' })

  // app.asar with the desktop shell, like electron-builder's `asar: true`.
  const asarSource = join(stage, '.mac-asar')
  const asarFile = join(stage, '.mac-app.asar')
  rmSync(asarSource, { recursive: true, force: true })
  mkdirSync(asarSource)
  for (const file of ['main.cjs', 'preload.cjs', 'package.json']) copyFileSync(join(stage, file), join(asarSource, file))
  await asar.createPackage(asarSource, asarFile)
  const asarBytes = readFileSync(asarFile)
  const headerHash = createHash('sha256').update(asar.getRawHeader(asarFile).headerString).digest('hex')
  rmSync(asarSource, { recursive: true, force: true })
  rmSync(asarFile, { force: true })

  const source = openZip(electronZip)
  const zip = new ZipWriter(output)
  try {
    const infoEntry = source.entries.find((e) => e.name === 'Electron.app/Contents/Info.plist')
    if (!infoEntry) throw new Error(`${electronZip} has no Electron.app/Contents/Info.plist`)
    const info = plist.parse(readZipText(source, infoEntry))
    Object.assign(info, {
      CFBundleDisplayName: app.productName,
      CFBundleName: app.productName,
      CFBundleExecutable: app.productName,
      CFBundleIdentifier: app.appId,
      CFBundleIconFile: 'icon.icns',
      CFBundleShortVersionString: app.version,
      CFBundleVersion: app.version,
      LSApplicationCategoryType: app.category,
      NSHumanReadableCopyright: app.copyright,
      ElectronAsarIntegrity: { 'Resources/app.asar': { algorithm: 'SHA256', hash: headerHash } },
    })

    const appRoot = `${app.productName}.app/`
    const replaced = new Set(['Contents/Info.plist', 'Contents/Resources/electron.icns', 'Contents/Resources/default_app.asar'])
    for (const entry of source.entries) {
      if (!entry.name.startsWith('Electron.app/')) continue // LICENSE files are added below
      let rest = entry.name.slice('Electron.app/'.length)
      if (replaced.has(rest)) continue
      if (rest === 'Contents/MacOS/Electron') rest = `Contents/MacOS/${app.productName}`
      zip.addRaw({ ...entry, name: appRoot + rest, mode: fileMode(entry) }, source.raw(entry))
    }

    const resources = `${appRoot}Contents/Resources/`
    zip.addFile(`${appRoot}Contents/Info.plist`, Buffer.from(plist.build(info)))
    zip.addFile(`${resources}icon.icns`, await makeIcns(join(stage, 'build/icon.png')))
    zip.addFile(`${resources}app.asar`, asarBytes)
    for (const [name, target] of [['LICENSE', 'LICENSE.electron.txt'], ['LICENSES.chromium.html', 'LICENSES.chromium.html']]) {
      const entry = source.entries.find((e) => e.name === name)
      if (entry) zip.addRaw({ ...entry, name: resources + target, mode: fileMode(entry) }, source.raw(entry))
    }
    zip.addDirectory(`${resources}web/`)
    for (const { path, directory } of walk(join(stage, 'web'))) {
      const name = `${resources}web/${relative(join(stage, 'web'), path).replaceAll('\\', '/')}`
      if (directory) zip.addDirectory(name)
      else zip.addFile(name, readFileSync(path))
    }
    if (!source.entries.some(isSymlink)) throw new Error(`${electronZip} has no symlinks - not an Electron macOS build?`)
  } finally {
    zip.close()
    source.close()
  }
  return output
}

function readZipText(source, entry) {
  const raw = source.raw(entry)
  return (entry.method === 8 ? inflateRawSync(raw) : raw).toString('utf8')
}
