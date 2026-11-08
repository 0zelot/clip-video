/**
 * Timeline item operations.
 *
 * Every function mutates a *draft* project (Immer) and never touches UI state.
 * They keep the track invariants intact: items are sorted by start and never
 * overlap on the same track.
 */
import { MIN_ITEM_DURATION, createId, createItemFromAsset, createTrack } from '../model/defaults'
import { findTrack, locateItem, trackEnd } from '../model/queries'
import { isTimedItem, trackAccepts } from '../model/types'
import { EPSILON, consumedAt, durationForRamp, effectiveSpeed, itemEnd, sourceRange } from '../time'

/** @param {import('../model/types').Track} track */
export function sortTrack(track) {
  track.items.sort((a, b) => a.start - b.start)
}

/**
 * Finds the start position closest to `desired` where an item of `duration`
 * fits on `track` without overlapping other items.
 *
 * @param {import('../model/types').Track} track
 * @param {number} duration
 * @param {number} desired
 * @param {Iterable<string>} [exclude]
 * @returns {number} NaN when the item cannot fit anywhere
 */
export function findFreeStart(track, duration, desired, exclude = []) {
  const excluded = new Set(exclude)
  const items = track.items.filter((i) => !excluded.has(i.id))
  const target = Math.max(0, desired)
  let best = Number.NaN
  let bestDistance = Number.POSITIVE_INFINITY
  let gapStart = 0
  const consider = (from, to) => {
    if (to - from + EPSILON < duration) return
    const candidate = Math.min(Math.max(target, from), to - duration)
    const distance = Math.abs(candidate - target)
    if (distance < bestDistance) {
      bestDistance = distance
      best = Math.max(from, candidate)
    }
  }
  for (const item of items) {
    consider(gapStart, item.start)
    gapStart = Math.max(gapStart, itemEnd(item))
  }
  consider(gapStart, Number.POSITIVE_INFINITY)
  return best
}

export function isRangeFree(track, start, duration, exclude = []) {
  const excluded = new Set(exclude)
  const end = start + duration
  return track.items.every((i) => excluded.has(i.id) || itemEnd(i) <= start + EPSILON || i.start >= end - EPSILON)
}

function nextTrackName(project, kind) {
  const base = kind === 'visual' ? 'Video' : 'Audio'
  let n = project.tracks.filter((t) => t.kind === kind).length + 1
  while (project.tracks.some((t) => t.name === `${base} ${n}`)) n++
  return `${base} ${n}`
}

/**
 * Adds a new track. Visual tracks are inserted above existing visual tracks,
 * audio tracks at the bottom.
 *
 * @param {import('../model/types').Project} project
 * @param {import('../model/types').TrackKind} kind
 * @param {number} [index]
 * @returns {import('../model/types').Track}
 */
export function addTrack(project, kind, index) {
  const track = createTrack(kind, nextTrackName(project, kind))
  if (index !== undefined) {
    project.tracks.splice(Math.max(0, Math.min(index, project.tracks.length)), 0, track)
  } else if (kind === 'visual') {
    const firstVisual = project.tracks.findIndex((t) => t.kind === 'visual')
    project.tracks.splice(firstVisual === -1 ? 0 : firstVisual, 0, track)
  } else {
    project.tracks.push(track)
  }
  return findTrack(project, track.id)
}

/**
 * @param {import('../model/types').Project} project
 * @param {string} trackId
 * @param {import('../model/types').Item} item
 * @param {{ exact?: boolean }} [options]
 * @returns {import('../model/types').Item | null}
 */
export function insertItem(project, trackId, item, options = {}) {
  const track = findTrack(project, trackId)
  if (!track || !trackAccepts(track, item)) return null
  if (options.exact) {
    if (!isRangeFree(track, item.start, item.duration)) return null
  } else {
    item.start = findFreeStart(track, item.duration, item.start)
  }
  track.items.push(item)
  sortTrack(track)
  return item
}

