import { projectDuration } from '../../core/model/queries'
import { MediaElementPool } from './MediaElementPool'

/**
 * Master clock of the preview.
 *
 * The current time is deliberately NOT a Vue ref: it changes on every
 * animation frame, and only a handful of consumers (preview canvas, playhead,
 * time display) need it. They subscribe via `onTime` and update the DOM
 * directly, so playback never triggers component re-renders.
 */
export class PlaybackEngine {
  media = new MediaElementPool()
  masterVolume = 1

  #time = 0
  #playing = false
  #startWall = 0
  #startTime = 0
  #raf = 0
  /** @type {Set<(time: number) => void>} */
  #timeListeners = new Set()
  /** @type {Set<(playing: boolean) => void>} */
  #stateListeners = new Set()
  #getProject

  /** @param {() => (import('../../core/model/types').Project | null)} getProject */
  constructor(getProject) {
    this.#getProject = getProject
    this.media.onFrameReady = () => this.#emitTime()
  }

  get time() {
    return this.#time
  }

  get playing() {
    return this.#playing
  }

  get duration() {
    const project = this.#getProject()
    return project ? projectDuration(project) : 0
  }

  /** @param {(time: number) => void} listener @returns {() => void} unsubscribe */
  onTime(listener) {
    this.#timeListeners.add(listener)
    listener(this.#time)
    return () => this.#timeListeners.delete(listener)
  }

  /** @param {(playing: boolean) => void} listener @returns {() => void} unsubscribe */
  onStateChange(listener) {
    this.#stateListeners.add(listener)
    return () => this.#stateListeners.delete(listener)
  }

  play() {
    if (this.#playing) return
    const duration = this.duration
    if (duration <= 0) return
    if (this.#time >= duration - 1e-3) this.#time = 0
    // play() runs inside the click / key press - the only moment strict
    // browsers let us unlock the elements that later clips will play on.
    this.media.unlock()
    this.#playing = true
    this.#startWall = performance.now()
    this.#startTime = this.#time
    this.#syncMedia()
    this.#emitState()
    this.#raf = requestAnimationFrame(this.#tick)
  }

  pause() {
    if (!this.#playing) return
    this.#playing = false
    cancelAnimationFrame(this.#raf)
    this.media.pauseAll()
    this.#syncMedia()
    this.#emitState()
    this.#emitTime()
  }

  toggle() {
    if (this.#playing) this.pause()
    else this.play()
  }

  seek(time) {
    const t = Math.max(0, Math.min(time, Math.max(this.duration, 0)))
    this.#time = t
    if (this.#playing) {
      this.#startWall = performance.now()
      this.#startTime = t
    }
    this.#syncMedia()
    this.#emitTime()
  }

  /** Re-synchronises media and re-renders after a project change. */
  refresh() {
    this.#syncMedia()
    this.#emitTime()
  }

  #tick = (now) => {
    if (!this.#playing) return
    const duration = this.duration
    this.#time = this.#startTime + (now - this.#startWall) / 1000
    if (this.#time >= duration) {
      this.#time = duration
      this.#syncMedia()
      this.#emitTime()
      this.pause()
      return
    }
    this.#syncMedia()
    this.#emitTime()
    this.#raf = requestAnimationFrame(this.#tick)
  }

  #syncMedia() {
    const project = this.#getProject()
    if (project) this.media.sync(project, this.#time, this.#playing, this.masterVolume)
  }

  #emitTime() {
    for (const l of this.#timeListeners) l(this.#time)
  }

  #emitState() {
    for (const l of this.#stateListeners) l(this.#playing)
  }

  destroy() {
    cancelAnimationFrame(this.#raf)
    this.#playing = false
    this.media.destroy()
    this.#timeListeners.clear()
    this.#stateListeners.clear()
  }
}
