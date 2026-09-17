/**
 * Shared timeline geometry and helpers, provided by `TimelinePanel.vue` and
 * consumed by rows, clips and strips.
 *
 * @typedef {object} TrackGeometry
 * @property {import('~/core/model/types').Track} track
 * @property {number} index
 * @property {number} top
 * @property {number} height
 *
 * @typedef {{ scrollLeft: number, width: number }} TimelineViewport
 *
 * @typedef {object} TimelineContext
 * @property {import('vue').Ref<number>} pxPerSecond pixels per second
 * @property {import('vue').ShallowRef<TimelineViewport>} viewport
 * @property {import('vue').Ref<TrackGeometry[]>} trackGeometry
 * @property {(clientX: number) => number} timeAt timeline time under a client x coordinate
 * @property {(clientY: number) => (TrackGeometry | null)} trackAt track under a client y coordinate
 * @property {(edges: number[], exclude: string[]) => { delta: number, point: number | null }} snap
 * @property {(time: number | null) => void} setSnapIndicator
 * @property {(clientX: number) => void} autoScroll scrolls while dragging near the edges
 * @property {(id: string) => (import('~/core/model/types').TrackKind | null)} trackKindOf
 */

export const TIMELINE_CONTEXT = Symbol('clip:timeline')

/** @returns {TimelineContext} */
export function useTimeline() {
  const ctx = inject(TIMELINE_CONTEXT)
  if (!ctx) throw new Error('Timeline context is not available')
  return ctx
}
