/**
 * Built-in stickers and shapes. They are drawn into a PNG on demand and then
 * imported like any other photo, so they can be moved, scaled, rotated,
 * keyframed and exported without special handling.
 */

const EMOJI = ['😂', '🔥', '❤️', '👍', '😮', '💯', '✨', '🎉', '👀', '🤯', '😎', '🙏', '💀', '😭', '🥳', '⭐', '✅', '❌', '⚡', '💥', '👉', '👇', '🤔', '😍', '🚀', '💰', '🎵', '📌']

/** @typedef {{ id: string, label: string, kind: 'emoji' | 'shape', value?: string, draw?: (c: CanvasRenderingContext2D, s: number) => void }} StickerDef */

function roundRect(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

function star(c, cx, cy, outer, inner, points = 5) {
  c.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI * i) / points - Math.PI / 2
    c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
  }
  c.closePath()
}

/** @type {StickerDef[]} */
export const SHAPES = [
  {
    id: 'arrow',
    label: 'Arrow',
    draw: (c, s) => {
      c.fillStyle = '#ff3b3b'
      c.strokeStyle = '#ffffff'
      c.lineWidth = s * 0.03
      c.beginPath()
      c.moveTo(s * 0.08, s * 0.4)
      c.lineTo(s * 0.6, s * 0.4)
      c.lineTo(s * 0.6, s * 0.22)
      c.lineTo(s * 0.92, s * 0.5)
      c.lineTo(s * 0.6, s * 0.78)
      c.lineTo(s * 0.6, s * 0.6)
      c.lineTo(s * 0.08, s * 0.6)
      c.closePath()
      c.fill()
      c.stroke()
    },
  },
  {
    id: 'circle',
    label: 'Circle',
    draw: (c, s) => {
      c.strokeStyle = '#ff3b3b'
      c.lineWidth = s * 0.06
      c.beginPath()
      c.ellipse(s / 2, s / 2, s * 0.42, s * 0.34, -0.15, 0, Math.PI * 2)
      c.stroke()
    },
  },
  {
    id: 'box',
    label: 'Frame',
    draw: (c, s) => {
      c.strokeStyle = '#ffe14d'
      c.lineWidth = s * 0.05
      roundRect(c, s * 0.08, s * 0.2, s * 0.84, s * 0.6, s * 0.05)
      c.stroke()
    },
  },
  {
    id: 'heart',
    label: 'Heart',
    draw: (c, s) => {
      c.fillStyle = '#ff2d55'
      c.beginPath()
      c.moveTo(s / 2, s * 0.85)
      c.bezierCurveTo(s * 0.05, s * 0.55, s * 0.12, s * 0.12, s / 2, s * 0.3)
      c.bezierCurveTo(s * 0.88, s * 0.12, s * 0.95, s * 0.55, s / 2, s * 0.85)
      c.fill()
    },
  },
  {
    id: 'star',
    label: 'Star',
    draw: (c, s) => {
      c.fillStyle = '#ffd60a'
      c.strokeStyle = '#7a4a00'
      c.lineWidth = s * 0.025
      star(c, s / 2, s / 2, s * 0.44, s * 0.19)
      c.fill()
      c.stroke()
    },
  },
  {
    id: 'burst',
    label: 'Burst',
    draw: (c, s) => {
      c.fillStyle = '#ff7a00'
      star(c, s / 2, s / 2, s * 0.47, s * 0.33, 14)
      c.fill()
      c.fillStyle = '#ffffff'
      c.font = `900 ${s * 0.17}px Impact, "Arial Black", sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('WOW!', s / 2, s / 2)
    },
  },
  {
    id: 'bubble',
    label: 'Speech',
    draw: (c, s) => {
      c.fillStyle = '#ffffff'
      c.strokeStyle = '#111111'
      c.lineWidth = s * 0.025
      roundRect(c, s * 0.06, s * 0.12, s * 0.88, s * 0.55, s * 0.12)
      c.fill()
      c.stroke()
      c.beginPath()
      c.moveTo(s * 0.3, s * 0.66)
      c.lineTo(s * 0.22, s * 0.88)
      c.lineTo(s * 0.45, s * 0.66)
      c.closePath()
      c.fill()
      c.stroke()
      c.fillStyle = '#ffffff'
      c.fillRect(s * 0.28, s * 0.64, s * 0.18, s * 0.04)
    },
  },
  {
    id: 'subscribe',
    label: 'Subscribe',
    draw: (c, s) => {
      c.fillStyle = '#ff0033'
      roundRect(c, s * 0.04, s * 0.34, s * 0.92, s * 0.32, s * 0.06)
      c.fill()
      c.fillStyle = '#ffffff'
      c.font = `800 ${s * 0.11}px Inter, Arial, sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('SUBSCRIBE', s / 2, s / 2 + s * 0.005)
    },
  },
  {
    id: 'like',
    label: 'Like',
    draw: (c, s) => {
      c.fillStyle = '#1d9bf0'
      c.beginPath()
      c.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2)
      c.fill()
      c.font = `${s * 0.42}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('👍', s / 2, s / 2 + s * 0.02)
    },
  },
  {
    id: 'new',
    label: 'NEW',
    draw: (c, s) => {
      c.fillStyle = '#ffe14d'
      c.save()
      c.translate(s / 2, s / 2)
      c.rotate(-0.15)
      roundRect(c, -s * 0.38, -s * 0.15, s * 0.76, s * 0.3, s * 0.04)
      c.fill()
      c.fillStyle = '#111111'
      c.font = `900 ${s * 0.2}px Impact, "Arial Black", sans-serif`
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('NEW', 0, s * 0.01)
      c.restore()
    },
  },
  {
    id: 'underline',
    label: 'Swoosh',
    draw: (c, s) => {
      c.strokeStyle = '#ffe14d'
      c.lineCap = 'round'
      c.lineWidth = s * 0.06
      c.beginPath()
      c.moveTo(s * 0.08, s * 0.6)
      c.quadraticCurveTo(s * 0.5, s * 0.38, s * 0.92, s * 0.52)
      c.stroke()
    },
  },
  {
    id: 'bar',
    label: 'Bar',
    draw: (c, s) => {
      c.fillStyle = 'rgba(0,0,0,0.65)'
      roundRect(c, 0, s * 0.38, s, s * 0.24, s * 0.03)
      c.fill()
    },
  },
]

/** @type {StickerDef[]} */
export const EMOJI_STICKERS = EMOJI.map((value) => ({ id: `emoji-${value}`, label: value, kind: 'emoji', value }))

/**
 * Draws a sticker into a transparent PNG.
 * @param {StickerDef} def
 * @returns {Promise<File>}
 */
export async function renderSticker(def, size = 512) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')
  if (!c) throw new Error('Canvas is not available')
  if (def.value) {
    c.font = `${size * 0.8}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(def.value, size / 2, size * 0.54)
  } else {
    def.draw?.(c, size)
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Could not create the sticker')
  const name = def.value ? `Sticker ${def.value}.png` : `${def.label}.png`
  return new File([blob], name, { type: 'image/png', lastModified: Date.now() })
}
