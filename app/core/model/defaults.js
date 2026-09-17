import { PROJECT_SCHEMA_VERSION } from './types'

/** @returns {import('./types').Id} */
export function createId() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // Non-secure contexts (e.g. dev server over LAN) have no randomUUID.
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * @typedef {object} FormatPreset
 * @property {string} id
 * @property {string} label
 * @property {string} description
 * @property {number} width
 * @property {number} height
 */

/** @type {FormatPreset[]} */
export const FORMAT_PRESETS = [
  { id: '9:16', label: '9:16', description: 'TikTok · Shorts · Reels', width: 1080, height: 1920 },
  { id: '16:9', label: '16:9', description: 'YouTube', width: 1920, height: 1080 },
  { id: '1:1', label: '1:1', description: 'Square', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5', description: 'Instagram', width: 1080, height: 1350 },
]

export const FPS_OPTIONS = [24, 25, 30, 50, 60]

export const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4]

export const DEFAULT_IMAGE_DURATION = 3
export const DEFAULT_TEXT_DURATION = 3
export const MIN_ITEM_DURATION = 1 / 30

/** Fonts that are available everywhere without downloading anything. */
export const SYSTEM_FONTS = [
  { id: 'Inter', label: 'Inter / system', stack: 'Inter, system-ui, "Segoe UI", Roboto, sans-serif' },
  { id: 'Impact', label: 'Impact', stack: 'Impact, "Haettenschweiler", "Arial Narrow Bold", sans-serif' },
  { id: 'Arial Black', label: 'Arial Black', stack: '"Arial Black", "Arial Bold", Gadget, sans-serif' },
  { id: 'Georgia', label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'Courier New', label: 'Courier', stack: '"Courier New", Courier, monospace' },
  { id: 'Comic Sans MS', label: 'Comic Sans', stack: '"Comic Sans MS", "Comic Sans", cursive' },
  { id: 'Trebuchet MS', label: 'Trebuchet', stack: '"Trebuchet MS", Tahoma, sans-serif' },
  { id: 'Verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
]

/** Resolves a font family name to a CSS font stack (custom fonts pass through). */
export function fontStack(family) {
  return SYSTEM_FONTS.find((f) => f.id === family)?.stack ?? `"${family}", Inter, system-ui, sans-serif`
}

/** @returns {FormatPreset | undefined} */
export function findFormatPreset(width, height) {
  return FORMAT_PRESETS.find((p) => p.width === width && p.height === height)
}

/**
 * @param {Partial<import('./types').ProjectSettings>} [overrides]
 * @returns {import('./types').ProjectSettings}
 */
export function defaultSettings(overrides = {}) {
  return {
    width: 1080,
    height: 1920,
    fps: 30,
    background: { kind: 'color', color: '#000000' },
    ...overrides,
  }
}

/**
 * @param {import('./types').TrackKind} kind
 * @param {string} name
 * @returns {import('./types').Track}
 */
export function createTrack(kind, name) {
  return { id: createId(), kind, name, hidden: false, muted: false, locked: false, items: [] }
}

/**
 * @param {string} name
 * @param {Partial<import('./types').ProjectSettings>} [settings]
 * @returns {import('./types').Project}
 */
export function createProject(name, settings = {}) {
  const now = Date.now()
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    settings: defaultSettings(settings),
    assets: {},
    tracks: [createTrack('visual', 'Video 1'), createTrack('audio', 'Audio 1')],
    savedTextStyles: [],
    savedCaptionStyles: [],
  }
}

/** @returns {import('./types').Transform} */
export function defaultTransform() {
  return { x: 0.5, y: 0.5, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, flipH: false, flipV: false }
}

/** @returns {import('./types').Crop} */
export function defaultCrop() {
  return { top: 0, right: 0, bottom: 0, left: 0 }
}

