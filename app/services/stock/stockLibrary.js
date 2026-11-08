/**
 * Free stock videos from public sources.
 *
 * Every category is fetched on its own, every source inside a category too: a
 * source that is down, slow or offline contributes nothing and the rest of the
 * library still shows. The last good catalogue is kept in localStorage, so the
 * library opens instantly and survives a source being unavailable for a while.
 *
 * Sources (no account or API key needed, both allow use from the browser):
 * - Wikimedia Commons - freely licensed (CC BY, CC BY-SA, CC0, public domain).
 *   CC BY / BY-SA clips must credit the author when the video is published.
 * - NASA Image and Video Library - public domain, credit "NASA".
 */

const CACHE_KEY = 'clip:stock-catalog:v1'
/** Refresh the catalogue in the background when it is older than this. */
export const CATALOG_MAX_AGE_MS = 12 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 15000
const MIN_DURATION = 3
const MAX_DURATION = 300
const PER_SOURCE = 40
const PER_CATEGORY = 30
/** Downloaded resolution: sharp enough for Shorts, small enough for phones. */
const MAX_DOWNLOAD_HEIGHT = 720

/** @typedef {{ provider: 'commons' | 'nasa', search: string, filter?: RegExp }} StockSource */
/** @typedef {{ id: string, label: string, sources: StockSource[] }} StockCategory */

/** @type {StockCategory[]} */
export const STOCK_CATEGORIES = [
  {
    id: 'minecraft',
    label: 'Minecraft',
    sources: [
      // Gameplay first; the category adds trailers and promos after it.
      { provider: 'commons', search: 'minecraft gameplay filetype:video' },
      { provider: 'commons', search: 'incategory:Videos_of_Minecraft filetype:video' },
    ],
  },
  { id: 'nature', label: 'Nature', sources: [{ provider: 'commons', search: 'incategory:Videos_of_nature|Videos_of_forests|Videos_of_waterfalls|Videos_of_rivers filetype:video' }] },
  { id: 'landscapes', label: 'Landscapes', sources: [{ provider: 'commons', search: 'incategory:Videos_of_mountains|Aerial_videos|Drone_videos|Videos_of_lakes|Videos_of_sunsets|Videos_of_sunrises filetype:video' }] },
  { id: 'sea', label: 'Sea & beach', sources: [{ provider: 'commons', search: 'incategory:Videos_of_oceans|Videos_of_beaches filetype:video' }] },
  { id: 'sky', label: 'Sky & weather', sources: [{ provider: 'commons', search: 'incategory:Videos_of_clouds|Videos_of_rain|Videos_of_snow|Videos_of_lightning|Time-lapse_videos filetype:video' }] },
  { id: 'animals', label: 'Animals', sources: [{ provider: 'commons', search: 'incategory:Videos_of_cats|Videos_of_dogs|Videos_of_horses|Videos_of_fish filetype:video' }] },
  { id: 'city', label: 'City & trains', sources: [{ provider: 'commons', search: 'incategory:Videos_of_cities|Videos_of_trains filetype:video' }] },
  { id: 'fire', label: 'Fire & fireworks', sources: [{ provider: 'commons', search: 'incategory:Videos_of_fire|Videos_of_fireworks filetype:video' }] },
  {
    id: 'space',
    label: 'Earth from space',
    sources: [{ provider: 'nasa', search: 'earth views', filter: /earth views|views from|from the (iss|international space station)|from orbit/i }],
  },
]

/**
 * @typedef {object} StockClip
 * @property {string} id provider-prefixed, stable
 * @property {'commons' | 'nasa'} provider
 * @property {string} title
 * @property {string} thumb image URL
 * @property {string} [previewUrl] small video for a quick look
 * @property {string} [downloadUrl] file to import (NASA: resolved on demand)
 * @property {string} [collectionUrl] NASA: list of the clip's files
 * @property {number | null} duration seconds
 * @property {number} [height]
 * @property {string} author
 * @property {string} license e.g. "CC BY 4.0"
 * @property {string} [licenseUrl]
 * @property {string} pageUrl where the clip and its licence are described
 */

// ----- providers ---------------------------------------------------------------

function timeoutSignal(signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal && AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout
}

