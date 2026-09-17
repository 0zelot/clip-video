/**
 * Frame compositor.
 *
 * Draws the project at a given time into any 2D canvas context. It knows
 * nothing about *how* frames are obtained: the preview passes a provider backed
 * by <video>/<img> elements, the exporter one backed by WebCodecs-decoded
 * samples inside a worker.
 */
import { activeItemOnTrack } from '../model/queries'
import { isTextual, isVisualItem } from '../model/types'
import { sourceTimeAt } from '../time'
import { buildFilter, computeItemRect } from './layout'
import { drawTextItem } from './text'

/**
 * @typedef {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} Ctx2D
 *
 * @typedef {{ image: CanvasImageSource, width: number, height: number }} FrameImage
 *
 * A frame result: an image, `null` when it is not available yet (keep going)
 * or `'missing'` when the media is offline.
 * @typedef {FrameImage | null | 'missing'} FrameResult
 *
 * @typedef {{ getFrame(item: import('../model/types').VisualItem, sourceTime: number): FrameResult }} FrameProvider
 *
 * @typedef {object} VisualLayer
 * @property {import('../model/types').VisualItem} item
 * @property {import('../model/types').Track} track
 * @property {number} sourceTime time in the source media (0 for images and text)
 * @property {{ kind: string, direction?: string, progress: number, previous: VisualLayer }} [transition]
 *
 * @typedef {object} RenderOptions
 * @property {number} scale output pixels per project pixel
 * @property {boolean} [showMissing] draw a placeholder for offline media
 *
 * @typedef {{ pending: string[], missing: string[] }} RenderReport ids of items whose frame was unavailable
 */

function layerFor(track, item, t) {
  const sourceTime = item.type === 'video' ? sourceTimeAt(item, t) : 0
  return { item, track, sourceTime }
}

/**
 * Visible layers at time `t`, ordered bottom to top. When a clip starts with a
 * transition, the previous clip on the same track is attached to it so both can
 * be blended.
 *
 * @param {import('../model/types').Project} project
 * @param {number} t
 * @returns {VisualLayer[]}
 */
export function collectVisualLayers(project, t) {
  const layers = []
  for (let i = project.tracks.length - 1; i >= 0; i--) {
    const track = project.tracks[i]
    if (track.kind !== 'visual' || track.hidden) continue
    const item = activeItemOnTrack(track, t)
    if (!item || !isVisualItem(item)) continue
    const layer = layerFor(track, item, t)

    const transition = item.transitionIn
    if (transition && transition.kind !== 'none' && t < item.start + transition.duration) {
      const index = track.items.indexOf(item)
      const previous = track.items[index - 1]
      if (previous && isVisualItem(previous) && Math.abs(previous.start + previous.duration - item.start) < 0.05) {
        // The outgoing clip keeps playing past its out point during the blend
        // (the frame provider clamps to the last available frame).
        const overshoot = t - item.start
        const prevSourceTime =
          previous.type === 'video'
            ? sourceTimeAt(previous, previous.start + previous.duration) + overshoot * previous.speed
            : 0
        layer.transition = {
          kind: transition.kind,
          direction: transition.direction ?? 'left',
          progress: Math.min(1, overshoot / transition.duration),
          previous: { item: previous, track, sourceTime: prevSourceTime },
        }
      }
    }
    layers.push(layer)
  }
  return layers
}

function drawBackground(ctx, project, background, layers, provider, scale) {
  const { width: w, height: h } = project.settings
  if (background.kind === 'gradient') {
    const rad = ((background.angle - 90) * Math.PI) / 180
    const dx = (Math.cos(rad) * w) / 2
    const dy = (Math.sin(rad) * h) / 2
    const g = ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy)
    g.addColorStop(0, background.from)
    g.addColorStop(1, background.to)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    return
  }
  ctx.fillStyle = background.kind === 'color' ? background.color : '#000000'
  ctx.fillRect(0, 0, w, h)

  if (background.kind === 'blur') {
    const bottom = layers.find((l) => l.item.type === 'video' || l.item.type === 'image')
    if (!bottom) return
    const frame = provider.getFrame(bottom.item, bottom.sourceTime)
    if (!frame || frame === 'missing') return
    const rect = computeItemRect(
      { ...bottom.item, fit: 'cover', transform: { ...bottom.item.transform, x: 0.5, y: 0.5, scale: 1.1, scaleX: 1, scaleY: 1, rotation: 0 } },
      frame.width,
      frame.height,
      w,
      h,
    )
    ctx.save()
    ctx.filter = `blur(${Math.max(1, background.amount) * scale}px) brightness(0.8)`
    ctx.drawImage(frame.image, rect.sx, rect.sy, rect.sw, rect.sh, rect.cx - rect.width / 2, rect.cy - rect.height / 2, rect.width, rect.height)
    ctx.restore()
  }
}

function drawMissing(ctx, project) {
  const { width: w, height: h } = project.settings
  ctx.save()
  ctx.fillStyle = '#1b1b24'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#8a8aa0'
  ctx.font = `600 ${Math.round(Math.min(w, h) * 0.045)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('Media offline', w / 2, h / 2)
  ctx.restore()
}

function drawVignette(ctx, rect, amount) {
  const radius = Math.max(rect.width, rect.height) * 0.75
  const gradient = ctx.createRadialGradient(0, 0, radius * 0.35, 0, 0, radius)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, amount)})`)
  ctx.fillStyle = gradient
  ctx.fillRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height)
}

/**
 * Draws one media layer. `modifier` lets transitions move, scale, clip or fade
 * the layer without changing the project data.
 *
 * @returns {'ok' | 'pending' | 'missing'}
 */
