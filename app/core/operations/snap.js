import { itemEnd } from '../time'

/**
 * Collects candidate snap points: item edges, the playhead, marks and zero.
 *
 * @param {import('../model/types').Project} project
 * @param {Iterable<string>} exclude item ids being dragged
 * @param {number[]} [extra]
 * @returns {number[]} sorted snap points
 */
export function collectSnapPoints(project, exclude, extra = []) {
  const excluded = new Set(exclude)
  const points = new Set([0, ...extra])
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (excluded.has(item.id)) continue
      points.add(item.start)
      points.add(itemEnd(item))
    }
  }
  return [...points].sort((a, b) => a - b)
}

/**
 * Finds the closest snap point for any of the given `edges` within `threshold`
 * seconds. Returns the delta that aligns that edge with the point.
 *
 * @param {number[]} edges
 * @param {number[]} points sorted
 * @param {number} threshold in seconds
 * @returns {{ delta: number, point: number | null }}
 */
export function snapEdges(edges, points, threshold) {
  let best = { delta: 0, point: null }
  let bestDistance = threshold
  for (const edge of edges) {
    // Points are sorted - binary search for the neighbourhood.
    let lo = 0
    let hi = points.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (points[mid] < edge) lo = mid + 1
      else hi = mid
    }
    for (const i of [lo - 1, lo]) {
      const p = points[i]
      if (p === undefined) continue
      const distance = Math.abs(p - edge)
      if (distance <= bestDistance) {
        bestDistance = distance
        best = { delta: p - edge, point: p }
      }
    }
  }
  return best
}
