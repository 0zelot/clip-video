/**
 * Clip project data model.
 *
 * This module is the single source of truth for the shape of a project. It is
 * intentionally framework-agnostic: no Vue, no DOM, no renderer code. The same
 * objects are used by the editor UI, the preview renderer, the exporter
 * (inside a Web Worker) and the persistence layer.
 *
 * The shapes are documented with JSDoc typedefs, so editors still give
 * completion and warnings without a build step.
 *
 * All objects are treated as immutable. Changes are produced with Immer
 * (see `stores/project.js`), which gives cheap structural sharing for the
 * undo/redo history.
 *
 * Time values are in seconds (floating point). Spatial values of visual items
 * are normalized to the project canvas (0..1) so they survive resolution and
 * aspect-ratio changes. Text sizes are normalized to the canvas height.
 */

export const PROJECT_SCHEMA_VERSION = 2

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

/**
 * @typedef {string} Id
 * @typedef {number} Seconds
 */

/**
 * @typedef {object} Project
 * @property {number} schemaVersion
 * @property {Id} id
 * @property {string} name
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {ProjectSettings} settings
 * @property {Record<Id, MediaAsset>} assets metadata only - binaries live in the media repository
 * @property {Track[]} tracks display order, top to bottom (first visual track is the top layer)
 * @property {TextStyle[]} [savedTextStyles] user presets
 * @property {CaptionStyle[]} [savedCaptionStyles] user presets
 */

/**
 * @typedef {object} ProjectSettings
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {Background} background
 */

/**
 * @typedef {{ kind: 'color', color: string }
 *   | { kind: 'gradient', from: string, to: string, angle: number }
 *   | { kind: 'image', assetId: Id, blur: number }
 *   | { kind: 'blur', amount: number }} Background
 */

// ---------------------------------------------------------------------------
// Media assets
// ---------------------------------------------------------------------------

/**
 * @typedef {'video' | 'audio' | 'image' | 'font'} AssetKind
 *
 * Where the binary content of an asset lives:
 * - `indexeddb`: persisted locally, survives reloads.
 * - `memory`: could not be persisted (quota / platform restriction). The asset
 *   will be reported as missing after a reload and can be re-linked.
 * @typedef {'indexeddb' | 'memory'} AssetStorage
 */

/**
 * @typedef {object} MediaAsset
 * @property {Id} id
 * @property {AssetKind} kind
 * @property {string} name
 * @property {string} mimeType
 * @property {number} size
 * @property {number} lastModified
 * @property {AssetStorage} storage
 * @property {Seconds} [duration]
 * @property {number} [width] display width, after rotation
 * @property {number} [height]
 * @property {number} [fps]
 * @property {boolean} [hasAudio]
 * @property {boolean} [hasVideo]
 * @property {string} [fontFamily] for `font` assets: the CSS family name to use
 * @property {boolean} [removed] kept until no history entry can reference it
 * @property {number} importedAt
 */

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

/**
 * `visual` tracks hold video, image, text and caption items.
 * `audio` tracks hold audio items.
 * @typedef {'visual' | 'audio'} TrackKind
 */

/**
 * @typedef {object} Track
 * @property {Id} id
 * @property {TrackKind} kind
 * @property {string} name
 * @property {boolean} hidden visual tracks: not rendered
 * @property {boolean} muted audio of all items on the track is silenced
 * @property {boolean} locked items cannot be edited
 * @property {'captions'} [role] marks the track that holds generated captions
 * @property {Item[]} items sorted by `start`, never overlapping
 */

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * @typedef {'video' | 'image' | 'audio' | 'text' | 'caption'} ItemType
 */

/**
 * Properties shared by every item.
 * @typedef {object} ItemBase
 * @property {Id} id
 * @property {ItemType} type
 * @property {Seconds} start position on the timeline
 * @property {Seconds} duration length on the timeline (already accounts for speed)
 * @property {string} [name]
 * @property {Id} [assetId] media-backed items only
 */

