/**
 * Time-dependent properties of clips: keyframed transform/opacity and effects
 * that fade in and out (effect ramps). Shared by preview, overlay and export.
 */
import { neutralEffects } from '../model/defaults'

export const KEYFRAME_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity']
const KEY_EPSILON = 1 / 120

const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const smooth = (u) => u * u * (3 - 2 * u)

export function hasKeyframes(item) {
  const kf = item?.keyframes
  if (!kf) return false
  for (const key of KEYFRAME_PROPS) if (kf[key]?.length) return true
  return false
}

/** Interpolated value of one property track (eased between keys). */
export function valueAt(frames, t, fallback) {
  if (!frames || frames.length === 0) return fallback
  if (t <= frames[0].t) return frames[0].v
  const last = frames[frames.length - 1]
  if (t >= last.t) return last.v
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i]
    const b = frames[i + 1]
    if (t >= a.t && t <= b.t) {
      if (a.easing === 'hold') return a.v
      const p = b.t - a.t > 0 ? (t - a.t) / (b.t - a.t) : 1
      const e = a.easing === 'linear' ? p : easeInOut(p)
      return a.v + (b.v - a.v) * e
    }
  }
  return last.v
}

/**
 * The item as it looks at `local` seconds: keyframed transform and opacity
 * resolved. Returns the item itself when nothing is animated.
 */
export function resolveItemAt(item, local) {
  if (!hasKeyframes(item)) return item
  const kf = item.keyframes
  const tr = item.transform
  return {
    ...item,
    transform: {
      ...tr,
      x: valueAt(kf.x, local, tr.x),
      y: valueAt(kf.y, local, tr.y),
      scale: valueAt(kf.scale, local, tr.scale),
      rotation: valueAt(kf.rotation, local, tr.rotation),
    },
    opacity: valueAt(kf.opacity, local, item.opacity),
  }
}

/** Sorted, unique key times of an item. */
export function keyframeTimes(item) {
  const times = []
  for (const key of KEYFRAME_PROPS) {
    for (const k of item.keyframes?.[key] ?? []) if (!times.some((t) => Math.abs(t - k.t) < KEY_EPSILON)) times.push(k.t)
  }
  return times.sort((a, b) => a - b)
}

/**
 * Sets keys at `local` for the given values (mutates a draft item).
 * @param {object} item
 * @param {number} local
 * @param {Partial<Record<'x'|'y'|'scale'|'rotation'|'opacity', number>>} values
 */
export function setKeyframes(item, local, values) {
  const t = Math.max(0, Math.min(item.duration, local))
  item.keyframes = item.keyframes ?? {}
  for (const [key, v] of Object.entries(values)) {
    if (!KEYFRAME_PROPS.includes(key) || typeof v !== 'number' || !Number.isFinite(v)) continue
    const frames = (item.keyframes[key] ?? []).filter((k) => Math.abs(k.t - t) >= KEY_EPSILON)
    frames.push({ t, v })
    frames.sort((a, b) => a.t - b.t)
    item.keyframes[key] = frames
  }
}

/** Removes every key at `local` (mutates a draft item). */
export function removeKeyframesAt(item, local) {
  if (!item.keyframes) return
  for (const key of KEYFRAME_PROPS) {
    const frames = item.keyframes[key]
    if (!frames) continue
    item.keyframes[key] = frames.filter((k) => Math.abs(k.t - local) >= KEY_EPSILON * 2)
    if (item.keyframes[key].length === 0) delete item.keyframes[key]
  }
  if (Object.keys(item.keyframes).length === 0) delete item.keyframes
}

/** Current values of all keyframe properties (static values when not animated). */
export function snapshotValues(item, local) {
  const at = resolveItemAt(item, local)
  return { x: at.transform.x, y: at.transform.y, scale: at.transform.scale, rotation: at.transform.rotation, opacity: at.opacity }
}

/**
 * Effect strength of an effect ramp at `local` (0 = the "from" look, 1 = full).
 * @returns {number}
 */
export function effectsWeight(item, local) {
  const ramp = item.effectsRamp
  if (!ramp) return 1
  let rampIn = Math.max(0, ramp.rampIn ?? 0)
  let rampOut = Math.max(0, ramp.rampOut ?? 0)
  if (rampIn + rampOut > item.duration && rampIn + rampOut > 0) {
    const k = item.duration / (rampIn + rampOut)
    rampIn *= k
    rampOut *= k
  }
  let w = 1
  if (rampIn > 0 && local < rampIn) w = Math.min(w, smooth(Math.max(0, local / rampIn)))
  if (rampOut > 0 && local > item.duration - rampOut) w = Math.min(w, smooth(Math.max(0, (item.duration - local) / rampOut)))
  return w
}

/** Effect parameters at `local`, blending from `effectsRamp.from` to `effects`. */
export function effectsAt(item, local) {
  const target = item.effects
  if (!item.effectsRamp || !target) return target
  const w = effectsWeight(item, local)
  if (w >= 1) return target
  const from = { ...neutralEffects(), ...(item.effectsRamp.from ?? {}) }
  const out = {}
  for (const key of Object.keys({ ...from, ...target })) {
    const a = from[key] ?? 0
    const b = target[key] ?? a
    out[key] = a + (b - a) * w
  }
  return out
}