/** @returns {import('./types').EffectParams} */
export function neutralEffects() {
  return {
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    blur: 0,
    grayscale: 0,
    sepia: 0,
    invert: 0,
    vignette: 0,
  }
}

/** @returns {import('./types').AudioProps} */
export function defaultAudio() {
  return { volume: 1, muted: false, fadeIn: 0, fadeOut: 0, pitch: 0 }
}

// ---------------------------------------------------------------------------
// Filters (combinations of the basic effect parameters)
// ---------------------------------------------------------------------------

/** @type {{ id: string, label: string, effects: Partial<import('./types').EffectParams> }[]} */
export const FILTER_PRESETS = [
  { id: 'none', label: 'Natural', effects: {} },
  { id: 'warm', label: 'Warm', effects: { saturation: 1.2, hue: -8, brightness: 1.05, contrast: 1.05 } },
  { id: 'cold', label: 'Cold', effects: { saturation: 1.1, hue: 12, brightness: 1.02, contrast: 1.08 } },
  { id: 'bw', label: 'B&W', effects: { grayscale: 1, contrast: 1.15 } },
  { id: 'vintage', label: 'Vintage', effects: { sepia: 0.45, saturation: 0.85, contrast: 0.95, vignette: 0.35 } },
  { id: 'cinematic', label: 'Cinematic', effects: { contrast: 1.2, saturation: 0.9, brightness: 0.97, vignette: 0.25 } },
  { id: 'punch', label: 'High contrast', effects: { contrast: 1.4, saturation: 1.25 } },
  { id: 'dream', label: 'Dreamy', effects: { brightness: 1.12, saturation: 1.1, blur: 1.5 } },
]

export function applyFilterPreset(id) {
  const preset = FILTER_PRESETS.find((f) => f.id === id)
  return { ...neutralEffects(), ...(preset?.effects ?? {}) }
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** @type {{ id: import('./types').TransitionKind, label: string, needsDirection?: boolean }[]} */
export const TRANSITIONS = [
  { id: 'none', label: 'Cut' },
  { id: 'fade', label: 'Fade' },
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'dipBlack', label: 'Dip to black' },
  { id: 'dipWhite', label: 'Dip to white' },
  { id: 'slide', label: 'Slide', needsDirection: true },
  { id: 'wipe', label: 'Wipe', needsDirection: true },
  { id: 'zoom', label: 'Zoom' },
]

export const DEFAULT_TRANSITION_DURATION = 0.5

// ---------------------------------------------------------------------------
// Text & captions
// ---------------------------------------------------------------------------

/** @returns {import('./types').TextStyle} */
export function defaultTextStyle(overrides = {}) {
  return {
    fontFamily: 'Inter',
    fontWeight: 700,
    italic: false,
    fontSize: 0.055,
    color: '#ffffff',
    opacity: 1,
    align: 'center',
    lineHeight: 1.2,
    letterSpacing: 0,
    maxWidth: 0.86,
    uppercase: false,
    stroke: { color: '#000000', width: 0 },
    shadow: { color: '#000000', blur: 0.25, offsetX: 0, offsetY: 0.06, opacity: 0.55 },
    background: { color: '#000000', opacity: 0, padding: 0.35, radius: 0.3 },
    ...overrides,
  }
}

/** @returns {import('./types').CaptionStyle} */
export function defaultCaptionStyle(overrides = {}) {
  return {
    ...defaultTextStyle({
      fontFamily: 'Inter',
      fontWeight: 800,
      fontSize: 0.052,
      uppercase: true,
      maxWidth: 0.82,
      stroke: { color: '#000000', width: 0.12 },
      shadow: { color: '#000000', blur: 0.2, offsetX: 0, offsetY: 0.04, opacity: 0.6 },
    }),
    highlight: 'color',
    activeColor: '#2ee6d6',
    activeBackground: '#2ee6d6',
    activeScale: 1.14,
    ...overrides,
  }
}

