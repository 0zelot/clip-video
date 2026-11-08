/**
 * Text and caption renderer.
 *
 * Draws text items and TikTok/Shorts style captions (with per-word
 * highlighting) onto any 2D context. Everything is expressed in canvas pixels
 * derived from normalized style values, so the same code produces identical
 * results in the preview and in a 4K export.
 */
import { fontStack } from '../model/defaults'

const EASE_OUT = (p) => 1 - Math.pow(1 - p, 3)
const EASE_OUT_BACK = (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2)

function hash01(a, b = 0) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v))
}

/** Converts a hex/named colour and an opacity into a canvas fill style. */
function withAlpha(color, opacity) {
  if (opacity >= 1) return color
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color ?? '')
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    const r = parseInt(raw.slice(0, 2), 16)
    const g = parseInt(raw.slice(2, 4), 16)
    const b = parseInt(raw.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${clamp01(opacity)})`
  }
  return color
}

/** Style values resolved to canvas pixels. */
export function resolveStyle(style, canvasW, canvasH) {
  const fontSize = Math.max(6, style.fontSize * canvasH)
  return {
    fontSize,
    font: `${style.italic ? 'italic ' : ''}${style.fontWeight} ${fontSize}px ${fontStack(style.fontFamily)}`,
    lineHeight: fontSize * style.lineHeight,
    letterSpacing: style.letterSpacing * fontSize,
    maxWidth: Math.max(fontSize, style.maxWidth * canvasW),
    strokeWidth: style.stroke.width * fontSize,
    padding: style.background.padding * fontSize,
    radius: style.background.radius * fontSize,
    shadowBlur: style.shadow.blur * fontSize,
    shadowOffsetX: style.shadow.offsetX * fontSize,
    shadowOffsetY: style.shadow.offsetY * fontSize,
  }
}

function applyFont(ctx, resolved) {
  ctx.font = resolved.font
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${resolved.letterSpacing}px`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

/**
 * Splits the item into tokens. Captions keep their per-word timings so the
 * active word can be highlighted.
 * @returns {{ text: string, start?: number, end?: number }[]}
 */
function tokensOf(item) {
  if (item.type === 'caption' && item.words.length > 0) return item.words
  return item.text.split(/\s+/).filter(Boolean).map((text) => ({ text }))
}

/**
 * Lays the text out into lines of positioned words.
 *
 * @returns {{ lines: { words: { token: object, text: string, x: number, width: number, index: number }[], width: number }[],
 *   width: number, height: number, resolved: object }}
 */
export function layoutText(ctx, item, canvasW, canvasH) {
  const style = item.style
  const resolved = resolveStyle(style, canvasW, canvasH)
  applyFont(ctx, resolved)

  const spaceWidth = ctx.measureText(' ').width
  const lines = []
  let current = { words: [], width: 0 }
  let index = 0

  for (const token of tokensOf(item)) {
    const text = style.uppercase ? token.text.toUpperCase() : token.text
    const width = ctx.measureText(text).width
    const addedWidth = current.words.length === 0 ? width : current.width + spaceWidth + width
    if (current.words.length > 0 && addedWidth > resolved.maxWidth) {
      lines.push(current)
      current = { words: [], width: 0 }
    }
    const x = current.words.length === 0 ? 0 : current.width + spaceWidth
    current.words.push({ token, text, x, width, index })
    current.width = x + width
    index++
  }
  if (current.words.length > 0) lines.push(current)

  const width = lines.reduce((max, line) => Math.max(max, line.width), 0)
  const height = lines.length * resolved.lineHeight
  return { lines, width, height, resolved }
}

/** Index of the word being spoken at `localTime`, or -1. */
export function activeWordIndex(item, localTime) {
  if (item.type !== 'caption') return -1
  for (let i = 0; i < item.words.length; i++) {
    const w = item.words[i]
    if (localTime >= w.start && localTime < w.end) return i
  }
  // Between words: keep the previous one highlighted so nothing flickers.
  let last = -1
  for (let i = 0; i < item.words.length; i++) if (item.words[i].start <= localTime) last = i
  return last
}

/**
 * Enter/exit animation state at a given item-local time.
 * @returns {{ alpha: number, scale: number, offsetX: number, offsetY: number, reveal: number }}
 */