/** Returns the main (bottom-most) visual track or the first audio track. */
function primaryTrack(project, kind) {
  const tracks = project.tracks.filter((t) => t.kind === kind && !t.locked)
  return kind === 'visual' ? tracks[tracks.length - 1] : tracks[0]
}

/**
 * Placement hint for `addAssetToTimeline`.
 * @typedef {object} PlacementHint
 * @property {string} [trackId] explicit target (drop position)
 * @property {number} [time]
 * @property {number} [playhead] playhead position used for automatic placement
 */

/**
 * Adds a media asset to the timeline using CapCut-like placement rules:
 * - explicit drop target: nearest free slot on that track,
 * - otherwise: appended to the primary track when the playhead is at its end
 *   (building a sequence), inserted at the playhead when there is room, or put
 *   on a new track above when the playhead position is occupied.
 *
 * @param {import('../model/types').Project} project
 * @param {import('../model/types').MediaAsset} asset
 * @param {PlacementHint} [hint]
 * @returns {import('../model/types').Item | null}
 */
export function addAssetToTimeline(project, asset, hint = {}) {
  if (asset.kind === 'font') return null
  const kind = asset.kind === 'audio' ? 'audio' : 'visual'
  const item = createItemFromAsset(asset, 0)

  if (hint.trackId) {
    const track = findTrack(project, hint.trackId)
    if (track && !track.locked && trackAccepts(track, item)) {
      item.start = hint.time ?? 0
      return insertItem(project, track.id, item)
    }
  }

  const playhead = Math.max(0, hint.playhead ?? 0)
  let track = primaryTrack(project, kind) ?? addTrack(project, kind)
  const end = trackEnd(track)
  if (track.items.length === 0 || playhead >= end - EPSILON) {
    item.start = track.items.length === 0 ? playhead : end
    return insertItem(project, track.id, item)
  }
  if (isRangeFree(track, playhead, item.duration)) {
    item.start = playhead
    return insertItem(project, track.id, item, { exact: true })
  }
  // Look for another unlocked track of the same kind with room at the playhead.
  const candidates = project.tracks.filter((t) => t.kind === kind && !t.locked && t.id !== track.id)
  const free = candidates.find((t) => isRangeFree(t, playhead, item.duration))
  track = free ?? addTrack(project, kind)
  item.start = playhead
  return insertItem(project, track.id, item, { exact: true })
}

/**
 * Moves an item to `desiredStart` on `toTrackId`, resolving to the closest free slot.
 * @returns {boolean} whether the move happened
 */
export function moveItem(project, itemId, toTrackId, desiredStart) {
  const loc = locateItem(project, itemId)
  const target = findTrack(project, toTrackId)
  if (!loc || !target || loc.track.locked || target.locked || !trackAccepts(target, loc.item)) return false
  const start = findFreeStart(target, loc.item.duration, desiredStart, [itemId])
  if (Number.isNaN(start)) return false
  const [item] = loc.track.items.splice(loc.itemIndex, 1)
  item.start = start
  target.items.push(item)
  sortTrack(target)
  return true
}

/**
 * Allowed range of the moved edge (timeline time) for a trim operation.
 * @param {import('../model/types').Project} project
 * @param {string} itemId
 * @param {'start' | 'end'} edge
 * @returns {{ min: number, max: number } | null}
 */
