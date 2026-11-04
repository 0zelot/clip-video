/**
 * Frame compositor.
 *
 * Draws the project at a given time into any 2D canvas context. It knows
 * nothing about *how* frames are obtained: the preview passes a provider backed
 * by <video>/<img> elements, the exporter one backed by WebCodecs-decoded
 * samples inside a worker.
 */
import { activeItemOnTrack } from '../model/queries'
import { isMediaVisual, isTextual, isVisualItem } from '../model/types'
import { sourceTimeAt, speedAt } from '../time'
import { effectsAt, resolveItemAt } from './animate'
import { buildFilter, computeItemRect } from './layout'
import { animationState, drawTextItem, measureTextItem, resolveStyle } from './text'

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
  return { item, track, sourceTime, localTime: t - item.start }
}

/** Deterministic pseudo random number in [0, 1) - identical in preview and export. */
function hash01(a, b = 0) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)

/**
 * Camera motion of a clip (Ken Burns zoom/pan, shake, pulse) at `localTime`.
 * @returns {{ scale: number, translateX: number, translateY: number }}
 */
export function motionAt(item, localTime, width, height) {
  const motion = item.motion
  const none = { scale: 1, translateX: 0, translateY: 0 }
  if (!motion || motion.kind === 'none' || !(item.duration > 0)) return none
  const a = Math.min(1, Math.max(0, motion.amount ?? 0.5))
  const p = Math.min(1, Math.max(0, localTime / item.duration))
  const e = easeInOut(p)
  const pan = 0.12 * a
  switch (motion.kind) {
    case 'zoomIn':
      return { scale: 1 + 0.35 * a * e, translateX: 0, translateY: 0 }
    case 'zoomOut':
      return { scale: 1 + 0.35 * a * (1 - e), translateX: 0, translateY: 0 }
    case 'panLeft':
      return { scale: 1 + pan * 2, translateX: (0.5 - e) * pan * 2 * width, translateY: 0 }
    case 'panRight':
      return { scale: 1 + pan * 2, translateX: (e - 0.5) * pan * 2 * width, translateY: 0 }
    case 'panUp':
      return { scale: 1 + pan * 2, translateX: 0, translateY: (0.5 - e) * pan * 2 * height }
    case 'panDown':
      return { scale: 1 + pan * 2, translateX: 0, translateY: (e - 0.5) * pan * 2 * height }
    case 'shake': {
      const f = Math.floor(localTime * 24)
      const amp = 0.018 * a * Math.min(width, height)
      return { scale: 1 + 0.04 * a, translateX: (hash01(f, 1) - 0.5) * 2 * amp, translateY: (hash01(f, 2) - 0.5) * 2 * amp }
    }
    case 'pulse':
      return { scale: 1 + 0.07 * a * (0.5 + 0.5 * Math.sin(localTime * Math.PI * 2 * 1.5)), translateX: 0, translateY: 0 }
    default:
      return none
  }
}