async function getJson(url, signal) {
  const res = await fetch(url, { signal: timeoutSignal(signal), credentials: 'omit' })
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
  return res.json()
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
/** Commons metadata is HTML - keep just the text. */
export function plainText(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim()
}

/** "File:Minecraft_Beta_Gameplay.webm" -> "Minecraft Beta Gameplay" */
export function titleFromFileName(name) {
  return String(name)
    .replace(/^File:/i, '')
    .replace(/\.(webm|ogv|ogg|mp4|mov|mpg|mpeg|avi)$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Turns one Commons API page into a clip, or null when it is unusable (too
 * short/long, or without a WebM rendition the browser can decode).
 * @returns {StockClip | null}
 */
export function parseCommonsPage(page) {
  const info = page?.videoinfo?.[0]
  if (!info || !String(info.mime ?? '').startsWith('video/')) return null
  const duration = Number(info.duration)
  if (!(duration >= MIN_DURATION && duration <= MAX_DURATION)) return null
  const webm = (info.derivatives ?? [])
    .filter((d) => /^video\/webm/.test(d.type ?? '') && Number(d.height) > 0 && d.src)
    .sort((a, b) => a.height - b.height)
  const download = webm.filter((d) => d.height <= MAX_DOWNLOAD_HEIGHT).at(-1)
  if (!download) return null
  const meta = info.extmetadata ?? {}
  return {
    id: `commons:${page.pageid}`,
    provider: 'commons',
    title: titleFromFileName(page.title),
    thumb: info.thumburl ?? '',
    previewUrl: webm[0].src,
    downloadUrl: download.src,
    duration,
    height: Number(download.height),
    author: plainText(meta.Artist?.value) || 'Unknown author',
    license: plainText(meta.LicenseShortName?.value) || 'Free licence',
    licenseUrl: meta.LicenseUrl?.value,
    pageUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
  }
}

/** @param {StockSource} source @returns {Promise<StockClip[]>} */
async function fromCommons(source, signal) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(PER_SOURCE),
    gsrsearch: source.search,
    prop: 'videoinfo',
    viprop: 'url|size|mime|extmetadata|derivatives',
    viurlwidth: '320',
    viextmetadatafilter: 'LicenseShortName|Artist|LicenseUrl',
  })
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`, signal)
  const pages = [...(data?.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  return pages.map(parseCommonsPage).filter(Boolean)
}

const https = (url) => String(url ?? '').replace(/^http:\/\//, 'https://')

/** @param {StockSource} source @returns {Promise<StockClip[]>} */
async function fromNasa(source, signal) {
  const params = new URLSearchParams({ q: source.search, media_type: 'video', page_size: String(PER_SOURCE) })
  const data = await getJson(`https://images-api.nasa.gov/search?${params}`, signal)
  return (data?.collection?.items ?? [])
    .map((item) => {
      const meta = item.data?.[0]
      if (!meta?.nasa_id || !item.href) return null
      if (source.filter && !source.filter.test(meta.title ?? '')) return null
      return {
        id: `nasa:${meta.nasa_id}`,
        provider: 'nasa',
        title: String(meta.title ?? meta.nasa_id).trim(),
        thumb: https(item.links?.find((l) => l.render === 'image' || /\.jpe?g$/i.test(l.href ?? ''))?.href),
        collectionUrl: https(item.href),
        duration: null,
        author: 'NASA',
        license: 'Public domain',
        licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
        pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(meta.nasa_id)}`,
      }
    })
    .filter((clip) => clip && clip.thumb)
}

const PROVIDERS = { commons: fromCommons, nasa: fromNasa }

/**
 * Loads one category from all of its sources. Fails only when every source failed.
 * @param {StockCategory} category
 * @returns {Promise<StockClip[]>}
 */
export async function fetchCategory(category, signal) {
  const results = await Promise.allSettled(category.sources.map((s) => PROVIDERS[s.provider](s, signal)))
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason
  const seen = new Set()
  const clips = []
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const clip of r.value) {
      if (seen.has(clip.id)) continue
      seen.add(clip.id)
      clips.push(clip)
    }
  }
  return clips.slice(0, PER_CATEGORY)
}

// ----- cache -------------------------------------------------------------------

/** @returns {Record<string, { clips: StockClip[], fetchedAt: number }>} */
export function readCatalogCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export function writeCatalogCache(catalog) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(catalog))
  } catch {
    // storage full or blocked - the library just reloads next time
  }
}

// ----- download ----------------------------------------------------------------

/** NASA lists a clip's renditions in a collection file - pick a mid-size MP4. */
async function resolveNasaDownload(clip, signal) {
  const files = (await getJson(clip.collectionUrl, signal)).map(https)
  for (const suffix of ['~medium.mp4', '~small.mp4', '~mobile.mp4', '~orig.mp4']) {
    const hit = files.find((f) => f.endsWith(suffix))
    if (hit) return hit
  }
  const any = files.find((f) => /\.mp4$/i.test(f))
  if (!any) throw new Error('NASA has no MP4 file for this clip')
  return any
}

function fileNameFor(clip, url) {
  const ext = /\.mp4($|\?)/i.test(url) ? 'mp4' : 'webm'
  const base = clip.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Stock clip'
  return `${base}.${ext}`
}

/**
 * Downloads a clip as a File ready for the media library.
 * @param {StockClip} clip
 * @param {{ signal?: AbortSignal, onProgress?: (ratio: number) => void }} [options]
 */
export async function downloadClip(clip, options = {}) {
  const url = clip.downloadUrl ?? (await resolveNasaDownload(clip, options.signal))
  const res = await fetch(url, { signal: options.signal, credentials: 'omit' })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    if (total) options.onProgress?.(Math.min(1, loaded / total))
  }
  const name = fileNameFor(clip, url)
  const type = name.endsWith('.mp4') ? 'video/mp4' : 'video/webm'
  return new File(chunks, name, { type, lastModified: Date.now() })
}

/** Credit info stored on the imported asset. */
export function creditFor(clip) {
  return { title: clip.title, author: clip.author, license: clip.license, licenseUrl: clip.licenseUrl, source: clip.provider, url: clip.pageUrl }
}

/** One line per credited asset, ready to paste into a video description. */
export function creditsText(assets) {
  return assets
    .filter((a) => a.credit)
    .map((a) => `"${a.credit.title}" - ${a.credit.author}, ${a.credit.license}${a.credit.url ? ` (${a.credit.url})` : ''}`)
    .join('\n')
}
