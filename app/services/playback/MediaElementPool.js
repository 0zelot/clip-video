import { activeItemOnTrack } from '../../core/model/queries'
import { collectVisualLayers } from '../../core/render/compositor'
import { sourceTimeAt, speedAt } from '../../core/time'
import { mediaLibrary } from '../media/mediaLibrary'

const MAX_IDLE_MS = 8000
const MAX_POOL_SIZE = 12
const DRIFT_TOLERANCE = 0.3
const LOOKAHEAD = 1.5
const SNAPSHOT_MAX_SIZE = 720
const SNAPSHOT_INTERVAL_MS = 120

/** Source time an upcoming clip should wait at: its first frame (or now, if it already started). */
function prerollTime(item, time) {
  return item.type === 'video' ? sourceTimeAt(item, Math.max(item.start, time)) : 0
}

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
  /**
   * Last decoded frame of every video, copied into a small canvas. While a
   * video element seeks, stalls or re-buffers it cannot be drawn - the preview
   * then shows this snapshot instead of a black frame.
   * @type {Map<string, { canvas: HTMLCanvasElement, sourceTime: number, at: number }>}
   */
  #snapshots = new Map()
  #container
  /** @type {(() => void) | null} */
  onFrameReady = null

  constructor() {
    this.#container = document.createElement('div')
    this.#container.style.cssText =
      // Kept inside the viewport: some mobile browsers stop decoding off-screen videos.
      'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1'
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

  /**
   * Stores the current frame of a ready video (throttled during playback).
   * @param {string} itemId
   * @param {number} sourceTime
   * @param {boolean} force copy even if the last snapshot is recent
   */
  snapshot(itemId, sourceTime, force = false) {
    const video = this.getVideo(itemId)
    if (!video || video.readyState < 2 || video.videoWidth === 0) return
    let entry = this.#snapshots.get(itemId)
    const now = performance.now()
    if (entry && !force && now - entry.at < SNAPSHOT_INTERVAL_MS) return
    if (entry && Math.abs(entry.sourceTime - sourceTime) < 1e-4) return
    const scale = Math.min(1, SNAPSHOT_MAX_SIZE / Math.max(video.videoWidth, video.videoHeight))
    const w = Math.max(2, Math.round(video.videoWidth * scale))
    const h = Math.max(2, Math.round(video.videoHeight * scale))
    if (!entry) {
      const canvas = document.createElement('canvas')
      entry = { canvas, sourceTime, at: now }
      this.#snapshots.set(itemId, entry)
    }
    if (entry.canvas.width !== w || entry.canvas.height !== h) {
      entry.canvas.width = w
      entry.canvas.height = h
    }
    try {
      entry.canvas.getContext('2d')?.drawImage(video, 0, 0, w, h)
      entry.sourceTime = sourceTime
      entry.at = now
    } catch {
      this.#snapshots.delete(itemId)
    }
  }

  /** @returns {{ canvas: HTMLCanvasElement, sourceTime: number } | undefined} */
  getSnapshot(itemId) {
    return this.#snapshots.get(itemId)
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
    this.#snapshots.delete(entry.itemId)
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
      // Speed ramps change the rate continuously; small steps avoid constant resets.
      const rate = Math.min(16, Math.max(0.0625, Math.round(speedAt(item, Math.max(0, time - item.start)) * 100) / 100))
      if (Math.abs(el.playbackRate - rate) > 0.004) el.playbackRate = rate
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
    // Upcoming clips are pre-rolled to their *first* frame and stay there, so
    // they are ready the moment they start (seeking them continuously to a
    // moving target kept them permanently busy - the cause of black frames).
    for (const lookahead of playing ? [0, LOOKAHEAD / 2, LOOKAHEAD] : [0]) {
      const isCurrent = lookahead === 0
      for (const layer of collectVisualLayers(project, time + lookahead)) {
        const target = isCurrent ? layer.sourceTime : prerollTime(layer.item, time)
        syncItem(layer.item, layer.track, target, isCurrent)
        if (layer.transition) {
          const prev = layer.transition.previous
          syncItem(prev.item, layer.track, isCurrent ? prev.sourceTime : prerollTime(prev.item, time), isCurrent)
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
        syncItem(item, track, sourceTimeAt(item, isCurrent ? time : Math.max(item.start, time), assetDuration), isCurrent)
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