let grainTile = null
/** A small tile of random grey noise, created once per realm (main thread / worker). */
function getGrainTile() {
  if (grainTile) return grainTile
  const size = 128
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')
  if (!c) return null
  const data = c.createImageData(size, size)
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.floor(hash01(i, 7) * 255)
    data.data[i] = v
    data.data[i + 1] = v
    data.data[i + 2] = v
    data.data[i + 3] = 255
  }
  c.putImageData(data, 0, 0)
  grainTile = canvas
  return grainTile
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
      if (previous && (isMediaVisual(previous) || isTextual(previous)) && item.type !== 'blur' && Math.abs(previous.start + previous.duration - item.start) < 0.05) {
        // The outgoing clip keeps playing past its out point during the blend
        // (the frame provider clamps to the last available frame).
        const overshoot = t - item.start
        const prevSourceTime =
          previous.type === 'video'
            ? sourceTimeAt(previous, previous.start + previous.duration) + overshoot * speedAt(previous, previous.duration)
            : 0
        layer.transition = {
          kind: transition.kind,
          direction: transition.direction ?? 'left',
          progress: Math.min(1, overshoot / transition.duration),
          previous: { item: previous, track, sourceTime: prevSourceTime, localTime: t - previous.start },
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

/** Shape masks for picture-in-picture clips, centred at the origin. */
function maskPath(ctx, mask, w, h) {
  const m = Math.min(w, h)
  switch (mask) {
    case 'circle':
      ctx.arc(0, 0, m / 2, 0, Math.PI * 2)
      break
    case 'oval':
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
      break
    case 'rounded': {
      const r = m * 0.12
      ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, r) : ctx.rect(-w / 2, -h / 2, w, h)
      break
    }
    case 'square':
      ctx.rect(-m / 2, -m / 2, m, m)
      break
    case 'heart': {
      const s = m / 2
      ctx.moveTo(0, s * 0.9)
      ctx.bezierCurveTo(-s * 1.1, s * 0.1, -s * 0.9, -s * 0.95, 0, -s * 0.45)
      ctx.bezierCurveTo(s * 0.9, -s * 0.95, s * 1.1, s * 0.1, 0, s * 0.9)
      break
    }
    default:
      ctx.rect(-w / 2, -h / 2, w, h)
  }
}

function drawTint(ctx, rect, temperature) {
  ctx.globalCompositeOperation = 'soft-light'
  ctx.globalAlpha = Math.min(1, Math.abs(temperature) * 0.75)
  ctx.fillStyle = temperature > 0 ? '#ff9233' : '#2f7bff'
  ctx.fillRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height)
}

function drawGrain(ctx, rect, amount, localTime) {
  const tile = getGrainTile()
  if (!tile) return
  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) return
  const f = Math.floor(localTime * 24)
  const ox = Math.floor(hash01(f, 3) * 128)
  const oy = Math.floor(hash01(f, 4) * 128)
  ctx.globalCompositeOperation = 'overlay'
  ctx.globalAlpha = Math.min(1, amount * 0.55)
  ctx.fillStyle = pattern
  ctx.translate(ox, oy)
  ctx.fillRect(-rect.width / 2 - ox, -rect.height / 2 - oy, rect.width, rect.height)
}

/**
 * Draws one media layer. `modifier` lets transitions move, scale, rotate, blur,
 * clip or fade the layer without changing the project data.
 *
 * @returns {'ok' | 'pending' | 'missing'}
 */
