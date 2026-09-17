import { EPSILON, isActiveAt, itemEnd } from '../time'

/**
 * @typedef {object} ItemLocation
 * @property {import('./types').Track} track
 * @property {number} trackIndex
 * @property {import('./types').Item} item
 * @property {number} itemIndex
 */

/**
 * @param {import('./types').Project} project
 * @param {import('./types').Id} itemId
 * @returns {ItemLocation | null}
 */
export function locateItem(project, itemId) {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
    const track = project.tracks[trackIndex]
    const itemIndex = track.items.findIndex((i) => i.id === itemId)
    if (itemIndex !== -1) return { track, trackIndex, item: track.items[itemIndex], itemIndex }
  }
  return null
}

export function findItem(project, itemId) {
  return locateItem(project, itemId)?.item
}

export function findTrack(project, trackId) {
  return project.tracks.find((t) => t.id === trackId)
}

export function getAsset(project, assetId) {
  return project.assets[assetId]
}

export function projectDuration(project) {
  let end = 0
  for (const track of project.tracks) {
    const last = track.items[track.items.length - 1]
    if (last) end = Math.max(end, itemEnd(last))
  }
  return end
}

export function trackEnd(track) {
  const last = track.items[track.items.length - 1]
  return last ? itemEnd(last) : 0
}

/**
 * Item of a track active at time `t` (at most one, as items never overlap).
 * @param {import('./types').Track} track
 * @param {number} t
 */
export function activeItemOnTrack(track, t) {
  // Items are sorted - binary search for the last item starting at or before t.
  let lo = 0
  let hi = track.items.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (track.items[mid].start <= t + EPSILON) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found === -1) return undefined
  const item = track.items[found]
  return isActiveAt(item, t) ? item : undefined
}

/** Items within [from, to) on a track. */
export function itemsInRange(track, from, to) {
  return track.items.filter((i) => i.start < to - EPSILON && itemEnd(i) > from + EPSILON)
}

/**
 * Assets referenced by any item, by the background, or by a text font.
 * @returns {Set<import('./types').Id>}
 */
export function referencedAssetIds(project) {
  const ids = new Set()
  for (const track of project.tracks) {
    for (const item of track.items) if (item.assetId) ids.add(item.assetId)
  }
  // Custom fonts used by text and caption items.
  for (const asset of Object.values(project.assets)) {
    if (asset.kind === 'font' && !asset.removed && usesFont(project, asset)) ids.add(asset.id)
  }
  if (project.settings.background.kind === 'image') ids.add(project.settings.background.assetId)
  return ids
}

/** True when any text or caption item renders with this font asset. */
function usesFont(project, asset) {
  const family = asset.fontFamily ?? asset.name
  return project.tracks.some((t) => t.items.some((i) => (i.type === 'text' || i.type === 'caption') && i.style?.fontFamily === family))
}

export function countAssetUsage(project, assetId) {
  let n = 0
  for (const track of project.tracks) for (const item of track.items) if (item.assetId === assetId) n++
  return n
}

export function allItemIds(project) {
  return project.tracks.flatMap((t) => t.items.map((i) => i.id))
}
