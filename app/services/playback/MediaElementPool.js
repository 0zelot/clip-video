import { activeItemOnTrack } from '../../core/model/queries'
import { collectVisualLayers } from '../../core/render/compositor'
import { sourceTimeAt } from '../../core/time'
import { mediaLibrary } from '../media/mediaLibrary'

const MAX_IDLE_MS = 8000
const MAX_POOL_SIZE = 12
const DRIFT_TOLERANCE = 0.25
const LOOKAHEAD = 1.0

/**
 * Keeps one media element per active timeline item and synchronises it with
 * the playback clock. Elements are released when they have not been used for a
 * while so that mobile browsers do not run out of media players.
 *
 * @typedef {object} PooledElement
 * @property {HTMLVideoElement | HTMLAudioElement} el
 * @property {string} itemId
 * @property {string} assetId
 * @property {number} lastUsed
 * @property {boolean} seeking
 * @property {number | null} pendingSeek
 */
export class MediaElementPool {
  /** @type {Map<string, PooledElement>} */
  #pool = new Map()
  #container
  /** @type {(() => void) | null} */
  onFrameReady = null

  constructor() {
    this.#container = document.createElement('div')
    this.#container.style.cssText =
      'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-10px;top:-10px'
    document.body.appendChild(this.#container)
  }

  /** @returns {HTMLVideoElement | null} */
  getVideo(itemId) {
    const entry = this.#pool.get(itemId)
    return entry && entry.el instanceof HTMLVideoElement ? entry.el : null
  }

  /** True when the video element shows the frame for its target time. */
  isVideoReady(itemId) {
    const entry = this.#pool.get(itemId)
    if (!entry) return false
    return entry.el.readyState >= 2 && !entry.seeking && entry.pendingSeek === null
  }

  #acquire(item) {
    const url = mediaLibrary.getUrl(item.assetId)
    if (!url) return null
    let entry = this.#pool.get(item.id)
    if (entry && entry.assetId !== item.assetId) {
      this.#releaseEntry(entry)
      entry = undefined
    }
    if (!entry) {
      const el = item.type === 'video' ? document.createElement('video') : document.createElement('audio')
      el.preload = 'auto'
      el.crossOrigin = 'anonymous'
      if (el instanceof HTMLVideoElement) {
        el.playsInline = true
        el.setAttribute('playsinline', '')
        el.disablePictureInPicture = true
      }
      const created = { el, itemId: item.id, assetId: item.assetId, lastUsed: performance.now(), seeking: false, pendingSeek: null }
      el.addEventListener('seeking', () => (created.seeking = true))
      el.addEventListener('seeked', () => {
        created.seeking = false
        if (created.pendingSeek !== null) {
          const target = created.pendingSeek
          created.pendingSeek = null
          if (Math.abs(el.currentTime - target) > 0.01) this.#seekElement(created, target)
        }
        this.onFrameReady?.()
      })
      el.addEventListener('loadeddata', () => this.onFrameReady?.())
      el.src = url
      this.#container.appendChild(el)
      this.#pool.set(item.id, created)
      entry = created
    }
    entry.lastUsed = performance.now()
    return entry
  }

  #seekElement(entry, time) {
    if (entry.seeking) {
      entry.pendingSeek = time
      return
    }
    entry.seeking = true
    try {
      entry.el.currentTime = time
    } catch {
      entry.seeking = false
    }
  }

  #releaseEntry(entry) {
    entry.el.pause()
    entry.el.removeAttribute('src')
    entry.el.load()
    entry.el.remove()
    this.#pool.delete(entry.itemId)
  }

  /**
   * Brings media elements in line with the timeline at `time`.
   * Called on every animation frame while playing and after every seek.
   *
   * @param {import('../../core/model/types').Project} project
   * @param {number} time
   * @param {boolean} playing
   * @param {number} masterVolume
   */
  sync(project, time, playing, masterVolume) {
    const active = new Set()
    const fps = project.settings.fps

    /**
     * @param {import('../../core/model/types').Item} item
     * @param {import('../../core/model/types').Track} track
     * @param {number} sourceTime target time inside the media file
     * @param {boolean} isCurrent false for clips that are only being pre-rolled
     */
    const syncItem = (item, track, sourceTime, isCurrent) => {
      if (item.type !== 'video' && item.type !== 'audio') return
      if (active.has(item.id)) return
      // Hidden visual tracks still play their audio; muted tracks don't need audio elements.
      const audible = !track.muted && !item.audio.muted && item.audio.volume > 0
      if (item.type === 'audio' && !audible) return
      const entry = this.#acquire(item)
      if (!entry) return
      active.add(item.id)
      const el = entry.el
      const target = sourceTime

      el.muted = !audible
      el.volume = Math.min(1, Math.max(0, item.audio.volume * masterVolume))
      if (el.playbackRate !== item.speed) el.playbackRate = item.speed
      // Speed changes must not change the pitch of the preview.
      if ('preservesPitch' in el) el.preservesPitch = true

      if (playing && isCurrent) {
        if (el.paused) {
          if (Math.abs(el.currentTime - target) > 0.05) this.#seekElement(entry, target)
          void el.play().catch(() => {})
        } else if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE) {
          this.#seekElement(entry, target)
        }
      } else {
        if (!el.paused) el.pause()
        const tolerance = isCurrent ? 0.5 / fps : 0.1
        if (Math.abs(el.currentTime - target) > tolerance && entry.pendingSeek !== target) this.#seekElement(entry, target)
      }
    }

    // Visual layers (including the outgoing clip of a running transition).
    for (const lookahead of playing ? [0, LOOKAHEAD] : [0]) {
      for (const layer of collectVisualLayers(project, time + lookahead)) {
        syncItem(layer.item, layer.track, layer.sourceTime, lookahead === 0)
        if (layer.transition) {
          syncItem(layer.transition.previous.item, layer.track, layer.transition.previous.sourceTime, lookahead === 0)
        }
      }
    }

    // Audio tracks.
    for (const track of project.tracks) {
      if (track.kind !== 'audio') continue
      for (const lookahead of playing ? [0, LOOKAHEAD] : [0]) {
        const item = activeItemOnTrack(track, time + lookahead)
        if (!item) continue
        const assetDuration = project.assets[item.assetId]?.duration
        const isCurrent = lookahead === 0
        syncItem(item, track, sourceTimeAt(item, isCurrent ? time : item.start, assetDuration), isCurrent)
      }
    }

    const now = performance.now()
    for (const entry of [...this.#pool.values()]) {
      if (active.has(entry.itemId)) continue
      if (!entry.el.paused) entry.el.pause()
      if (now - entry.lastUsed > MAX_IDLE_MS || this.#pool.size > MAX_POOL_SIZE) this.#releaseEntry(entry)
    }
  }

  pauseAll() {
    for (const entry of this.#pool.values()) if (!entry.el.paused) entry.el.pause()
  }

  destroy() {
    for (const entry of [...this.#pool.values()]) this.#releaseEntry(entry)
    this.#container.remove()
  }
}
