/**
 * "Smart" editing helpers that run entirely on the device. They work on plain
 * numbers (audio peaks, pixel data) so they are easy to test and identical on
 * every platform.
 */

/** Converts decibels (e.g. -32) to a linear amplitude (0..1). */
export function dbToAmplitude(db) {
  return Math.pow(10, db / 20)
}

/**
 * Finds silent stretches in a peak envelope.
 *
 * @param {ArrayLike<number>} peaks max absolute amplitude per bucket (0..1)
 * @param {number} bucketsPerSecond
 * @param {number} from source time to start looking (s)
 * @param {number} to source time to stop looking (s)
 * @param {{ threshold?: number, minSilence?: number, padding?: number }} [options]
 *   threshold: linear amplitude below which audio counts as silence,
 *   minSilence: shortest pause that is removed (s),
 *   padding: audio kept on both sides of every cut so words are not clipped (s)
 * @returns {[number, number][]} silent ranges in source time, ascending
 */
export function detectSilences(peaks, bucketsPerSecond, from, to, options = {}) {
  const threshold = options.threshold ?? dbToAmplitude(-32)
  const minSilence = options.minSilence ?? 0.45
  const padding = options.padding ?? 0.12
  const first = Math.max(0, Math.floor(from * bucketsPerSecond))
  const last = Math.min(peaks.length, Math.ceil(to * bucketsPerSecond))
  const ranges = []
  let silentStart = -1
  const flush = (endBucket) => {
    if (silentStart < 0) return
    const start = silentStart / bucketsPerSecond
    const end = endBucket / bucketsPerSecond
    // Keep a little sound around the cut - except at the very edges of the clip.
    const a = start <= from + 1e-6 ? from : start + padding
    const b = end >= to - 1e-6 ? to : end - padding
    if (end - start >= minSilence && b - a > 0.05) ranges.push([Math.max(from, a), Math.min(to, b)])
    silentStart = -1
  }
  for (let i = first; i < last; i++) {
    if (peaks[i] < threshold) {
      if (silentStart < 0) silentStart = i
    } else {
      flush(i)
    }
  }
  flush(last)
  return ranges
}

/**
 * Suggests colour corrections from a small sample of RGBA pixels: lifts dark
 * footage, tames overexposure, stretches flat contrast and boosts dull colour.
 *
 * @param {Uint8ClampedArray | number[]} data RGBA bytes
 * @returns {{ brightness: number, contrast: number, saturation: number }}
 */
export function autoEnhanceFromPixels(data) {
  let n = 0
  let sum = 0
  let sumSq = 0
  let satSum = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    sum += lum
    sumSq += lum * lum
    satSum += max === 0 ? 0 : (max - min) / max
    n++
  }
  if (n === 0) return { brightness: 1, contrast: 1, saturation: 1 }
  const mean = sum / n
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean))
  const sat = satSum / n
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const round = (v) => Math.round(v * 100) / 100
  // Move halfway towards the targets - full corrections look artificial.
  const brightness = clamp(1 + (0.48 / Math.max(0.05, mean) - 1) * 0.5, 0.75, 1.45)
  const contrast = clamp(1 + (0.22 / Math.max(0.03, std) - 1) * 0.45, 0.85, 1.4)
  const saturation = clamp(1 + (0.38 / Math.max(0.05, sat) - 1) * 0.4, 0.9, 1.45)
  return { brightness: round(brightness), contrast: round(contrast), saturation: round(saturation) }
}
