/**
 * Keeps a canvas that covers only the visible part of a clip, so deeply zoomed
 * timelines never allocate huge canvases. Calls `paint` whenever the visible
 * window, zoom or clip changes.
 *
 * @typedef {object} StripGeometry
 * @property {number} offset offset of the canvas inside the clip element, in CSS pixels
 * @property {number} width canvas width in CSS pixels
 * @property {number} startTime timeline time at the left edge of the canvas
 */

const MAX_CANVAS_WIDTH = 4000

/**
 * @param {import('vue').Ref<import('~/core/model/types').Item>} item
 * @param {(ctx: CanvasRenderingContext2D, geo: StripGeometry, dpr: number, height: number) => void} paint
 */
export function useStripCanvas(item, paint) {
  const timeline = useTimeline()
  const canvas = ref(null)
  const container = ref(null)
  const geometry = ref({ offset: 0, width: 0, startTime: 0 })
  let raf = 0

  /** @returns {StripGeometry | null} */
  function compute() {
    const el = container.value
    if (!el) return null
    const pps = timeline.pxPerSecond.value
    const { scrollLeft, width: viewWidth } = timeline.viewport.value
    const itemLeft = item.value.start * pps
    const itemWidth = item.value.duration * pps
    const visibleLeft = Math.max(itemLeft, scrollLeft - 200)
    const visibleRight = Math.min(itemLeft + itemWidth, scrollLeft + viewWidth + 200)
    const width = Math.min(MAX_CANVAS_WIDTH, Math.max(0, visibleRight - visibleLeft))
    const offset = visibleLeft - itemLeft
    return { offset, width, startTime: item.value.start + offset / pps }
  }

  function render() {
    raf = 0
    const geo = compute()
    const el = canvas.value
    const host = container.value
    if (!geo || !el || !host) return
    geometry.value = geo
    // Position the canvas directly: avoids a Vue re-render on every scroll frame.
    el.style.left = `${geo.offset}px`
    el.style.width = `${geo.width}px`
    const height = host.clientHeight
    if (geo.width < 1 || height < 1) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(geo.width * dpr)
    const h = Math.round(height * dpr)
    if (el.width !== w || el.height !== h) {
      el.width = w
      el.height = h
    }
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, geo.width, height)
    paint(ctx, geo, dpr, height)
  }

  function requestRender() {
    if (!raf) raf = requestAnimationFrame(render)
  }

  watch([() => timeline.viewport.value, () => timeline.pxPerSecond.value, item], requestRender)
  onMounted(requestRender)
  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf)
  })

  return { canvas, container, geometry, requestRender }
}
