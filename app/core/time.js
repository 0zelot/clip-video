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
  const consumed = consumedAt(item, local)
  if (item.reversed) {
    return item.sourceIn + sourceRange(item) - consumed
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
  return item.sourceIn + sourceRange(item)
}

// ---------------------------------------------------------------------------
// Smooth speed ramps
//
// A clip may ease from `speedRamp.from` to its main `speed` over `rampIn`
// seconds (timeline time) and back over `rampOut` seconds. The easing is a
// smoothstep, whose integral has a closed form, so source positions are exact.
// ---------------------------------------------------------------------------

const smooth = (u) => u * u * (3 - 2 * u)
/** ∫₀ˣ smoothstep(u) du */
const smoothIntegral = (x) => x * x * x - (x * x * x * x) / 2

/** Ramp lengths actually used (they never exceed the clip). */
export function rampLengths(item) {
  const ramp = item.speedRamp
  if (!ramp) return { rampIn: 0, rampOut: 0 }
  let rampIn = Math.max(0, ramp.rampIn ?? 0)
  let rampOut = Math.max(0, ramp.rampOut ?? 0)
  const total = rampIn + rampOut
  if (total > item.duration && total > 0) {
    const k = item.duration / total
    rampIn *= k
    rampOut *= k
  }
  return { rampIn, rampOut }
}

/** Playback speed at an item-local time. */
export function speedAt(item, local) {
  const ramp = item.speedRamp
  if (!ramp) return item.speed
  const { rampIn, rampOut } = rampLengths(item)
  const from = ramp.from ?? 1
  if (rampIn > 0 && local < rampIn) return from + (item.speed - from) * smooth(Math.max(0, local / rampIn))
  const outStart = item.duration - rampOut
  if (rampOut > 0 && local > outStart) return item.speed + (from - item.speed) * smooth(Math.min(1, (local - outStart) / rampOut))
  return item.speed
}

/** Source seconds consumed after `local` seconds of the clip. */
export function consumedAt(item, local) {
  const ramp = item.speedRamp
  if (!ramp) return local * item.speed
  const { rampIn, rampOut } = rampLengths(item)
  const from = ramp.from ?? 1
  const s = item.speed
  const t = Math.min(Math.max(local, 0), item.duration)
  const inPart = (x) => (rampIn > 0 ? from * x + (s - from) * rampIn * smoothIntegral(x / rampIn) : 0)
  if (t <= rampIn) return inPart(t)
  const atHold = inPart(rampIn)
  const outStart = item.duration - rampOut
  if (t <= outStart || rampOut <= 0) return atHold + s * (t - rampIn)
  const v = (t - outStart) / rampOut
  return atHold + s * (outStart - rampIn) + s * (t - outStart) + (from - s) * rampOut * smoothIntegral(v)
}

/** Length of the used source media. */
export function sourceRange(item) {
  return item.speedRamp ? consumedAt(item, item.duration) : item.duration * item.speed
}

/** Average speed of the clip (equals `speed` without a ramp). */
export function effectiveSpeed(item) {
  return item.speedRamp && item.duration > 0 ? sourceRange(item) / item.duration : item.speed
}

/**
 * Timeline duration needed to play `range` source seconds at `speed` with
 * ramps from/to `from`. Ramps are shortened when the clip is too short.
 * @returns {{ duration: number, rampIn: number, rampOut: number }}
 */
export function durationForRamp(range, speed, from, rampIn, rampOut) {
  let rIn = Math.max(0, rampIn)
  let rOut = Math.max(0, rampOut)
  const avg = (from + speed) / 2
  let rampConsumed = (rIn + rOut) * avg
  if (rampConsumed > range && rampConsumed > 0) {
    const k = range / rampConsumed
    rIn *= k
    rOut *= k
    rampConsumed = range
  }
  const hold = Math.max(0, (range - rampConsumed) / speed)
  return { duration: rIn + hold + rOut, rampIn: rIn, rampOut: rOut }
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
  return Math.max(0, (srcDuration - item.sourceIn) / effectiveSpeed(item))
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

/**
 * Speed needed to play `sourceRange` seconds of media in `targetDuration`
 * seconds of timeline (e.g. 10 s of footage in 8.6 s → 1.1628×).
 * @returns {number | null} null for invalid input
 */
export function speedForDuration(sourceRange, targetDuration) {
  if (!(sourceRange > 0) || !(targetDuration > 0) || !Number.isFinite(targetDuration)) return null
  return sourceRange / targetDuration
}