function drawMediaLayer(ctx, layer, provider, project, options, modifier = {}) {
  const local = layer.localTime ?? 0
  const item = resolveItemAt(layer.item, local)
  const frame = provider.getFrame(layer.item, layer.sourceTime)
  if (frame === 'missing') return 'missing'
  if (!frame) return 'pending'
  const { width: pw, height: ph } = project.settings
  // Clip in/out animations (fade, pop, slide, …) shared with text.
  const anim = item.animation ? animationState(item, local, ph) : null
  const alpha = (modifier.alpha ?? 1) * item.opacity * (anim?.alpha ?? 1)
  if (alpha <= 0) return 'ok'

  const r = computeItemRect(item, frame.width, frame.height, pw, ph)
  const motion = motionAt(item, local, pw, ph)
  if (anim) {
    motion.scale *= anim.scale
    motion.translateX += anim.offsetX
    motion.translateY += anim.offsetY
  }
  const effects = effectsAt(item, local)
  ctx.save()
  if (modifier.clipPath) {
    ctx.beginPath()
    modifier.clipPath(ctx)
    ctx.clip()
  } else if (modifier.clip) {
    ctx.beginPath()
    ctx.rect(modifier.clip.x, modifier.clip.y, modifier.clip.width, modifier.clip.height)
    ctx.clip()
  }
  ctx.globalAlpha = Math.min(1, Math.max(0, alpha))
  if (item.blendMode && item.blendMode !== 'normal') ctx.globalCompositeOperation = item.blendMode
  let filter = buildFilter(effects, options.scale)
  const animBlur = anim?.blur ?? 0
  if (animBlur > 0.3) filter = `${filter === 'none' ? '' : `${filter} `}blur(${animBlur * options.scale}px)`
  if (modifier.blur > 0.05) filter = `${filter === 'none' ? '' : `${filter} `}blur(${modifier.blur * options.scale}px)`
  if (modifier.brightness && modifier.brightness !== 1) filter = `${filter === 'none' ? '' : `${filter} `}brightness(${modifier.brightness})`
  if (filter !== 'none') ctx.filter = filter
  ctx.translate(r.cx + (modifier.translateX ?? 0) + motion.translateX, r.cy + (modifier.translateY ?? 0) + motion.translateY)
  if (modifier.rotate) ctx.rotate(modifier.rotate)
  if (anim?.rotation) ctx.rotate(anim.rotation)
  if (r.rotation) ctx.rotate((r.rotation * Math.PI) / 180)
  const extra = (modifier.scale ?? 1) * motion.scale
  if (extra !== 1) ctx.scale(extra, extra)
  if (r.flipH || r.flipV) ctx.scale(r.flipH ? -1 : 1, r.flipV ? -1 : 1)
  if (item.mask && item.mask !== 'none') {
    ctx.beginPath()
    maskPath(ctx, item.mask, r.width, r.height)
    ctx.clip()
  }
  ctx.drawImage(frame.image, r.sx, r.sy, r.sw, r.sh, -r.width / 2, -r.height / 2, r.width, r.height)
  const fx = effects
  if (fx.vignette > 0 || fx.temperature || fx.grain > 0) {
    ctx.filter = 'none'
    ctx.globalCompositeOperation = 'source-over'
    if (fx.temperature) {
      ctx.save()
      drawTint(ctx, r, fx.temperature)
      ctx.restore()
    }
    if (fx.grain > 0) {
      ctx.save()
      drawGrain(ctx, r, fx.grain, local)
      ctx.restore()
    }
    if (fx.vignette > 0) drawVignette(ctx, r, fx.vignette)
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
    case 'push': {
      const e = easeInOut(p)
      const dx = direction === 'left' ? w : direction === 'right' ? -w : 0
      const dy = direction === 'up' ? h : direction === 'down' ? -h : 0
      drawPrev({ translateX: -dx * e, translateY: -dy * e })
      drawNext({ translateX: dx * (1 - e), translateY: dy * (1 - e) })
      break
    }
    case 'whip': {
      const e = easeInOut(p)
      const dx = direction === 'left' ? w : direction === 'right' ? -w : 0
      const dy = direction === 'up' ? h : direction === 'down' ? -h : 0
      const blur = Math.sin(Math.PI * p) * Math.min(w, h) * 0.035
      drawPrev({ translateX: -dx * e, translateY: -dy * e, blur })
      drawNext({ translateX: dx * (1 - e), translateY: dy * (1 - e), blur })
      break
    }
    case 'zoomOut':
      drawPrev({ scale: 1 - 0.4 * p, alpha: 1 - p })
      drawNext({ scale: 1.35 - 0.35 * p, alpha: Math.min(1, p * 1.4) })
      break
    case 'blur': {
      const amount = Math.sin(Math.PI * p) * Math.min(w, h) * 0.03
      drawPrev({ blur: amount })
      drawNext({ blur: amount, alpha: easeInOut(p) })
      break
    }
    case 'spin': {
      const e = easeInOut(p)
      if (p < 0.5) drawPrev({ rotate: e * Math.PI, scale: 1 - e * 0.8, blur: e * 10 })
      else drawNext({ rotate: (e - 1) * Math.PI, scale: 0.2 + e * 0.8, blur: (1 - e) * 10 })
      break
    }
    case 'flash': {
      if (p < 0.5) drawPrev({ brightness: 1 + p * 3 })
      else drawNext({ brightness: 1 + (1 - p) * 3 })
      ctx.save()
      ctx.globalAlpha = Math.pow(1 - Math.abs(2 * p - 1), 1.5)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
      break
    }
    case 'iris': {
      drawPrev({})
      const radius = Math.hypot(w, h) * 0.5 * easeInOut(p)
      drawNext({ clipPath: (c) => c.arc(w / 2, h / 2, Math.max(0.5, radius), 0, Math.PI * 2) })
      break
    }
    case 'doors': {
      drawNext({ scale: 0.92 + 0.08 * p })
      const e = easeInOut(p)
      drawPrev({ clip: { x: -(w / 2) * e, y: 0, width: w / 2, height: h }, translateX: -(w / 2) * e })
      drawPrev({ clip: { x: w / 2 + (w / 2) * e, y: 0, width: w / 2, height: h }, translateX: (w / 2) * e })
      break
    }
    case 'clock': {
      drawPrev({})
      const angle = Math.PI * 2 * p
      drawNext({
        clipPath: (c) => {
          const r = Math.hypot(w, h)
          c.moveTo(w / 2, h / 2)
          c.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.max(0.0001, angle))
          c.closePath()
        },
      })
      break
    }
    case 'glitch': {
      const intensity = 1 - Math.abs(2 * p - 1)
      const showNext = p >= 0.5
      const draw = showNext ? drawNext : drawPrev
      draw({})
      const f = Math.floor(p * 24)
      const slices = 7
      for (let i = 0; i < slices; i++) {
        if (hash01(f, i + 10) > 0.65 * intensity + 0.15) continue
        const y = hash01(f, i + 20) * h
        const sliceH = (0.02 + hash01(f, i + 30) * 0.09) * h
        const offset = (hash01(f, i + 40) - 0.5) * w * 0.18 * intensity
        draw({ clip: { x: 0, y, width: w, height: sliceH }, translateX: offset })
      }
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = 0.35 * intensity
      ctx.fillStyle = hash01(f, 99) > 0.5 ? '#ff00c8' : '#00f0ff'
      ctx.fillRect(0, hash01(f, 98) * h, w, h * 0.12)
      ctx.restore()
      break
    }
    default:
      drawNext({})
      break
  }
}

