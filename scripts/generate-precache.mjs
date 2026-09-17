/**
 * Builds the service-worker precache list from the generated static output, so
 * every route, chunk and worker is available offline after the first load.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, posix, relative, sep } from 'node:path'

const OUT_DIR = new URL('../.output/public', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const SKIP = new Set(['sw.js', 'precache-manifest.json'])

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else files.push(full)
  }
  return files
}

const files = await walk(OUT_DIR)
const hash = createHash('sha1')
const list = []

for (const file of files.sort()) {
  const rel = relative(OUT_DIR, file).split(sep).join(posix.sep)
  if (SKIP.has(rel)) continue
  const info = await stat(file)
  hash.update(`${rel}:${info.size}`)
  list.push(`/${rel}`)
}

const manifest = { buildId: hash.digest('hex').slice(0, 12), generatedAt: new Date().toISOString(), files: list }
await writeFile(join(OUT_DIR, 'precache-manifest.json'), JSON.stringify(manifest))
console.log(`[clip] precache manifest: ${list.length} files, build ${manifest.buildId}`)

// Sanity check: the app shell must be present.
const shell = await readFile(join(OUT_DIR, 'index.html'), 'utf8').catch(() => null)
if (!shell) console.warn('[clip] warning: index.html was not found in the build output')
