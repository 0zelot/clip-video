import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'

/**
 * @typedef {import('../../core/model/types').AssetKind | 'subtitle' | 'text' | 'unsupported'} ImportCategory
 */

/** @type {Record<string, ImportCategory>} */
const EXTENSIONS = {
  mp4: 'video', m4v: 'video', webm: 'video', mov: 'video', mkv: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', flac: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', avif: 'image', bmp: 'image',
  srt: 'subtitle', vtt: 'subtitle',
  txt: 'text',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
}

export function extensionOf(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * @param {File} file
 * @returns {ImportCategory}
 */
export function classifyFile(file) {
  const byExt = EXTENSIONS[extensionOf(file.name)]
  if (byExt) return byExt
  const type = file.type
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('image/')) return 'image'
  if (type === 'application/x-subrip') return 'subtitle'
  if (type === 'text/plain') return 'text'
  if (type.startsWith('font/') || type === 'application/font-sfnt') return 'font'
  return 'unsupported'
}

/**
 * @typedef {object} ProbeResult
 * @property {import('../../core/model/types').AssetKind} kind
 * @property {number} [duration]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [fps]
 * @property {boolean} [hasAudio]
 * @property {boolean} [hasVideo]
 * @property {string[]} warnings non-fatal problems (e.g. codec not decodable here)
 */

/** @returns {Promise<ProbeResult>} */
async function probeWithMediabunny(file, kind) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) })
  try {
    const warnings = []
    const videoTrack = await input.getPrimaryVideoTrack()
    const audioTrack = await input.getPrimaryAudioTrack()
    if (!videoTrack && !audioTrack) throw new Error('No audio or video track found')

    const isVideo = kind === 'video' && !!videoTrack
    const result = {
      kind: isVideo ? 'video' : 'audio',
      duration: await input.computeDuration(),
      hasAudio: !!audioTrack,
      hasVideo: !!videoTrack,
      warnings,
    }
    if (isVideo) {
      result.width = videoTrack.displayWidth
      result.height = videoTrack.displayHeight
      try {
        const stats = await videoTrack.computePacketStats(60)
        if (stats.averagePacketRate > 0) result.fps = Math.round(stats.averagePacketRate * 100) / 100
      } catch {
        // fps is informative only
      }
      if (!(await videoTrack.canDecode())) {
        warnings.push(`Video codec "${videoTrack.codec ?? 'unknown'}" cannot be decoded by this browser - preview and export may fail.`)
      }
    }
    if (audioTrack && !(await audioTrack.canDecode())) {
      warnings.push(`Audio codec "${audioTrack.codec ?? 'unknown'}" cannot be decoded by this browser - the file will be silent.`)
      result.hasAudio = false
    }
    return result
  } finally {
    input.dispose()
  }
}

/** @returns {Promise<ProbeResult>} */
function probeWithElement(file, kind) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(kind)
    el.preload = 'metadata'
    const cleanup = () => {
      el.removeAttribute('src')
      el.load()
      URL.revokeObjectURL(url)
    }
    el.onloadedmetadata = () => {
      const result = {
        kind: kind === 'video' && el.videoWidth > 0 ? 'video' : 'audio',
        duration: Number.isFinite(el.duration) ? el.duration : undefined,
        width: el.videoWidth || undefined,
        height: el.videoHeight || undefined,
        hasAudio: true,
        hasVideo: kind === 'video' && el.videoWidth > 0,
        warnings: ['File metadata was read by the media element - export of this file may not be supported.'],
      }
      cleanup()
      resolve(result)
    }
    el.onerror = () => {
      cleanup()
      reject(new Error('This file format is not supported by the browser.'))
    }
    el.src = url
  })
}

/** @returns {Promise<ProbeResult>} */
async function probeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      const result = { kind: 'image', width: bitmap.width, height: bitmap.height, warnings: [] }
      bitmap.close()
      return result
    } catch {
      // fall through to <img>, which supports more formats on some platforms
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ kind: 'image', width: img.naturalWidth, height: img.naturalHeight, warnings: [] })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('This image format is not supported.'))
    }
    img.src = url
  })
}

/**
 * @param {File} file
 * @param {import('../../core/model/types').AssetKind} kind
 * @returns {Promise<ProbeResult>}
 */
export async function probeFile(file, kind) {
  if (kind === 'image') return probeImage(file)
  try {
    return await probeWithMediabunny(file, kind)
  } catch (error) {
    // Some containers are not supported by the demuxer but still play in <video>.
    try {
      return await probeWithElement(file, kind)
    } catch {
      throw error instanceof Error ? error : new Error(String(error))
    }
  }
}