let scratch = null
function getScratch(w, h) {
  if (!scratch) scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas')
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w
    scratch.height = h
  }
  return scratch
}

/** Path of a blur region in project coordinates (current transform = project space). */
function blurRegionPath(ctx, item, pw, ph) {
  const tr = item.transform
  const w = Math.max(1, item.size.w * pw * tr.scale * (tr.scaleX ?? 1))
  const h = Math.max(1, item.size.h * ph * tr.scale * (tr.scaleY ?? 1))
  const cx = tr.x * pw
  const cy = tr.y * ph
  const rot = ((tr.rotation ?? 0) * Math.PI) / 180
  if (item.shape === 'ellipse') {
    ctx.ellipse(cx, cy, w / 2, h / 2, rot, 0, Math.PI * 2)
  } else {
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    const corners = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos])
    ctx.moveTo(corners[0][0], corners[0][1])
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1])
    ctx.closePath()
  }
}

/**
 * Blurs or pixelates what has been drawn so far inside (or, inverted,
 * outside) the region of a blur clip - for faces, number plates or a blurred
 * background behind the subject.
 */
function drawBlurLayer(ctx, layer, project, options) {
  const item = resolveItemAt(layer.item, layer.localTime ?? 0)
  const canvas = ctx.canvas
  if (!canvas || !item.size) return
  const { width: pw, height: ph } = project.settings
  const amount = Math.min(1, Math.max(0, item.amount ?? 0.5))
  const strength = item.opacity ?? 1
  if (amount <= 0 || strength <= 0) return
  ctx.save()
  ctx.beginPath()
  if (item.invert) ctx.rect(0, 0, pw, ph)
  blurRegionPath(ctx, item, pw, ph)
  ctx.clip(item.invert ? 'evenodd' : 'nonzero')
  ctx.globalAlpha = Math.min(1, strength)
  if (item.mode === 'pixelate') {
    const block = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * (0.008 + amount * 0.06)))
    const sw = Math.max(1, Math.round(canvas.width / block))
    const sh = Math.max(1, Math.round(canvas.height / block))
    const tmp = getScratch(sw, sh)
    const tctx = tmp.getContext('2d')
    if (tctx) {
      tctx.imageSmoothingEnabled = true
      tctx.clearRect(0, 0, sw, sh)
      tctx.drawImage(canvas, 0, 0, sw, sh)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, pw, ph)
    }
  } else {
    const radius = (2 + amount * 38) * options.scale * (Math.min(pw, ph) / 1080)
    ctx.filter = `blur(${radius}px)`
    // Drawing the canvas onto itself works on a copy of the current pixels.
    // Without inversion only the region's bounding box (plus the blur reach)
    // is processed - much cheaper on phones.
    if (item.invert) {
      ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, pw, ph)
    } else {
      const tr = item.transform
      const half = Math.hypot(item.size.w * pw * tr.scale * (tr.scaleX ?? 1), item.size.h * ph * tr.scale * (tr.scaleY ?? 1)) / 2
      const margin = radius / options.scale * 2
      const x0 = Math.max(0, tr.x * pw - half - margin)
      const y0 = Math.max(0, tr.y * ph - half - margin)
      const x1 = Math.min(pw, tr.x * pw + half + margin)
      const y1 = Math.min(ph, tr.y * ph + half + margin)
      const s = options.scale
      if (x1 > x0 && y1 > y0) ctx.drawImage(canvas, x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s, x0, y0, x1 - x0, y1 - y0)
    }
  }
  ctx.restore()
}

