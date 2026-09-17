/**
 * Normalization of persisted projects.
 *
 * Projects stored by older versions of the app (or partially written data)
 * are upgraded here, filling any missing fields with defaults. New features
 * that extend the model only need to add their defaults in this file.
 */
import {
  createId,
  defaultAudio,
  defaultCaptionStyle,
  defaultCrop,
  defaultSettings,
  defaultTextAnimation,
  defaultTextStyle,
  defaultTransform,
  neutralEffects,
} from './defaults'
import { PROJECT_SCHEMA_VERSION } from './types'

function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeTransition(raw) {
  if (!raw || typeof raw !== 'object' || !raw.kind || raw.kind === 'none') return undefined
  return {
    kind: raw.kind,
    duration: Math.max(0.05, num(raw.duration, 0.5)),
    ...(raw.direction ? { direction: raw.direction } : {}),
  }
}

function normalizeTextStyle(raw, base) {
  const style = { ...base, ...(raw ?? {}) }
  style.stroke = { ...base.stroke, ...(raw?.stroke ?? {}) }
  style.shadow = { ...base.shadow, ...(raw?.shadow ?? {}) }
  style.background = { ...base.background, ...(raw?.background ?? {}) }
  return style
}

/** @returns {import('./types').Item | null} */
function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const mediaBacked = raw.type === 'video' || raw.type === 'image' || raw.type === 'audio'
  if (mediaBacked && typeof raw.assetId !== 'string') return null

  const base = {
    id: typeof raw.id === 'string' ? raw.id : createId(),
    start: Math.max(0, num(raw.start, 0)),
    duration: Math.max(0.001, num(raw.duration, 1)),
    name: typeof raw.name === 'string' ? raw.name : undefined,
    ...(mediaBacked ? { assetId: raw.assetId } : {}),
  }
  const visual = {
    transform: { ...defaultTransform(), ...(raw.transform ?? {}) },
    fit: raw.fit === 'cover' || raw.fit === 'stretch' ? raw.fit : 'contain',
    crop: { ...defaultCrop(), ...(raw.crop ?? {}) },
    opacity: num(raw.opacity, 1),
    effects: { ...neutralEffects(), ...(raw.effects ?? {}) },
    ...(normalizeTransition(raw.transitionIn) ? { transitionIn: normalizeTransition(raw.transitionIn) } : {}),
    ...(raw.keyframes ? { keyframes: raw.keyframes } : {}),
  }
  const timed = {
    sourceIn: Math.max(0, num(raw.sourceIn, 0)),
    speed: num(raw.speed, 1) > 0 ? num(raw.speed, 1) : 1,
    ...(Array.isArray(raw.speedRamp) ? { speedRamp: raw.speedRamp } : {}),
    ...(raw.reversed ? { reversed: true } : {}),
  }
  const audio = { ...defaultAudio(), ...(raw.audio ?? {}) }
  const animation = {
    in: { ...defaultTextAnimation().in, ...(raw.animation?.in ?? {}) },
    out: { ...defaultTextAnimation().out, ...(raw.animation?.out ?? {}) },
  }

  switch (raw.type) {
    case 'video':
      return { ...base, type: 'video', ...timed, ...visual, audio }
    case 'image':
      return { ...base, type: 'image', ...visual }
    case 'audio':
      return { ...base, type: 'audio', ...timed, audio, loop: Boolean(raw.loop) }
    case 'text':
      return {
        ...base,
        type: 'text',
        ...visual,
        text: typeof raw.text === 'string' ? raw.text : '',
        style: normalizeTextStyle(raw.style, defaultTextStyle()),
        animation,
      }
    case 'caption':
      return {
        ...base,
        type: 'caption',
        ...visual,
        text: typeof raw.text === 'string' ? raw.text : '',
        words: Array.isArray(raw.words)
          ? raw.words
              .filter((w) => w && typeof w.text === 'string')
              .map((w) => ({ text: w.text, start: Math.max(0, num(w.start, 0)), end: Math.max(0, num(w.end, 0)) }))
          : [],
        style: normalizeTextStyle(raw.style, defaultCaptionStyle()),
        animation,
      }
    default:
      return null
  }
}

/** @returns {import('./types').Track | null} */
function normalizeTrack(raw) {
  if (!raw || typeof raw !== 'object') return null
  const kind = raw.kind === 'audio' ? 'audio' : 'visual'
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normalizeItem)
    .filter((i) => i !== null && (kind === 'audio') === (i.type === 'audio'))
    .sort((a, b) => a.start - b.start)
  return {
    id: typeof raw.id === 'string' ? raw.id : createId(),
    kind,
    name: typeof raw.name === 'string' ? raw.name : kind === 'audio' ? 'Audio' : 'Video',
    hidden: Boolean(raw.hidden),
    muted: Boolean(raw.muted),
    locked: Boolean(raw.locked),
    ...(raw.role === 'captions' ? { role: 'captions' } : {}),
    items,
  }
}

/**
 * @param {unknown} raw
 * @returns {import('./types').Project}
 */
export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid project data')
  if (typeof raw.id !== 'string') throw new Error('Project is missing an id')
  const settings = { ...defaultSettings(), ...(raw.settings ?? {}) }
  const assets = {}
  for (const [id, asset] of Object.entries(raw.assets ?? {})) {
    if (asset && typeof asset === 'object' && typeof asset.kind === 'string') assets[id] = { ...asset, id }
  }
  const tracks = (Array.isArray(raw.tracks) ? raw.tracks : []).map(normalizeTrack).filter((t) => t !== null)
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Untitled project',
    createdAt: num(raw.createdAt, Date.now()),
    updatedAt: num(raw.updatedAt, Date.now()),
    settings,
    assets,
    tracks,
    savedTextStyles: Array.isArray(raw.savedTextStyles) ? raw.savedTextStyles : [],
    savedCaptionStyles: Array.isArray(raw.savedCaptionStyles) ? raw.savedCaptionStyles : [],
  }
}
