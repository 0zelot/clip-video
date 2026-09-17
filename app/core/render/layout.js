/**
 * @typedef {object} ItemRect
 * @property {number} cx center in canvas pixels
 * @property {number} cy
 * @property {number} width drawn size in canvas pixels (before rotation)
 * @property {number} height
 * @property {number} rotation
 * @property {boolean} flipH
 * @property {boolean} flipV
 * @property {number} sx source rectangle (crop) in source pixels
 * @property {number} sy
 * @property {number} sw
 * @property {number} sh
 */

/**
 * Computes where a visual item is drawn on a canvas of `canvasW` x `canvasH`.
 *
 * @param {Pick<import('../model/types').VisualItem, 'transform' | 'fit' | 'crop'>} item
 * @param {number} sourceW
 * @param {number} sourceH
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {ItemRect}
 */
export function computeItemRect(item, sourceW, sourceH, canvasW, canvasH) {
  const { crop, transform: tr } = item
  const sx = sourceW * crop.left
  const sy = sourceH * crop.top
  const sw = Math.max(1, sourceW * (1 - crop.left - crop.right))
  const sh = Math.max(1, sourceH * (1 - crop.top - crop.bottom))

  let baseW
  let baseH
  if (item.fit === 'stretch') {
    baseW = canvasW
    baseH = canvasH
  } else {
    const s = item.fit === 'cover' ? Math.max(canvasW / sw, canvasH / sh) : Math.min(canvasW / sw, canvasH / sh)
    baseW = sw * s
    baseH = sh * s
  }

  return {
    cx: tr.x * canvasW,
    cy: tr.y * canvasH,
    width: baseW * tr.scale * tr.scaleX,
    height: baseH * tr.scale * tr.scaleY,
    rotation: tr.rotation,
    flipH: tr.flipH,
    flipV: tr.flipV,
    sx,
    sy,
    sw,
    sh,
  }
}

/**
 * Builds a CSS/canvas filter string, or `none` for neutral parameters.
 * @param {import('../model/types').EffectParams} effects
 * @param {number} [pixelScale]
 */
export function buildFilter(effects, pixelScale = 1) {
  const parts = []
  if (effects.brightness !== 1) parts.push(`brightness(${effects.brightness})`)
  if (effects.contrast !== 1) parts.push(`contrast(${effects.contrast})`)
  if (effects.saturation !== 1) parts.push(`saturate(${effects.saturation})`)
  if (effects.hue !== 0) parts.push(`hue-rotate(${effects.hue}deg)`)
  if (effects.blur > 0) parts.push(`blur(${effects.blur * pixelScale}px)`)
  if (effects.grayscale > 0) parts.push(`grayscale(${effects.grayscale})`)
  if (effects.sepia > 0) parts.push(`sepia(${effects.sepia})`)
  if (effects.invert > 0) parts.push(`invert(${effects.invert})`)
  return parts.length ? parts.join(' ') : 'none'
}