export function getTrimBounds(project, itemId, edge) {
  const loc = locateItem(project, itemId)
  if (!loc) return null
  const { item, track, itemIndex } = loc
  const end = itemEnd(item)
  const prev = track.items[itemIndex - 1]
  const next = track.items[itemIndex + 1]
  const asset = project.assets[item.assetId]
  const srcDuration = isTimedItem(item) ? asset?.duration : undefined
  const loops = item.type === 'audio' && item.loop
  const speed = isTimedItem(item) ? effectiveSpeed(item) : 1

  if (edge === 'start') {
    let min = prev ? itemEnd(prev) : 0
    if (isTimedItem(item) && !loops) {
      if (!item.reversed) min = Math.max(min, item.start - item.sourceIn / speed)
      else if (srcDuration) min = Math.max(min, end - (srcDuration - item.sourceIn) / speed)
    }
    return { min, max: Math.max(min, end - MIN_ITEM_DURATION) }
  }
  let max = next ? next.start : Number.POSITIVE_INFINITY
  if (isTimedItem(item) && !loops) {
    if (!item.reversed && srcDuration) max = Math.min(max, item.start + (srcDuration - item.sourceIn) / speed)
    else if (item.reversed) max = Math.min(max, end + item.sourceIn / speed)
  }
  const min = item.start + MIN_ITEM_DURATION
  return { min, max: Math.max(min, max) }
}

/**
 * Turns a speed ramp into a constant (average) speed with the same timing.
 * Timing edits (trim, split, in-point) work on constant-speed clips.
 */
export function flattenSpeedRamp(item) {
  if (!item.speedRamp) return
  const range = sourceRange(item)
  delete item.speedRamp
  if (item.duration > 0) item.speed = Math.min(16, Math.max(0.1, range / item.duration))
}

/** Clips a fading effect to the remaining part of a split clip. */
function trimEffectsRamp(item, keep) {
  if (!item.effectsRamp) return
  item.effectsRamp = { ...item.effectsRamp, ...(keep === 'left' ? { rampOut: 0 } : { rampIn: 0 }) }
  if (!item.effectsRamp.rampIn && !item.effectsRamp.rampOut) delete item.effectsRamp
}

function wrapSource(t, duration) {
  if (!duration || duration <= 0) return t
  return ((t % duration) + duration) % duration
}

/** Moves the start edge of an item, keeping its end fixed. */
export function trimItemStart(project, itemId, newStart) {
  const loc = locateItem(project, itemId)
  const bounds = getTrimBounds(project, itemId, 'start')
  if (!loc || !bounds || loc.track.locked) return false
  const item = loc.item
  const start = Math.min(Math.max(newStart, bounds.min), bounds.max)
  const delta = start - item.start
  if (Math.abs(delta) < EPSILON) return false
  if (isTimedItem(item)) flattenSpeedRamp(item)
  if (isTimedItem(item) && !item.reversed) {
    item.sourceIn = item.sourceIn + delta * item.speed
    if (item.type === 'audio' && item.loop) item.sourceIn = wrapSource(item.sourceIn, project.assets[item.assetId]?.duration)
    item.sourceIn = Math.max(0, item.sourceIn)
  }
  item.start = start
  item.duration -= delta
  sortTrack(loc.track)
  return true
}

/** Moves the end edge of an item, keeping its start fixed. */
export function trimItemEnd(project, itemId, newEnd) {
  const loc = locateItem(project, itemId)
  const bounds = getTrimBounds(project, itemId, 'end')
  if (!loc || !bounds || loc.track.locked) return false
  const item = loc.item
  const end = Math.min(Math.max(newEnd, bounds.min), bounds.max)
  const delta = end - itemEnd(item)
  if (Math.abs(delta) < EPSILON) return false
  if (isTimedItem(item)) flattenSpeedRamp(item)
  if (isTimedItem(item) && item.reversed) item.sourceIn = Math.max(0, item.sourceIn - delta * item.speed)
  item.duration += delta
  return true
}

/**
 * Splits an item at timeline time `t`.
 * @returns {string | null} id of the new (right) item
 */