/** Draws a text or caption layer (optionally faded by a transition). */
function drawTextLayer(ctx, layer, project, modifier = {}) {
  const item = resolveItemAt(layer.item, layer.localTime ?? 0)
  const alpha = modifier.alpha ?? 1
  ctx.save()
  if (alpha < 1) ctx.globalAlpha = alpha
  if (item.blendMode && item.blendMode !== 'normal') ctx.globalCompositeOperation = item.blendMode
  if (modifier.translateX || modifier.translateY) ctx.translate(modifier.translateX ?? 0, modifier.translateY ?? 0)
  if (!drawCachedText(ctx, layer.item, item, project, layer.localTime ?? 0)) drawTextItem(ctx, item, project.settings, layer.localTime)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Text cache
//
// Outlines, shadows and glows are expensive to rasterise, and most text is
// static between its in and out animations. Such text is drawn once into a
// small bitmap and then blitted every frame - a big win with many titles or
// captions, especially on phones and in long exports.
// ---------------------------------------------------------------------------

const TEXT_CACHE_LIMIT = 48
/** @type {Map<string, { source: object, scale: number, epoch: number, canvas: any, w: number, h: number }>} */
const textCache = new Map()
let fontEpoch = 0
if (typeof document !== 'undefined' && document.fonts?.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => fontEpoch++)
}
/** Forget cached text bitmaps (e.g. after fonts were registered in a worker). */
export function invalidateTextCache() {
  fontEpoch++
  textCache.clear()
}

const STATIC_EFFECTS = new Set(['none', 'extrude', 'rgbSplit', undefined])

function isStaticText(item, local) {
  if (!STATIC_EFFECTS.has(item.style?.effect)) return false
  if (item.type === 'caption' && item.style?.highlight && item.style.highlight !== 'none') return false
  const enter = item.animation?.in
  const exit = item.animation?.out
  if (enter && enter.kind !== 'none' && local < enter.duration) return false
  if (exit && exit.kind !== 'none' && local > item.duration - exit.duration) return false
  return true
}

