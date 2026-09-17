export const EPSILON = 1e-6

/**
 * Maps a timeline time to a time in the item's source media.
 *
 * All time remapping goes through this function so that speed ramps and
 * reverse playback can be implemented in one place.
 *
 * @param {import('./model/types').TimedItem} item
 * @param {number} timelineTime
 * @param {number} [assetDuration] needed for looping audio
 * @returns {number}
 */
export function sourceTimeAt(item, timelineTime, assetDuration) {
  const local = Math.min(Math.max(timelineTime - item.start, 0), item.duration)
  const consumed = local * item.speed
  if (item.reversed) {
    return item.sourceIn + item.duration * item.speed - consumed
  }
  let t = item.sourceIn + consumed
  if (item.type === 'audio' && item.loop && assetDuration && assetDuration > 0) {
    t = t % assetDuration
  }
  return t
}

/**
 * End of the used source range.
 * @param {import('./model/types').TimedItem} item
 */
export function sourceOut(item) {
  return item.sourceIn + item.duration * item.speed
}

/** @param {{ start: number, duration: number }} item */
export function itemEnd(item) {
  return item.start + item.duration
}

/**
 * @param {{ start: number, duration: number }} item
 * @param {number} t
 */
export function isActiveAt(item, t) {
  return t >= item.start - EPSILON && t < item.start + item.duration - EPSILON
}

/**
 * The longest timeline duration an item may have given its source media.
 * @param {import('./model/types').Item} item
 * @param {import('./model/types').MediaAsset | undefined} asset
 */
export function maxDurationFor(item, asset) {
  if (item.type === 'image') return Number.POSITIVE_INFINITY
  if (item.type === 'audio' && item.loop) return Number.POSITIVE_INFINITY
  const srcDuration = asset?.duration
  if (!srcDuration) return Number.POSITIVE_INFINITY
  return Math.max(0, (srcDuration - item.sourceIn) / item.speed)
}

/** Snap a time to the nearest frame boundary. */
export function snapToFrame(t, fps) {
  return Math.round(t * fps) / fps
}

export function frameDuration(fps) {
  return 1 / fps
}

/** `mm:ss.ff` (frames) or `h:mm:ss.ff` for long projects. */
export function formatTimecode(seconds, fps) {
  const s = Math.max(0, seconds)
  const totalFrames = Math.round(s * fps)
  const frames = totalFrames % fps
  const totalSeconds = Math.floor(totalFrames / fps)
  const secs = totalSeconds % 60
  const mins = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (n, l = 2) => String(n).padStart(l, '0')
  const base = `${pad(mins)}:${pad(secs)}.${pad(frames)}`
  return hours > 0 ? `${hours}:${base}` : base
}

/** Short human readable duration: `12.4s`, `1:05`. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '∞'
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Parses `ss`, `ss.ms`, `mm:ss(.ms)`, `hh:mm:ss(.ms)`.
 * @returns {number | null} null on invalid input
 */
export function parseTime(input) {
  const trimmed = input.trim().replace(',', '.')
  if (!trimmed) return null
  const parts = trimmed.split(':')
  if (parts.length > 3) return null
  let total = 0
  for (const part of parts) {
    if (!/^\d*\.?\d*$/.test(part) || part === '' || part === '.') return null
    total = total * 60 + Number(part)
  }
  return Number.isFinite(total) ? total : null
}