export function splitItem(project, itemId, t) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.track.locked) return null
  const item = loc.item
  const leftDuration = t - item.start
  const rightDuration = itemEnd(item) - t
  if (leftDuration < MIN_ITEM_DURATION - EPSILON || rightDuration < MIN_ITEM_DURATION - EPSILON) return null

  if (isTimedItem(item) && item.speedRamp) {
    // Keep the exact cut position, then give each half its own average speed.
    const range = sourceRange(item)
    const leftRange = consumedAt(item, leftDuration)
    delete item.speedRamp
    item.speed = Math.min(16, Math.max(0.1, leftRange / leftDuration))
    const rightSpeed = Math.min(16, Math.max(0.1, (range - leftRange) / rightDuration))
    const right = JSON.parse(JSON.stringify(item))
    right.speed = rightSpeed
    return finishSplit(project, loc, item, right, t, leftDuration, rightDuration, leftRange)
  }

  const right = JSON.parse(JSON.stringify(item))
  return finishSplit(project, loc, item, right, t, leftDuration, rightDuration, isTimedItem(item) ? leftDuration * item.speed : 0)
}

function finishSplit(project, loc, item, right, t, leftDuration, rightDuration, leftRange) {
  right.id = createId()
  right.start = t
  right.duration = rightDuration
  // A transition belongs to the start of the original clip, not to the cut.
  delete right.transitionIn
  trimEffectsRamp(right, 'right')
  trimEffectsRamp(item, 'left')
  if (item.animation && (item.type === 'video' || item.type === 'image')) {
    right.animation = { ...right.animation, in: { kind: 'none', duration: 0 } }
    item.animation = { ...item.animation, out: { kind: 'none', duration: 0 } }
  }

  if (isTimedItem(item)) {
    if (item.reversed) {
      item.sourceIn = item.sourceIn + rightDuration * right.speed
    } else {
      right.sourceIn = item.sourceIn + leftRange
      if (right.type === 'audio' && right.loop) {
        right.sourceIn = wrapSource(right.sourceIn, project.assets[item.assetId]?.duration)
      }
    }
    item.audio.fadeOut = 0
    right.audio.fadeIn = 0
  }

  if (item.keyframes) {
    for (const key of Object.keys(item.keyframes)) {
      const frames = item.keyframes[key] ?? []
      item.keyframes[key] = frames.filter((k) => k.t <= leftDuration + EPSILON)
      right.keyframes[key] = frames
        .filter((k) => k.t >= leftDuration - EPSILON)
        .map((k) => ({ ...k, t: Math.max(0, k.t - leftDuration) }))
    }
  }

  item.duration = leftDuration
  loc.track.items.splice(loc.itemIndex + 1, 0, right)
  return right.id
}

/**
 * Splits at the playhead. When `itemIds` is given only those items are split,
 * otherwise every item under the playhead on unlocked tracks.
 *
 * @returns {string[]} ids of the created items
 */
export function splitAt(project, t, itemIds) {
  const created = []
  for (const track of project.tracks) {
    if (track.locked) continue
    for (const item of [...track.items]) {
      if (itemIds && !itemIds.includes(item.id)) continue
      if (item.start < t - EPSILON && itemEnd(item) > t + EPSILON) {
        const id = splitItem(project, item.id, t)
        if (id) created.push(id)
      }
    }
  }
  return created
}

/** @returns {number} how many items were removed */
export function deleteItems(project, itemIds) {
  const ids = new Set(itemIds)
  let removed = 0
  for (const track of project.tracks) {
    if (track.locked) continue
    const before = track.items.length
    track.items = track.items.filter((i) => !ids.has(i.id))
    removed += before - track.items.length
  }
  return removed
}

/**
 * Duplicates items, placing each copy right after its original (or the nearest free slot).
 * @returns {string[]} ids of the copies
 */
export function duplicateItems(project, itemIds) {
  const created = []
  for (const id of itemIds) {
    const loc = locateItem(project, id)
    if (!loc || loc.track.locked) continue
    const copy = JSON.parse(JSON.stringify(loc.item))
    copy.id = createId()
    copy.start = findFreeStart(loc.track, copy.duration, itemEnd(loc.item))
    loc.track.items.push(copy)
    sortTrack(loc.track)
    created.push(copy.id)
  }
  return created
}