let textMeasureCtx = null
function measureCtx() {
  if (!textMeasureCtx) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')
    textMeasureCtx = c.getContext('2d')
  }
  return textMeasureCtx
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** @returns {boolean} whether the text was drawn from the cache */
function drawCachedText(ctx, source, item, project, local) {
  if (!isStaticText(item, local) || typeof ctx.getTransform !== 'function') return false
  const m = ctx.getTransform()
  const deviceScale = Math.hypot(m.a, m.b)
  const tr = item.transform
  const pixelScale = deviceScale * tr.scale
  if (!(pixelScale > 0)) return false

  let entry = textCache.get(source.id)
  const fresh = entry && entry.source === source && entry.epoch === fontEpoch && Math.abs(entry.scale - pixelScale) / pixelScale < 0.04
  if (!fresh) {
    const { width: pw, height: ph } = project.settings
    const flat = { ...item, transform: { ...tr, x: 0, y: 0, rotation: 0, scale: 1 }, opacity: 1 }
    const size = measureTextItem(measureCtx(), flat, project.settings)
    const r = resolveStyle(item.style, pw, ph)
    const reach =
      r.fontSize * 0.6 +
      r.strokeWidth * 2 +
      (item.style.stroke2?.width ?? 0) * r.fontSize * 2 +
      r.shadowBlur * 2 +
      Math.max(Math.abs(r.shadowOffsetX), Math.abs(r.shadowOffsetY)) +
      (item.style.effect === 'extrude' ? r.fontSize * 0.12 : 0) +
      (item.style.effect === 'rgbSplit' ? r.fontSize * 0.06 : 0)
    const w = Math.ceil((size.width + reach * 2) * pixelScale)
    const h = Math.ceil((size.height + reach * 2) * pixelScale)
    if (w < 1 || h < 1 || w * h > 16_000_000) return false
    const canvas = entry?.canvas && entry.canvas.width >= w && entry.canvas.height >= h && entry.canvas.width < w * 1.5 ? entry.canvas : makeCanvas(w, h)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const c = canvas.getContext('2d')
    if (!c) return false
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, w, h)
    c.setTransform(pixelScale, 0, 0, pixelScale, w / 2, h / 2)
    drawTextItem(c, flat, project.settings, local)
    entry = { source, scale: pixelScale, epoch: fontEpoch, canvas, w, h }
    textCache.delete(source.id)
    textCache.set(source.id, entry)
    while (textCache.size > TEXT_CACHE_LIMIT) textCache.delete(textCache.keys().next().value)
  } else {
    // Refresh LRU position.
    textCache.delete(source.id)
    textCache.set(source.id, entry)
  }

  const { width: pw, height: ph } = project.settings
  ctx.translate(tr.x * pw, tr.y * ph)
  if (tr.rotation) ctx.rotate((tr.rotation * Math.PI) / 180)
  ctx.globalAlpha *= Math.min(1, Math.max(0, item.opacity))
  // One cache pixel equals 1/deviceScale project units.
  ctx.drawImage(entry.canvas, 0, 0, entry.w, entry.h, -entry.w / (2 * deviceScale), -entry.h / (2 * deviceScale), entry.w / deviceScale, entry.h / deviceScale)
  return true
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
  ctx.imageSmoothingQuality = options.smoothing ?? 'high'
  drawBackground(ctx, project, project.settings.background, layers, provider, options.scale)

  for (const layer of layers) {
    layer.localTime = time - layer.item.start
    if (layer.transition) {
      drawTransition(ctx, layer, provider, project, options, report)
      continue
    }
    if (layer.item.type === 'blur') {
      drawBlurLayer(ctx, layer, project, options)
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