/** @returns {import('./types').TextAnimation} */
export function defaultTextAnimation(overrides = {}) {
  return { in: { kind: 'fade', duration: 0.3 }, out: { kind: 'fade', duration: 0.3 }, ...overrides }
}

/** Ready-made text looks offered in the properties panel. */
export const TEXT_PRESETS = [
  {
    id: 'clean',
    label: 'Clean',
    style: defaultTextStyle(),
    animation: defaultTextAnimation(),
  },
  {
    id: 'bold-outline',
    label: 'Bold outline',
    style: defaultTextStyle({
      fontWeight: 900,
      fontSize: 0.07,
      uppercase: true,
      stroke: { color: '#000000', width: 0.14 },
      shadow: { color: '#000000', blur: 0.1, offsetX: 0, offsetY: 0.05, opacity: 0.8 },
    }),
    animation: defaultTextAnimation({ in: { kind: 'pop', duration: 0.35 } }),
  },
  {
    id: 'box',
    label: 'Boxed',
    style: defaultTextStyle({
      color: '#0a0a0f',
      background: { color: '#ffffff', opacity: 1, padding: 0.4, radius: 0.35 },
      shadow: { color: '#000000', blur: 0.3, offsetX: 0, offsetY: 0.08, opacity: 0.35 },
    }),
    animation: defaultTextAnimation({ in: { kind: 'slide', duration: 0.35 } }),
  },
  {
    id: 'neon',
    label: 'Neon',
    style: defaultTextStyle({
      color: '#2ee6d6',
      fontWeight: 800,
      uppercase: true,
      stroke: { color: '#03201d', width: 0.08 },
      shadow: { color: '#2ee6d6', blur: 0.7, offsetX: 0, offsetY: 0, opacity: 0.9 },
    }),
    animation: defaultTextAnimation({ in: { kind: 'zoom', duration: 0.3 } }),
  },
  {
    id: 'subtitle',
    label: 'Subtitle',
    style: defaultTextStyle({
      fontSize: 0.042,
      fontWeight: 600,
      background: { color: '#000000', opacity: 0.6, padding: 0.35, radius: 0.2 },
      shadow: { color: '#000000', blur: 0, offsetX: 0, offsetY: 0, opacity: 0 },
    }),
    animation: defaultTextAnimation({ in: { kind: 'none', duration: 0 }, out: { kind: 'none', duration: 0 } }),
  },
]

/** Ready-made caption looks (TikTok / Shorts style). */
export const CAPTION_PRESETS = [
  {
    id: 'highlight',
    label: 'Word pop',
    style: defaultCaptionStyle(),
    animation: defaultTextAnimation({ in: { kind: 'pop', duration: 0.18 }, out: { kind: 'none', duration: 0 } }),
    position: { x: 0.5, y: 0.78 },
  },
  {
    id: 'karaoke',
    label: 'Karaoke box',
    style: defaultCaptionStyle({
      highlight: 'box',
      color: '#ffffff',
      activeBackground: '#ff3b5c',
      stroke: { color: '#000000', width: 0.08 },
      background: { color: '#000000', opacity: 0.35, padding: 0.3, radius: 0.25 },
    }),
    animation: defaultTextAnimation({ in: { kind: 'fade', duration: 0.15 }, out: { kind: 'none', duration: 0 } }),
    position: { x: 0.5, y: 0.8 },
  },
  {
    id: 'bounce',
    label: 'Bounce',
    style: defaultCaptionStyle({
      highlight: 'bounce',
      fontWeight: 900,
      fontSize: 0.06,
      activeColor: '#ffe14d',
      stroke: { color: '#000000', width: 0.16 },
    }),
    animation: defaultTextAnimation({ in: { kind: 'bounce', duration: 0.25 }, out: { kind: 'none', duration: 0 } }),
    position: { x: 0.5, y: 0.72 },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    style: defaultCaptionStyle({
      highlight: 'none',
      uppercase: false,
      fontWeight: 600,
      fontSize: 0.04,
      stroke: { color: '#000000', width: 0 },
      background: { color: '#000000', opacity: 0.55, padding: 0.35, radius: 0.2 },
    }),
    animation: defaultTextAnimation({ in: { kind: 'fade', duration: 0.12 }, out: { kind: 'none', duration: 0 } }),
    position: { x: 0.5, y: 0.85 },
  },
  {
    id: 'scale',
    label: 'Scale focus',
    style: defaultCaptionStyle({
      highlight: 'scale',
      activeScale: 1.25,
      activeColor: '#ffffff',
      color: '#ffffff99',
      fontSize: 0.05,
    }),
    animation: defaultTextAnimation({ in: { kind: 'fade', duration: 0.12 }, out: { kind: 'none', duration: 0 } }),
    position: { x: 0.5, y: 0.75 },
  },
]