/**
 * Removes the section between `from` and `to` on all unlocked tracks. With
 * `ripple`, everything after the range is shifted left to close the gap.
 */
export function deleteRange(project, from, to, ripple = true) {
  const a = Math.max(0, Math.min(from, to))
  const b = Math.max(from, to)
  if (b - a < EPSILON) return
  const gap = b - a
  for (const track of project.tracks) {
    if (track.locked) continue
    for (const item of [...track.items]) {
      if (item.start < a - EPSILON && itemEnd(item) > a + EPSILON) splitItem(project, item.id, a)
    }
    for (const item of [...track.items]) {
      if (item.start < b - EPSILON && itemEnd(item) > b + EPSILON) splitItem(project, item.id, b)
    }
    track.items = track.items.filter((i) => !(i.start >= a - EPSILON && itemEnd(i) <= b + EPSILON))
    if (ripple) {
      for (const item of track.items) if (item.start >= b - EPSILON) item.start -= gap
    }
    sortTrack(track)
  }
}

/** Sets start/duration of an item from numeric inputs, respecting neighbours and source limits. */
export function setItemTiming(project, itemId, timing) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.track.locked) return false
  let changed = false
  if (timing.start !== undefined && Math.abs(timing.start - loc.item.start) > EPSILON) {
    changed = moveItem(project, itemId, loc.track.id, timing.start) || changed
  }
  if (timing.duration !== undefined) {
    const current = locateItem(project, itemId).item
    changed = trimItemEnd(project, itemId, current.start + timing.duration) || changed
  }
  return changed
}

/** Changes the source in-point while keeping the item's timeline position. */
export function setSourceIn(project, itemId, sourceIn) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.track.locked || !isTimedItem(loc.item)) return false
  const item = loc.item
  flattenSpeedRamp(item)
  const srcDuration = project.assets[item.assetId]?.duration ?? Number.POSITIVE_INFINITY
  const maxIn = Math.max(0, srcDuration - MIN_ITEM_DURATION * item.speed)
  item.sourceIn = Math.min(Math.max(0, sourceIn), maxIn)
  const maxDuration = (srcDuration - item.sourceIn) / item.speed
  const next = loc.track.items[loc.itemIndex + 1]
  const limit = Math.min(maxDuration, next ? next.start - item.start : Number.POSITIVE_INFINITY)
  if (item.duration > limit) item.duration = Math.max(MIN_ITEM_DURATION, limit)
  return true
}

/**
 * Shallow-merges `patch` into an item, deep-merging nested plain objects one level down.
 * @param {import('../model/types').Project} project
 * @param {string} itemId
 * @param {Record<string, unknown>} patch
 */