export function animationState(item, localTime, canvasH) {
  const state = { alpha: 1, scale: 1, offsetX: 0, offsetY: 0, reveal: 1, rotation: 0, blur: 0, wave: 1 }
  const apply = (step, progress, direction) => {
    if (!step || step.kind === 'none' || step.duration <= 0) return
    const p = clamp01(progress)
    switch (step.kind) {
      case 'fade':
        state.alpha *= p
        break
      case 'pop':
        state.alpha *= clamp01(p * 1.8)
        state.scale *= 0.7 + 0.3 * EASE_OUT_BACK(p)
        break
      case 'zoom':
        state.alpha *= clamp01(p * 1.5)
        state.scale *= 1.8 - 0.8 * EASE_OUT(p)
        break
      case 'slide':
        state.alpha *= clamp01(p * 1.6)
        state.offsetY += direction * (1 - EASE_OUT(p)) * canvasH * 0.08
        break
      case 'bounce': {
        state.alpha *= clamp01(p * 2)
        const damped = Math.exp(-4 * p) * Math.cos(10 * p)
        state.scale *= 1 + (p >= 1 ? 0 : damped * 0.25)
        break
      }
      case 'typewriter':
        state.reveal = Math.min(state.reveal, p)
        break
      case 'slideLeft':
        state.alpha *= clamp01(p * 1.6)
        state.offsetX += -direction * (1 - EASE_OUT(p)) * canvasH * 0.12
        break
      case 'rise':
        state.alpha *= clamp01(p * 1.4)
        state.offsetY += direction * (1 - EASE_OUT(p)) * canvasH * 0.035
        state.scale *= 0.92 + 0.08 * EASE_OUT(p)
        break
      case 'drop':
        state.alpha *= clamp01(p * 2)
        state.offsetY -= direction * (1 - EASE_OUT_BACK(p)) * canvasH * 0.12
        break
      case 'blur':
        state.alpha *= clamp01(p * 1.2)
        state.blur = Math.max(state.blur, (1 - EASE_OUT(p)) * canvasH * 0.02)
        state.scale *= 1.08 - 0.08 * EASE_OUT(p)
        break
      case 'spin':
        state.alpha *= clamp01(p * 1.5)
        state.rotation += direction * (1 - EASE_OUT(p)) * -Math.PI
        state.scale *= 0.3 + 0.7 * EASE_OUT(p)
        break
      case 'wave':
        state.wave = Math.min(state.wave, p)
        break
      default:
        break
    }
  }

  const { in: enter, out: exit } = item.animation ?? {}
  if (enter && localTime < enter.duration) apply(enter, localTime / enter.duration, 1)
  const outStart = item.duration - (exit?.duration ?? 0)
  if (exit && exit.duration > 0 && localTime > outStart) apply(exit, (item.duration - localTime) / exit.duration, -1)
  return state
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/**
 * Draws a text or caption item.
 *
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
 * @param {import('../model/types').TextItem | import('../model/types').CaptionItem} item
 * @param {{ width: number, height: number }} canvas project canvas size
 * @param {number} localTime seconds since the item started
 */
export function drawTextItem(ctx, item, canvas, localTime) {
  const style = item.style
  const layout = layoutText(ctx, item, canvas.width, canvas.height)
  const { resolved, lines } = layout
  if (lines.length === 0) return

  const anim = animationState(item, localTime, canvas.height)
  const active = activeWordIndex(item, localTime)
  const totalChars = lines.reduce((n, line) => n + line.words.reduce((m, w) => m + w.text.length + 1, 0), 0)
  const revealChars = Math.ceil(totalChars * anim.reveal)

  const cx = item.transform.x * canvas.width
  const cy = item.transform.y * canvas.height

  ctx.save()
  ctx.globalAlpha = clamp01(item.opacity * style.opacity * anim.alpha)
  ctx.translate(cx + anim.offsetX, cy + anim.offsetY)
  if (item.transform.rotation) ctx.rotate((item.transform.rotation * Math.PI) / 180)
  if (anim.rotation) ctx.rotate(anim.rotation)
  if (anim.blur > 0.3) {
    // Filters work in device pixels, so scale the blur with the current transform.
    const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
    const pixelScale = m ? Math.hypot(m.a, m.b) : 1
    ctx.filter = `blur(${anim.blur * pixelScale}px)`
  }
  const scale = anim.scale * item.transform.scale
  if (scale !== 1) ctx.scale(scale, scale)
  applyFont(ctx, resolved)

  const blockTop = -layout.height / 2
  let charsDrawn = 0
  const wordCount = lines.reduce((n, line) => n + line.words.length, 0)
  const highlight = item.type === 'caption' ? style.highlight : 'none'

  lines.forEach((line, lineIndex) => {
    const lineLeft = style.align === 'left' ? -layout.width / 2 : style.align === 'right' ? layout.width / 2 - line.width : -line.width / 2
    const baseline = blockTop + lineIndex * resolved.lineHeight + resolved.lineHeight * 0.78

    // background box behind the whole line
    if (style.background.opacity > 0) {
      ctx.save()
      ctx.fillStyle = withAlpha(style.background.color, style.background.opacity)
      roundRect(
        ctx,
        lineLeft - resolved.padding,
        blockTop + lineIndex * resolved.lineHeight + resolved.lineHeight * 0.08,
        line.width + resolved.padding * 2,
        resolved.lineHeight * 0.96,
        resolved.radius,
      )
      ctx.fill()
      ctx.restore()
    }

    for (const word of line.words) {
      const isActive = item.type === 'caption' && word.index === active && highlight && highlight !== 'none'
      // "Reveal" shows the words one by one as they are spoken.
      if (highlight === 'reveal' && active >= 0 && word.index > active) continue
      let wordAlpha = 1
      let waveOffset = 0
      if (anim.wave < 1) {
        const stagger = wordCount > 1 ? (word.index / (wordCount - 1)) * 0.6 : 0
        const wp = clamp01((anim.wave - stagger) / 0.4)
        if (wp <= 0) continue
        wordAlpha = wp
        waveOffset = (1 - EASE_OUT_BACK(wp)) * resolved.fontSize * 0.7
      }
      let text = word.text
      if (anim.reveal < 1) {
        const remaining = revealChars - charsDrawn
        if (remaining <= 0) {
          charsDrawn += text.length + 1
          continue
        }
        if (remaining < text.length) text = text.slice(0, remaining)
      }
      charsDrawn += word.text.length + 1

      ctx.save()
      if (wordAlpha < 1) ctx.globalAlpha *= wordAlpha
      let wordScale = 1
      let wordOffsetY = waveOffset
      if (isActive) {
        const w = item.words[word.index]
        const progress = w && w.end > w.start ? clamp01((localTime - w.start) / Math.min(0.18, w.end - w.start)) : 1
        if (style.highlight === 'scale') wordScale = style.activeScale
        if (style.highlight === 'pop') wordScale = 1 + (style.activeScale - 1) * EASE_OUT_BACK(progress)
        if (style.highlight === 'bounce') {
          wordScale = 1 + (style.activeScale - 1) * Math.exp(-5 * progress) * Math.cos(9 * progress)
          wordOffsetY += -resolved.fontSize * 0.08 * Math.exp(-5 * progress) * Math.cos(9 * progress)
        }
        if (style.highlight === 'reveal') wordScale = 1 + (style.activeScale - 1) * (1 - EASE_OUT(progress)) * 0.6
      }

      // Looping text effects (wavy, shake, glitch jumps, flicker).
      const effect = style.effect ?? 'none'
      const frame = Math.floor(localTime * 15)
      let effectX = 0
      if (effect === 'wavy') wordOffsetY += Math.sin(localTime * 5 + word.index * 0.9) * resolved.fontSize * 0.12
      if (effect === 'shake') {
        effectX += (hash01(frame, word.index * 3 + 1) - 0.5) * resolved.fontSize * 0.08
        wordOffsetY += (hash01(frame, word.index * 3 + 2) - 0.5) * resolved.fontSize * 0.08
      }
      if (effect === 'glitch' && hash01(frame, word.index + 50) > 0.82) effectX += (hash01(frame, word.index + 60) - 0.5) * resolved.fontSize * 0.5
      if (effect === 'flicker' && hash01(Math.floor(localTime * 10), 70) > 0.8) ctx.globalAlpha *= 0.35

      const wordCenterX = lineLeft + word.x + word.width / 2 + effectX
      ctx.translate(wordCenterX, baseline + wordOffsetY)
      if (wordScale !== 1) ctx.scale(wordScale, wordScale)
      const drawX = -word.width / 2

      // highlight box behind the active word
      if (isActive && style.highlight === 'box') {
        ctx.save()
        ctx.fillStyle = withAlpha(style.activeBackground, 1)
        roundRect(
          ctx,
          drawX - resolved.padding * 0.5,
          -resolved.fontSize * 0.85,
          word.width + resolved.padding,
          resolved.fontSize * 1.16,
          resolved.radius * 0.7,
        )
        ctx.fill()
        ctx.restore()
      }

      // 3D extrusion: stacked copies in the shadow colour
      if (effect === 'extrude') {
        ctx.save()
        ctx.fillStyle = style.shadow.color
        const depth = Math.max(2, Math.round(resolved.fontSize * 0.09))
        for (let d = depth; d > 0; d--) ctx.fillText(text, drawX + d * 0.7, d * 0.7)
        ctx.restore()
      }
      // RGB split / glitch ghosts
      if (effect === 'rgbSplit' || effect === 'glitch') {
        const shift = resolved.fontSize * (effect === 'glitch' ? 0.03 + hash01(frame, 80) * 0.05 : 0.045)
        ctx.save()
        ctx.globalAlpha *= 0.85
        ctx.fillStyle = '#00e5ff'
        ctx.fillText(text, drawX - shift, 0)
        ctx.fillStyle = '#ff2bd6'
        ctx.fillText(text, drawX + shift, 0)
        ctx.restore()
      }
      // second, outer outline
      if (style.stroke2?.width > 0) {
        ctx.save()
        ctx.lineJoin = 'round'
        ctx.lineWidth = (resolved.strokeWidth + style.stroke2.width * resolved.fontSize) * 2
        ctx.strokeStyle = style.stroke2.color
        ctx.strokeText(text, drawX, 0)
        ctx.restore()
      }

      // underline under the active word
      if (isActive && style.highlight === 'underline') {
        ctx.save()
        ctx.fillStyle = style.activeColor
        roundRect(ctx, drawX, resolved.fontSize * 0.12, word.width, Math.max(2, resolved.fontSize * 0.12), resolved.fontSize * 0.06)
        ctx.fill()
        ctx.restore()
      }

      // stroke first, so the fill stays crisp
      const outlineOnly = !!style.outlineOnly
      const strokeWidth = outlineOnly ? Math.max(resolved.strokeWidth, resolved.fontSize * 0.03) : resolved.strokeWidth
      if (strokeWidth > 0) {
        ctx.save()
        ctx.lineJoin = 'round'
        ctx.miterLimit = 2
        ctx.lineWidth = outlineOnly ? strokeWidth : strokeWidth * 2
        ctx.strokeStyle = outlineOnly && isActive && highlight !== 'box' ? style.activeColor : style.stroke.color
        if (outlineOnly && style.shadow.opacity > 0 && resolved.shadowBlur > 0) {
          ctx.shadowColor = withAlpha(style.shadow.color, style.shadow.opacity)
          ctx.shadowBlur = resolved.shadowBlur
        }
        ctx.strokeText(text, drawX, 0)
        ctx.restore()
      }
      if (outlineOnly) {
        ctx.restore()
        continue
      }

      if (style.shadow.opacity > 0 && (resolved.shadowBlur > 0 || resolved.shadowOffsetX || resolved.shadowOffsetY)) {
        ctx.shadowColor = withAlpha(style.shadow.color, style.shadow.opacity)
        ctx.shadowBlur = resolved.shadowBlur
        ctx.shadowOffsetX = resolved.shadowOffsetX
        ctx.shadowOffsetY = resolved.shadowOffsetY
      }
      if (isActive && style.highlight === 'glow') {
        ctx.shadowColor = style.activeColor
        ctx.shadowBlur = resolved.fontSize * 0.6
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
      }
      const activeFill = isActive && ['color', 'pop', 'bounce', 'scale', 'underline', 'reveal'].includes(style.highlight)
      if (activeFill) {
        ctx.fillStyle = style.activeColor
      } else if (effect === 'rainbow') {
        ctx.fillStyle = `hsl(${Math.round((localTime * 140 + word.index * 45) % 360)}, 95%, 62%)`
      } else if (style.gradientColor) {
        const gradient = ctx.createLinearGradient(0, -resolved.fontSize * 0.8, 0, resolved.fontSize * 0.15)
        gradient.addColorStop(0, style.color)
        gradient.addColorStop(1, style.gradientColor)
        ctx.fillStyle = gradient
      } else {
        ctx.fillStyle = style.color
      }
      ctx.fillText(text, drawX, 0)
      ctx.restore()
    }
  })

  ctx.restore()
}

/**
 * Bounding box of a text item in canvas pixels - used by the preview overlay
 * for selection handles and hit testing.
 */
export function measureTextItem(ctx, item, canvas) {
  const layout = layoutText(ctx, item, canvas.width, canvas.height)
  const scale = item.transform.scale
  const width = (layout.width + layout.resolved.padding * 2) * scale
  const height = layout.height * scale
  return {
    width,
    height,
    cx: item.transform.x * canvas.width,
    cy: item.transform.y * canvas.height,
  }
}
