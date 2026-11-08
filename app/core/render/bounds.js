/**
 * On-canvas bounds of visual items (project pixels), used for the selection
 * box on the preview and for tapping items to select them.
 */
import { isTextual } from '../model/types'
import { collectVisualLayers } from './compositor'
import { resolveItemAt } from './animate'
import { computeItemRect } from './layout'
import { measureTextItem } from './text'

/**
 * @returns {{ cx: number, cy: number, width: number, height: number, rotation: number } | null}
 */
export function itemBounds(item, project, measureCtx, local = 0) {
  const current = resolveItemAt(item, local)
  const { width: pw, height: ph } = project.settings
  if (isTextual(current)) {
    if (!measureCtx) return null
    const m = measureTextItem(measureCtx, current, project.settings)
    return { cx: m.cx, cy: m.cy, width: m.width, height: m.height, rotation: current.transform.rotation }
  }
  if (current.type === 'blur') {
    const tr = current.transform
    return { cx: tr.x * pw, cy: tr.y * ph, width: current.size.w * pw * tr.scale * (tr.scaleX ?? 1), height: current.size.h * ph * tr.scale * (tr.scaleY ?? 1), rotation: tr.rotation }
  }
  const asset = project.assets[current.assetId]
  const r = computeItemRect(current, asset?.width ?? 1920, asset?.height ?? 1080, pw, ph)
  return { cx: r.cx, cy: r.cy, width: r.width, height: r.height, rotation: r.rotation }
}

/**
 * Topmost visible item under a point (project pixels), or null. Clips on the
 * bottom (main) video track are skipped by default - tapping the picture
 * should not select the footage itself.
 */
export function hitTest(project, time, x, y, measureCtx, options = {}) {
  const layers = collectVisualLayers(project, time)
  const visual = project.tracks.filter((t) => t.kind === 'visual')
  const main = visual[visual.length - 1]
  for (let i = layers.length - 1; i >= 0; i--) {
    const { item, track } = layers[i]
    if (track.locked) continue
    if (!options.includeMain && track === main && !isTextual(item) && item.type !== 'blur') continue
    const b = itemBounds(item, project, measureCtx, time - item.start)
    if (!b) continue
    const rad = (-(b.rotation ?? 0) * Math.PI) / 180
    const dx = x - b.cx
    const dy = y - b.cy
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad)
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad)
    const pad = Math.min(project.settings.width, project.settings.height) * 0.015
    if (Math.abs(lx) <= b.width / 2 + pad && Math.abs(ly) <= b.height / 2 + pad) return item
  }
  return null
}
