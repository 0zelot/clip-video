/**
 * Generates timeline thumbnails and waveform peaks in a Web Worker, one job at
 * a time so decoding never competes with preview playback for too long.
 *
 * Worker protocol (see `workers/media.worker.js`):
 *   → { id, type: 'filmstrip', blob, height, maxFrames }
 *   → { id, type: 'peaks', blob, bucketsPerSecond }
 *   → { id, type: 'cancel' }
 *   ← { id, type: 'filmstrip-meta', times, width, height, interval }
 *   ← { id, type: 'filmstrip-frame', index, bitmap }
 *   ← { id, type: 'peaks', data, bucketsPerSecond }
 *   ← { id, type: 'done' } | { id, type: 'error', message }
 *
 * @typedef {object} Filmstrip
 * @property {number[]} times source times of the thumbnails (seconds)
 * @property {(ImageBitmap | null)[]} bitmaps
 * @property {number} width
 * @property {number} height
 * @property {number} interval
 *
 * @typedef {{ data: Float32Array, bucketsPerSecond: number }} Peaks max absolute amplitude per bucket (0..1)
 *
 * @typedef {'filmstrip' | 'peaks'} JobKind
 */

const FILMSTRIP_HEIGHT = 96
const PEAK_BUCKETS_PER_SECOND = 100

class MediaAnalysis {
  #worker = null
  #unavailable = false
  #nextId = 1
  /** @type {{ id: number, assetId: string, kind: JobKind, request: object }[]} */
  #queue = []
  #active = null
  /** @type {Map<string, Filmstrip>} */
  #filmstrips = new Map()
  /** @type {Map<string, Peaks>} */
  #peaks = new Map()
  #requested = new Set()
  /** @type {Set<(assetId: string, kind: JobKind) => void>} */
  #listeners = new Set()

  #getWorker() {
    if (this.#worker || this.#unavailable) return this.#worker
    try {
      if (typeof Worker === 'undefined' || typeof VideoDecoder === 'undefined') throw new Error('unsupported')
      this.#worker = new Worker(new URL('../../workers/media.worker.js', import.meta.url), { type: 'module' })
      this.#worker.onmessage = (e) => this.#handle(e.data)
      this.#worker.onerror = () => {
        // Worker crashed - give up on the current job and continue with the next.
        this.#active = null
        this.#pump()
      }
    } catch {
      this.#unavailable = true
    }
    return this.#worker
  }

  /** @param {(assetId: string, kind: JobKind) => void} listener @returns {() => void} unsubscribe */
  onUpdate(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** @returns {Filmstrip | undefined} */
  getFilmstrip(assetId) {
    return this.#filmstrips.get(assetId)
  }

  /** @returns {Peaks | undefined} */
  getPeaks(assetId) {
    return this.#peaks.get(assetId)
  }

  requestFilmstrip(assetId, blob, maxFrames = 120) {
    this.#enqueue(assetId, 'filmstrip', (id) => ({ id, type: 'filmstrip', blob, height: FILMSTRIP_HEIGHT, maxFrames }))
  }

  requestPeaks(assetId, blob) {
    this.#enqueue(assetId, 'peaks', (id) => ({ id, type: 'peaks', blob, bucketsPerSecond: PEAK_BUCKETS_PER_SECOND }))
  }

  forget(assetId) {
    for (const bitmap of this.#filmstrips.get(assetId)?.bitmaps ?? []) bitmap?.close()
    this.#filmstrips.delete(assetId)
    this.#peaks.delete(assetId)
    this.#requested.delete(`filmstrip:${assetId}`)
    this.#requested.delete(`peaks:${assetId}`)
    this.#queue = this.#queue.filter((j) => j.assetId !== assetId)
    if (this.#active?.assetId === assetId) this.#worker?.postMessage({ id: this.#active.id, type: 'cancel' })
  }

  #enqueue(assetId, kind, build) {
    const key = `${kind}:${assetId}`
    if (this.#requested.has(key)) return
    this.#requested.add(key)
    const id = this.#nextId++
    this.#queue.push({ id, assetId, kind, request: build(id) })
    this.#pump()
  }

  #pump() {
    if (this.#active) return
    const worker = this.#getWorker()
    const job = this.#queue.shift()
    if (!worker || !job) return
    this.#active = job
    worker.postMessage(job.request)
  }

  #handle(msg) {
    const job = this.#active
    if (!job || job.id !== msg.id) return
    switch (msg.type) {
      case 'filmstrip-meta':
        this.#filmstrips.set(job.assetId, {
          times: msg.times,
          bitmaps: msg.times.map(() => null),
          width: msg.width,
          height: msg.height,
          interval: msg.interval,
        })
        break
      case 'filmstrip-frame': {
        const strip = this.#filmstrips.get(job.assetId)
        if (strip) {
          strip.bitmaps[msg.index] = msg.bitmap
          this.#emit(job.assetId, 'filmstrip')
        } else {
          msg.bitmap.close()
        }
        break
      }
      case 'peaks':
        this.#peaks.set(job.assetId, { data: msg.data, bucketsPerSecond: msg.bucketsPerSecond })
        this.#emit(job.assetId, 'peaks')
        break
      case 'done':
      case 'error':
        this.#active = null
        this.#pump()
        break
    }
  }

  #emit(assetId, kind) {
    for (const l of this.#listeners) l(assetId, kind)
  }
}

export const mediaAnalysis = new MediaAnalysis()