// ---------------------------------------------------------------------------
// Item factories
// ---------------------------------------------------------------------------

function visualDefaults(overrides = {}) {
  return {
    transform: defaultTransform(),
    fit: 'contain',
    crop: defaultCrop(),
    opacity: 1,
    effects: neutralEffects(),
    ...overrides,
  }
}

/**
 * @param {import('./types').MediaAsset} asset
 * @param {number} start
 * @returns {import('./types').Item}
 */
export function createItemFromAsset(asset, start) {
  const base = { id: createId(), start, name: asset.name }
  switch (asset.kind) {
    case 'video':
      return {
        ...base,
        type: 'video',
        duration: asset.duration ?? DEFAULT_IMAGE_DURATION,
        assetId: asset.id,
        sourceIn: 0,
        speed: 1,
        ...visualDefaults(),
        audio: defaultAudio(),
      }
    case 'image':
      return { ...base, type: 'image', duration: DEFAULT_IMAGE_DURATION, assetId: asset.id, ...visualDefaults() }
    default:
      return {
        ...base,
        type: 'audio',
        duration: asset.duration ?? DEFAULT_IMAGE_DURATION,
        assetId: asset.id,
        sourceIn: 0,
        speed: 1,
        audio: defaultAudio(),
        loop: false,
      }
  }
}

/**
 * @param {{ text?: string, start?: number, duration?: number, style?: object, animation?: object, position?: {x: number, y: number} }} options
 * @returns {import('./types').TextItem}
 */
export function createTextItem(options = {}) {
  const position = options.position ?? { x: 0.5, y: 0.5 }
  return {
    id: createId(),
    type: 'text',
    name: 'Text',
    start: options.start ?? 0,
    duration: options.duration ?? DEFAULT_TEXT_DURATION,
    text: options.text ?? 'Your text',
    style: { ...defaultTextStyle(), ...(options.style ?? {}) },
    animation: { ...defaultTextAnimation(), ...(options.animation ?? {}) },
    ...visualDefaults({ transform: { ...defaultTransform(), x: position.x, y: position.y } }),
  }
}

/**
 * @param {{ text: string, start: number, duration: number, words?: import('./types').CaptionWord[], style?: object, animation?: object, position?: {x: number, y: number} }} options
 * @returns {import('./types').CaptionItem}
 */
export function createCaptionItem(options) {
  const position = options.position ?? { x: 0.5, y: 0.78 }
  return {
    id: createId(),
    type: 'caption',
    name: options.text.slice(0, 24),
    start: options.start,
    duration: options.duration,
    text: options.text,
    words: options.words ?? [],
    style: { ...defaultCaptionStyle(), ...(options.style ?? {}) },
    animation: { ...defaultTextAnimation({ in: { kind: 'pop', duration: 0.18 }, out: { kind: 'none', duration: 0 } }), ...(options.animation ?? {}) },
    ...visualDefaults({ transform: { ...defaultTransform(), x: position.x, y: position.y } }),
  }
}