function drawMediaLayer(ctx, layer, provider, project, options, modifier = {}) {
  const { item } = layer
  const frame = provider.getFrame(item, layer.sourceTime)
  if (frame === 'missing') return 'missing'
  if (!frame) return 'pending'
  const alpha = (modifier.alpha ?? 1) * item.opacity
  if (alpha <= 0) return 'ok'

  const r = computeItemRect(item, frame.width, frame.height, project.settings.width, project.settings.height)
  ctx.save()
  if (modifier.clip) {
    ctx.beginPath()
    ctx.rect(modifier.clip.x, modifier.clip.y, modifier.clip.width, modifier.clip.height)
    ctx.clip()
  }
  ctx.globalAlpha = Math.min(1, Math.max(0, alpha))
  const filter = buildFilter(item.effects, options.scale)
  if (filter !== 'none') ctx.filter = filter
  ctx.translate(r.cx + (modifier.translateX ?? 0), r.cy + (modifier.translateY ?? 0))
  if (r.rotation) ctx.rotate((r.rotation * Math.PI) / 180)
  const extra = modifier.scale ?? 1
  if (extra !== 1) ctx.scale(extra, extra)
  if (r.flipH || r.flipV) ctx.scale(r.flipH ? -1 : 1, r.flipV ? -1 : 1)
  ctx.drawImage(frame.image, r.sx, r.sy, r.sw, r.sh, -r.width / 2, -r.height / 2, r.width, r.height)
  if (item.effects.vignette > 0) {
    ctx.filter = 'none'
    drawVignette(ctx, r, item.effects.vignette)
  }
  ctx.restore()
  return 'ok'
}

/** Renders a clip that is blending with the previous one on the same track. */
function drawTransition(ctx, layer, provider, project, options, report) {
  const { width: w, height: h } = project.settings
  const { kind, direction, progress: p, previous } = layer.transition
  const track = (status, id) => {
    if (status === 'pending') report.pending.push(id)
    if (status === 'missing') report.missing.push(id)
  }

  const drawPrev = (modifier) => track(drawMediaLayer(ctx, previous, provider, project, options, modifier), previous.item.id)
  const drawNext = (modifier) =>
    track(
      isTextual(layer.item)
        ? (drawTextLayer(ctx, layer, project, modifier), 'ok')
        : drawMediaLayer(ctx, layer, provider, project, options, modifier),
      layer.item.id,
    )

  switch (kind) {
    case 'crossfade':
      drawPrev({})
      drawNext({ alpha: p })
      break
    case 'fade':
      drawPrev({ alpha: 1 - p })
      drawNext({ alpha: p })
      break
    case 'dipBlack':
    case 'dipWhite': {
      const color = kind === 'dipBlack' ? '#000000' : '#ffffff'
      if (p < 0.5) {
        drawPrev({})
        ctx.save()
        ctx.globalAlpha = p * 2
        ctx.fillStyle = color
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
      } else {
        drawNext({})
        ctx.save()
        ctx.globalAlpha = (1 - p) * 2
        ctx.fillStyle = color
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
      }
      break
    }
    case 'slide': {
      const dx = direction === 'left' ? w : direction === 'right' ? -w : 0
      const dy = direction === 'up' ? h : direction === 'down' ? -h : 0
      drawPrev({ translateX: -dx * p * 0.35, translateY: -dy * p * 0.35 })
      drawNext({ translateX: dx * (1 - p), translateY: dy * (1 - p) })
      break
    }
    case 'wipe': {
      drawPrev({})
      const clip =
        direction === 'left'
          ? { x: w * (1 - p), y: 0, width: w * p, height: h }
          : direction === 'right'
            ? { x: 0, y: 0, width: w * p, height: h }
            : direction === 'up'
              ? { x: 0, y: h * (1 - p), width: w, height: h * p }
              : { x: 0, y: 0, width: w, height: h * p }
      drawNext({ clip })
      break
    }
    case 'zoom':
      drawPrev({ scale: 1 + 0.25 * p, alpha: 1 - p * 0.6 })
      drawNext({ scale: 0.6 + 0.4 * p, alpha: p })
      break
    default:
      drawNext({})
      break
  }
}

/** Draws a text or caption layer (optionally faded by a transition). */
function drawTextLayer(ctx, layer, project, modifier = {}) {
  const { item } = layer
  const alpha = modifier.alpha ?? 1
  ctx.save()
  if (alpha < 1) ctx.globalAlpha = alpha
  if (modifier.translateX || modifier.translateY) ctx.translate(modifier.translateX ?? 0, modifier.translateY ?? 0)
  drawTextItem(ctx, item, project.settings, layer.localTime)
  ctx.restore()
}

/**
 * @param {Ctx2D} ctx
 * @param {import('../model/types').Project} project
 * @param {number} time
 * @param {FrameProvider} provider
 * @param {RenderOptions} options
 * @returns {RenderReport}
 */
export function renderFrame(ctx, project, time, provider, options) {
  const report = { pending: [], missing: [] }
  const layers = collectVisualLayers(project, time)

  ctx.save()
  ctx.setTransform(options.scale, 0, 0, options.scale, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  drawBackground(ctx, project, project.settings.background, layers, provider, options.scale)

  for (const layer of layers) {
    layer.localTime = time - layer.item.start
    if (layer.transition) {
      drawTransition(ctx, layer, provider, project, options, report)
      continue
    }
    if (isTextual(layer.item)) {
      drawTextLayer(ctx, layer, project)
      continue
    }
    const status = drawMediaLayer(ctx, layer, provider, project, options)
    if (status === 'pending') report.pending.push(layer.item.id)
    if (status === 'missing') {
      report.missing.push(layer.item.id)
      if (options.showMissing) drawMissing(ctx, project)
    }
  }
  ctx.restore()
  return report
}
