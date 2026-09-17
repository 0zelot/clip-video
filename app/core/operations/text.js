/**
 * Operations for text and caption items (mutate an Immer draft).
 */
import { createCaptionItem, createTextItem, createTrack } from '../model/defaults'
import { findTrack, locateItem } from '../model/queries'
import { EPSILON, itemEnd } from '../time'
import { addTrack, findFreeStart, insertItem, isRangeFree, sortTrack } from './items'

/**
 * Finds a visual track with room for [start, start+duration), preferring the
 * upper (overlay) tracks; creates a new one when everything is occupied.
 *
 * @param {import('../model/types').Project} project
 * @param {number} start
 * @param {number} duration
 */
function overlayTrack(project, start, duration) {
  const visual = project.tracks.filter((t) => t.kind === 'visual' && !t.locked && t.role !== 'captions')
  const free = visual.find((t) => isRangeFree(t, start, duration))
  return free ?? addTrack(project, 'visual')
}

/**
 * Adds a text item at `start`.
 * @param {import('../model/types').Project} project
 * @param {{ start: number, duration?: number, text?: string, style?: object, animation?: object, position?: object, trackId?: string }} options
 * @returns {string | null} id of the new item
 */
export function addTextItem(project, options) {
  const item = createTextItem(options)
  const track = options.trackId ? findTrack(project, options.trackId) : overlayTrack(project, item.start, item.duration)
  if (!track) return null
  const inserted = insertItem(project, track.id, item)
  return inserted?.id ?? null
}

/** Returns the dedicated captions track, creating it above the other tracks if needed. */
export function ensureCaptionTrack(project) {
  const existing = project.tracks.find((t) => t.role === 'captions')
  if (existing) return existing
  const track = createTrack('visual', 'Captions')
  track.role = 'captions'
  project.tracks.unshift(track)
  return project.tracks[0]
}

/**
 * Replaces every caption on the captions track with the given phrases.
 *
 * @param {import('../model/types').Project} project
 * @param {import('../captions').CaptionPhrase[]} phrases absolute timeline times
 * @param {{ style?: object, animation?: object, position?: {x: number, y: number} }} [options]
 * @returns {string[]} ids of the created items
 */
export function replaceCaptions(project, phrases, options = {}) {
  const track = ensureCaptionTrack(project)
  track.items = []
  return appendCaptions(project, phrases, options)
}

/**
 * Adds caption items without touching the ones already on the track.
 * @returns {string[]} ids of the created items
 */
export function appendCaptions(project, phrases, options = {}) {
  const track = ensureCaptionTrack(project)
  const created = []
  for (const phrase of phrases) {
    const duration = Math.max(0.2, phrase.end - phrase.start)
    const item = createCaptionItem({
      text: phrase.text,
      start: phrase.start,
      duration,
      // Word timings are stored relative to the item so trimming keeps them valid.
      words: (phrase.words ?? []).map((w) => ({
        text: w.text,
        start: Math.max(0, w.start - phrase.start),
        end: Math.max(0, w.end - phrase.start),
      })),
      style: options.style,
      animation: options.animation,
      position: options.position,
    })
    item.start = findFreeStart(track, duration, phrase.start)
    track.items.push(item)
    created.push(item.id)
  }
  sortTrack(track)
  return created
}

/** Applies a style / animation / position to every caption on the captions track. */
export function restyleCaptions(project, { style, animation, position } = {}) {
  const track = project.tracks.find((t) => t.role === 'captions')
  if (!track) return false
  for (const item of track.items) {
    if (item.type !== 'caption') continue
    if (style) item.style = { ...item.style, ...style }
    if (animation) item.animation = { in: { ...animation.in }, out: { ...animation.out } }
    if (position) item.transform = { ...item.transform, x: position.x, y: position.y }
  }
  return true
}

/** Edits the text of a caption and re-distributes word timings if needed. */
export function setCaptionText(project, itemId, text, words) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.item.type !== 'caption') return false
  loc.item.text = text
  loc.item.name = text.slice(0, 24)
  if (words) loc.item.words = words
  return true
}

/**
 * Merges a caption with the following one on the captions track.
 * @returns {boolean}
 */
export function mergeCaptionWithNext(project, itemId) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.item.type !== 'caption') return false
  const next = loc.track.items[loc.itemIndex + 1]
  if (!next || next.type !== 'caption') return false
  const offset = next.start - loc.item.start
  loc.item.text = `${loc.item.text} ${next.text}`.trim()
  loc.item.name = loc.item.text.slice(0, 24)
  loc.item.words = [...loc.item.words, ...next.words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }))]
  loc.item.duration = itemEnd(next) - loc.item.start
  loc.track.items.splice(loc.itemIndex + 1, 1)
  return true
}

/**
 * Splits a caption before the word at `wordIndex`.
 * @returns {string | null} id of the new (right) caption
 */
export function splitCaptionAtWord(project, itemId, wordIndex) {
  const loc = locateItem(project, itemId)
  if (!loc || loc.item.type !== 'caption') return null
  const item = loc.item
  if (wordIndex <= 0 || wordIndex >= item.words.length) return null
  const left = item.words.slice(0, wordIndex)
  const right = item.words.slice(wordIndex)
  const splitLocal = Math.max(left[left.length - 1].end, right[0].start - 0.01)

  const rightItem = createCaptionItem({
    text: right.map((w) => w.text).join(' '),
    start: item.start + splitLocal,
    duration: Math.max(0.2, item.duration - splitLocal),
    words: right.map((w) => ({ ...w, start: Math.max(0, w.start - splitLocal), end: Math.max(0, w.end - splitLocal) })),
    style: item.style,
    animation: item.animation,
    position: { x: item.transform.x, y: item.transform.y },
  })

  item.text = left.map((w) => w.text).join(' ')
  item.name = item.text.slice(0, 24)
  item.words = left
  item.duration = Math.max(0.2, splitLocal)

  loc.track.items.splice(loc.itemIndex + 1, 0, rightItem)
  sortTrack(loc.track)
  return rightItem.id
}

/** Shifts every caption on the captions track by `delta` seconds. */
export function shiftCaptions(project, delta) {
  const track = project.tracks.find((t) => t.role === 'captions')
  if (!track) return false
  for (const item of track.items) item.start = Math.max(0, item.start + delta)
  sortTrack(track)
  return true
}

/** All caption items of the project, in timeline order. */
export function captionItems(project) {
  const track = project.tracks.find((t) => t.role === 'captions')
  return track ? track.items.filter((i) => i.type === 'caption') : []
}

/** True when the caption track holds at least one caption. */
export function hasCaptions(project) {
  return captionItems(project).length > 0
}

/** Removes every caption item (and the track when it becomes empty). */
export function clearCaptions(project) {
  const index = project.tracks.findIndex((t) => t.role === 'captions')
  if (index === -1) return false
  project.tracks.splice(index, 1)
  return true
}

export { EPSILON }
