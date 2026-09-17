/**
 * Saving and sharing exported files.
 *
 * - Web: regular download through an object URL, Web Share API when available.
 * - Android (Capacitor): the file is written to app storage in chunks (the
 *   Filesystem plugin bridge only accepts base64 strings, so we never build one
 *   giant string) and shared via the system share sheet.
 */
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isNativeApp } from './platform'

// Multiple of 3 so every chunk encodes to standalone base64 without padding.
const CHUNK_SIZE = 3 * 1024 * 1024

function bytesToBase64(bytes) {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

async function writeNativeFile(blob, path, directory, onProgress) {
  for (let offset = 0; offset < blob.size || offset === 0; offset += CHUNK_SIZE) {
    const chunk = new Uint8Array(await blob.slice(offset, offset + CHUNK_SIZE).arrayBuffer())
    const data = bytesToBase64(chunk)
    if (offset === 0) await Filesystem.writeFile({ path, data, directory, recursive: true })
    else await Filesystem.appendFile({ path, data, directory })
    onProgress?.(Math.min(1, (offset + chunk.length) / Math.max(1, blob.size)))
    if (blob.size === 0) break
  }
  const { uri } = await Filesystem.getUri({ path, directory })
  return uri
}

export function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'clip'
}

/**
 * Saves the file to the device: download on the web, Documents/Clip on Android.
 * @returns {Promise<{ location: string }>}
 */
export async function saveFile(blob, fileName, onProgress) {
  const name = sanitizeFileName(fileName)
  if (isNativeApp()) {
    try {
      const status = await Filesystem.checkPermissions()
      if (status.publicStorage !== 'granted') await Filesystem.requestPermissions()
    } catch {
      // Android 11+ does not need the legacy permission for app-created files.
    }
    await writeNativeFile(blob, `Clip/${name}`, Directory.Documents, onProgress)
    return { location: `Documents/Clip/${name}` }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return { location: 'Downloads' }
}

export function canShareFiles() {
  if (isNativeApp()) return true
  try {
    const probe = new File([new Uint8Array(1)], 'probe.mp4', { type: 'video/mp4' })
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/** Opens the system share sheet with the file. */
export async function shareFile(blob, fileName, onProgress) {
  const name = sanitizeFileName(fileName)
  if (isNativeApp()) {
    const uri = await writeNativeFile(blob, `exports/${name}`, Directory.Cache, onProgress)
    await Share.share({ title: name, files: [uri], dialogTitle: 'Share video' })
    return
  }
  const file = new File([blob], name, { type: blob.type })
  await navigator.share({ files: [file], title: name })
}