export function updateItem(project, itemId, patch) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.track.locked) return false
  const target = loc.item
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id' || key === 'type' || key === 'start' || key === 'duration') continue
    const current = target[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object') {
      Object.assign(current, value)
    } else {
      target[key] = value
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// Speed, transitions and range edits
// ---------------------------------------------------------------------------

/**
 * Changes the playback speed of a clip. The used source range stays the same,
 * so the clip gets shorter (faster) or longer (slower); later clips on the same
 * track ripple to keep the cut points intact.
 *
 * @param {import('../model/types').Project} project
 * @param {string} itemId
 * @param {number} speed
 * @param {{ ripple?: boolean }} [options]
 */
export function setItemSpeed(project, itemId, speed, options = {}) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.track.locked || !isTimedItem(loc.item)) return false
  const item = loc.item
  const next = Math.min(16, Math.max(0.1, speed))
  const ramp = options.ramp === undefined ? item.speedRamp : options.ramp
  if (Math.abs(next - item.speed) < 1e-6 && ramp === item.speedRamp) return false

  const range = sourceRange(item)
  let newDuration
  if (ramp && ((ramp.rampIn ?? 0) > 0 || (ramp.rampOut ?? 0) > 0)) {
    const from = Math.min(16, Math.max(0.1, ramp.from ?? 1))
    const fit = durationForRamp(range, next, from, ramp.rampIn ?? 0, ramp.rampOut ?? 0)
    item.speedRamp = { from, rampIn: fit.rampIn, rampOut: fit.rampOut }
    newDuration = Math.max(MIN_ITEM_DURATION, fit.duration)
  } else {
    delete item.speedRamp
    newDuration = Math.max(MIN_ITEM_DURATION, range / next)
  }
  const delta = newDuration - item.duration
  const oldEnd = itemEnd(item)
  item.speed = next
  item.duration = newDuration

  if (options.ripple !== false) {
    for (const other of loc.track.items) {
      if (other.id !== item.id && other.start >= oldEnd - EPSILON) other.start += delta
    }
  } else {
    // Without rippling, clamp to the next clip.
    const nextItem = loc.track.items[loc.itemIndex + 1]
    if (nextItem && itemEnd(item) > nextItem.start) item.duration = Math.max(MIN_ITEM_DURATION, nextItem.start - item.start)
  }
  sortTrack(loc.track)
  return true
}

/**
 * Splits the given items (or every item on unlocked tracks) at `from` and `to`
 * and returns the ids of the pieces that lie inside the range - ready to have
 * speed, effects or volume applied to just that part of a clip.
 *
 * @returns {string[]} ids of the items inside [from, to]
 */
export function isolateRange(project, from, to, itemIds) {
  const a = Math.min(from, to)
  const b = Math.max(from, to)
  if (b - a < MIN_ITEM_DURATION) return []
  const selected = itemIds && itemIds.length ? new Set(itemIds) : null
  const inside = []
  for (const track of project.tracks) {
    if (track.locked) continue
    for (const item of [...track.items]) {
      if (selected && !selected.has(item.id)) continue
      if (itemEnd(item) <= a + EPSILON || item.start >= b - EPSILON) continue
      let target = item
      if (item.start < a - EPSILON) {
        const rightId = splitItem(project, item.id, a)
        if (!rightId) continue
        target = track.items.find((i) => i.id === rightId) ?? target
      }
      if (itemEnd(target) > b + EPSILON) {
        splitItem(project, target.id, b)
      }
      inside.push(target.id)
    }
  }
  return inside
}

/**
 * Sets (or clears) the transition played when this clip starts. Only makes
 * sense when another clip ends exactly where this one begins.
 *
 * @param {import('../model/types').Project} project
 * @param {string} itemId
 * @param {import('../model/types').Transition | null} transition
 */
export function setTransition(project, itemId, transition) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.track.locked) return false
  if (!transition || transition.kind === 'none') {
    delete loc.item.transitionIn
    return true
  }
  // A transition may not be longer than either of the two clips it joins.
  const prev = loc.track.items[loc.itemIndex - 1]
  const limit = Math.min(loc.item.duration, prev ? prev.duration : loc.item.duration)
  loc.item.transitionIn = {
    kind: transition.kind,
    duration: Math.max(0.1, Math.min(transition.duration, limit)),
    ...(transition.direction ? { direction: transition.direction } : {}),
  }
  return true
}

/** True when a clip directly follows another one on the same track. */
export function hasPreviousNeighbour(project, itemId) {
  const loc = locateItem(project, itemId)
  if (!loc) return false
  const prev = loc.track.items[loc.itemIndex - 1]
  return !!prev && Math.abs(itemEnd(prev) - loc.item.start) < 0.05
}

/**
 * Sets the same transition on every clip of the item's track that directly
 * follows another clip (or clears them all for `kind: 'none'`).
 * @returns {number} number of cuts changed
 */
export function applyTransitionToTrack(project, itemId, transition) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.track.locked) return 0
  let count = 0
  for (const item of loc.track.items) {
    if (!hasPreviousNeighbour(project, item.id)) continue
    if (setTransition(project, item.id, transition)) count++
  }
  return count
}