/**
 * Items backed by time-based media.
 * @typedef {object} TimedMedia
 * @property {Seconds} sourceIn offset into the source media where the item begins
 * @property {number} speed constant playback speed multiplier
 * @property {SpeedPoint[]} [speedRamp] reserved for speed ramps; overrides `speed` (see `core/time.js`)
 * @property {boolean} [reversed]
 *
 * @typedef {{ t: Seconds, speed: number }} SpeedPoint control point in item-local time
 */

/**
 * Transition played at the start of an item, blending it with the clip before
 * it on the same track.
 * @typedef {'none' | 'fade' | 'crossfade' | 'dipBlack' | 'dipWhite' | 'slide' | 'push' | 'wipe' | 'zoom' | 'zoomOut' | 'blur' | 'spin' | 'flash' | 'iris' | 'doors' | 'clock' | 'glitch' | 'whip'} TransitionKind
 * @typedef {'left' | 'right' | 'up' | 'down'} TransitionDirection
 * @typedef {{ kind: TransitionKind, duration: Seconds, direction?: TransitionDirection }} Transition
 */

/**
 * @typedef {object} Transform
 * @property {number} x center of the item, normalized to canvas width (0 = left edge)
 * @property {number} y center of the item, normalized to canvas height
 * @property {number} scale uniform scale applied after fitting
 * @property {number} scaleX non-uniform stretch (width editing)
 * @property {number} scaleY non-uniform stretch (height editing)
 * @property {number} rotation degrees, clockwise
 * @property {boolean} flipH
 * @property {boolean} flipV
 */

/**
 * How media is fitted into the canvas before `transform.scale` is applied.
 * @typedef {'contain' | 'cover' | 'stretch'} FitMode
 *
 * Crop insets, normalized to the source dimensions (0..1).
 * @typedef {{ top: number, right: number, bottom: number, left: number }} Crop
 */

/**
 * @typedef {object} VisualProps
 * @property {Transform} transform
 * @property {FitMode} fit
 * @property {Crop} crop
 * @property {number} opacity
 * @property {EffectParams} effects
 * @property {Transition} [transitionIn]
 * @property {Motion} [motion]
 * @property {KeyframeTracks} [keyframes]
 */

/**
 * @typedef {object} AudioProps
 * @property {number} volume linear gain, 1 = 100%
 * @property {boolean} muted
 * @property {Seconds} fadeIn
 * @property {Seconds} fadeOut
 * @property {number} [pitch] semitones, 0 = unchanged
 */

/**
 * Basic image adjustments. Neutral values produce an unmodified image.
 * @typedef {object} EffectParams
 * @property {number} brightness 1 = neutral
 * @property {number} contrast 1 = neutral
 * @property {number} saturation 1 = neutral
 * @property {number} hue degrees, 0 = neutral
 * @property {number} blur px at project resolution
 * @property {number} grayscale 0..1
 * @property {number} sepia 0..1
 * @property {number} invert 0..1
 * @property {number} vignette 0..1
 * @property {number} [grain] film grain 0..1
 * @property {number} [temperature] -1 (cold) .. 1 (warm)
 */

/**
 * Automatic camera motion over the duration of a clip (Ken Burns, shake…).
 * @typedef {'none' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'panUp' | 'panDown' | 'shake' | 'pulse'} MotionKind
 * @typedef {{ kind: MotionKind, amount: number }} Motion amount 0..1
 */

/**
 * @typedef {'x' | 'y' | 'scale' | 'rotation' | 'opacity'} AnimatableProperty
 * @typedef {'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold'} Easing
 * @typedef {{ t: Seconds, value: number, easing: Easing }} Keyframe `t` is item-local time
 * @typedef {Partial<Record<AnimatableProperty, Keyframe[]>>} KeyframeTracks
 */

// ---------------------------------------------------------------------------
// Text & captions
// ---------------------------------------------------------------------------