/**
 * Removes parts of one clip (e.g. silences) and closes the gaps on its track.
 * Other tracks are not touched.
 *
 * @param {import('../model/types').Project} project
 * @param {string} itemId
 * @param {[number, number][]} ranges timeline ranges inside the clip
 * @returns {{ removed: number, seconds: number }}
 */
export function cutRangesFromItem(project, itemId, ranges) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.track.locked) return { removed: 0, seconds: 0 }
  const track = loc.track
  let removed = 0
  let seconds = 0
  // Back to front: the original item always remains the left-most piece.
  const sorted = [...ranges].filter(([a, b]) => b - a > MIN_ITEM_DURATION).sort((x, y) => y[0] - x[0])
  for (const [rawFrom, rawTo] of sorted) {
    const item = track.items.find((i) => i.id === itemId)
    if (!item) break
    const from = Math.max(item.start, rawFrom)
    const to = Math.min(itemEnd(item), rawTo)
    if (to - from < MIN_ITEM_DURATION) continue

    if (itemEnd(item) - to >= MIN_ITEM_DURATION) {
      const rightId = splitItem(project, item.id, to)
      const right = rightId ? track.items.find((i) => i.id === rightId) : null
      if (right) delete right.transitionIn
    }
    let middle = track.items.find((i) => i.id === itemId)
    if (!middle) break
    if (from - middle.start >= MIN_ITEM_DURATION) {
      const middleId = splitItem(project, middle.id, from)
      middle = middleId ? track.items.find((i) => i.id === middleId) : null
      if (!middle) continue
    }
    const gap = middle.duration
    const gapStart = middle.start
    track.items = track.items.filter((i) => i.id !== middle.id)
    for (const other of track.items) if (other.start >= gapStart - EPSILON) other.start -= gap
    sortTrack(track)
    removed++
    seconds += gap
  }
  return { removed, seconds }
}

/**
 * Puts a visual item at exactly `item.start` on a free overlay track above the
 * main track, creating a new top track when every overlay track is busy.
 * @returns {import('../model/types').Item | null}
 */
export function insertOverlay(project, item, options = {}) {
  const visual = project.tracks.filter((t) => t.kind === 'visual' && !t.locked)
  if (options.directlyAboveMain && visual.length) {
    // Blur regions must sit right above the footage, below text and stickers.
    const main = visual[visual.length - 1]
    const mainIndex = project.tracks.indexOf(main)
    const above = project.tracks[mainIndex - 1]
    if (above && above.kind === 'visual' && !above.locked && isRangeFree(above, item.start, item.duration)) {
      return insertItem(project, above.id, item, { exact: true })
    }
    const track = addTrack(project, 'visual', mainIndex)
    return insertItem(project, track.id, item, { exact: true })
  }
  // Tracks above the bottom (main) track, nearest to it first.
  for (const track of visual.slice(0, -1).reverse()) {
    if (isRangeFree(track, item.start, item.duration)) return insertItem(project, track.id, item, { exact: true })
  }
  const track = addTrack(project, 'visual')
  return insertItem(project, track.id, item, { exact: true })
}

/**
 * Freeze frame: splits the clip at `t`, pushes everything after it on the
 * track by `duration` and inserts `still` (an image item) in the gap.
 * @returns {string | null} id of the inserted still
 */
export function insertFreezeFrame(project, videoItemId, t, still) {
  const loc = locateItem(project, videoItemId)
  if (!loc || loc.track.locked) return null
  const track = loc.track
  const item = loc.item
  if (t > item.start + EPSILON && t < itemEnd(item) - EPSILON) splitItem(project, item.id, t)
  for (const other of track.items) if (other.start >= t - EPSILON) other.start += still.duration
  still.start = t
  track.items.push(still)
  sortTrack(track)
  return still.id
}