/**
 * Text look. Sizes are fractions: `fontSize` of the canvas height, everything
 * derived from it (stroke, padding, shadow) of the font size, `maxWidth` of the
 * canvas width. That keeps text identical at any export resolution.
 *
 * @typedef {object} TextStyle
 * @property {string} fontFamily
 * @property {number} fontWeight 400..900
 * @property {boolean} italic
 * @property {number} fontSize fraction of canvas height
 * @property {string} color
 * @property {number} opacity
 * @property {'left' | 'center' | 'right'} align
 * @property {number} lineHeight multiplier
 * @property {number} letterSpacing fraction of font size
 * @property {number} maxWidth fraction of canvas width
 * @property {boolean} uppercase
 * @property {{ color: string, width: number }} stroke width as fraction of font size
 * @property {{ color: string, blur: number, offsetX: number, offsetY: number, opacity: number }} shadow
 * @property {{ color: string, opacity: number, padding: number, radius: number }} background
 */

/**
 * Caption look: a text style plus the active-word treatment used by
 * TikTok/Shorts style subtitles.
 *
 * @typedef {TextStyle & {
 *   highlight: 'none' | 'color' | 'box' | 'scale' | 'pop' | 'bounce',
 *   activeColor: string,
 *   activeBackground: string,
 *   activeScale: number,
 * }} CaptionStyle
 */

/**
 * @typedef {'none' | 'fade' | 'pop' | 'slide' | 'zoom' | 'bounce' | 'typewriter'} TextAnimationKind
 * @typedef {{ kind: TextAnimationKind, duration: Seconds }} TextAnimationStep
 * @typedef {{ in: TextAnimationStep, out: TextAnimationStep }} TextAnimation
 */

/** @typedef {{ text: string, start: Seconds, end: Seconds }} CaptionWord item-local times */

/**
 * @typedef {ItemBase & TimedMedia & VisualProps & { type: 'video', assetId: Id, audio: AudioProps }} VideoItem
 * @typedef {ItemBase & VisualProps & { type: 'image', assetId: Id }} ImageItem
 * @typedef {ItemBase & TimedMedia & { type: 'audio', assetId: Id, audio: AudioProps, loop: boolean }} AudioItem
 * @typedef {ItemBase & VisualProps & { type: 'text', text: string, style: TextStyle, animation: TextAnimation }} TextItem
 * @typedef {ItemBase & VisualProps & {
 *   type: 'caption', text: string, words: CaptionWord[], style: CaptionStyle, animation: TextAnimation
 * }} CaptionItem
 *
 * @typedef {VideoItem | ImageItem | AudioItem | TextItem | CaptionItem} Item
 * @typedef {VideoItem | ImageItem | TextItem | CaptionItem} VisualItem
 * @typedef {VideoItem | AudioItem} TimedItem
 * @typedef {TextItem | CaptionItem} TextualItem
 */

/**
 * @param {Item} item
 * @returns {boolean} true for items drawn on the canvas
 */
export function isVisualItem(item) {
  return item.type === 'video' || item.type === 'image' || item.type === 'text' || item.type === 'caption'
}

/**
 * @param {Item} item
 * @returns {boolean} true for items backed by time-based media
 */
export function isTimedItem(item) {
  return item.type === 'video' || item.type === 'audio'
}

/**
 * @param {Item} item
 * @returns {boolean} true for items that can produce sound
 */
export function hasAudio(item) {
  return item.type === 'video' || item.type === 'audio'
}

/**
 * @param {Item} item
 * @returns {boolean} true for text and caption items
 */
export function isTextual(item) {
  return item.type === 'text' || item.type === 'caption'
}

/** Items backed by a media file (video, image, audio, custom font). */
export function usesAsset(item) {
  return item.type === 'video' || item.type === 'image' || item.type === 'audio'
}

/**
 * @param {Track} track
 * @param {{ type: ItemType }} item
 * @returns {boolean}
 */
export function trackAccepts(track, item) {
  return track.kind === 'audio' ? item.type === 'audio' : item.type !== 'audio'
}
