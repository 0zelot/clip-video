/**
 * Offline audio mixdown.
 *
 * Decodes only the used ranges of each audible item (WebCodecs via
 * mediabunny) and renders the mix chunk by chunk with OfflineAudioContexts
 * (on the main thread - workers have no Web Audio). The export worker asks for
 * chunks as its video encoding progresses.
 */
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'
import { projectDuration } from '../../core/model/queries'
import { consumedAt, rampLengths } from '../../core/time'
import { speedAndPitch, stretchAudioBuffer } from './timeStretch'
import { ExportCancelledError } from './types'

function collectAudible(project) {
  const result = []
  for (const track of project.tracks) {
    if (track.muted) continue
    for (const item of track.items) {
      if (item.type !== 'video' && item.type !== 'audio') continue
      if (item.audio.muted || item.audio.volume <= 0) continue
      const asset = project.assets[item.assetId]
      if (!asset || (item.type === 'video' && asset.hasAudio === false)) continue
      result.push(item)
    }
  }
  return result
}

export function projectHasAudio(project) {
  return collectAudible(project).length > 0
}

/** Timeline sub-ranges of a ramped clip: short slices in the ramps, one for the hold. */
function rampSegments(item) {
  const { rampIn, rampOut } = rampLengths(item)
  const segments = []
  const slice = (from, to) => {
    const n = Math.max(1, Math.ceil((to - from) / 0.15))
    for (let i = 0; i < n; i++) segments.push([from + ((to - from) * i) / n, from + ((to - from) * (i + 1)) / n])
  }
  if (rampIn > 0) slice(0, rampIn)
  const holdEnd = item.duration - rampOut
  if (holdEnd - rampIn > 1e-3) segments.push([rampIn, holdEnd])
  if (rampOut > 0) slice(holdEnd, item.duration)
  return segments
}

/** Gain of a clip at timeline time `t` (volume and fades). */
function gainAt(item, t) {
  const v = item.audio.volume
  const end = item.start + item.duration
  let k = 1
  if (item.audio.fadeIn > 0) k = Math.min(k, (t - item.start) / item.audio.fadeIn)
  if (item.audio.fadeOut > 0) k = Math.min(k, (end - t) / item.audio.fadeOut)
  return v * Math.min(1, Math.max(0, k))
}

/**
 * Splits the timeline range [a, b) of a clip into pieces of continuous source
 * media: `{ t0, t1, s0, s1 }` (timeline and source seconds). Loops wrap around
 * the end of the file; speed ramps become short constant-speed slices.
 */
function sourcePieces(item, a, b, assetDuration) {
  const la = a - item.start
  const lb = b - item.start
  const local = item.speedRamp && !item.reversed
    ? rampSegments(item).map(([x, y]) => [Math.max(x, la), Math.min(y, lb)]).filter(([x, y]) => y - x > 1e-4)
    : [[la, lb]]
  const pieces = []
  for (const [x, y] of local) {
    const s0 = item.sourceIn + consumedAt(item, x)
    const s1 = item.sourceIn + consumedAt(item, y)
    const loops = item.type === 'audio' && item.loop && assetDuration > 0
    if (!loops) {
      pieces.push({ t0: item.start + x, t1: item.start + y, s0, s1 })
      continue
    }
    // Wrap at the end of the file.
    const rate = (s1 - s0) / Math.max(1e-9, y - x)
    let t = x
    let s = s0
    while (t < y - 1e-6) {
      const wrapped = ((s % assetDuration) + assetDuration) % assetDuration
      const room = (assetDuration - wrapped) / rate
      const step = Math.min(y - t, room)
      pieces.push({ t0: item.start + t, t1: item.start + t + step, s0: wrapped, s1: wrapped + step * rate })
      t += step
      s += step * rate
    }
  }
  return pieces
}

/**
 * Streaming mixdown: renders the soundtrack in short chunks, so even a feature
 * length project never needs more than a few seconds of PCM in memory.
 *
 * @param {import('../../core/model/types').Project} project
 * @param {Record<string, Blob>} blobs
 * @param {{ sampleRate?: number, chunkSeconds?: number }} [options]
 */
export function createAudioMixer(project, blobs, options = {}) {
  const audible = collectAudible(project).filter((item) => blobs[item.assetId])
  const duration = projectDuration(project)
  if (audible.length === 0 || duration <= 0 || typeof OfflineAudioContext === 'undefined') return null
  const sampleRate = options.sampleRate ?? 48000
  const chunkSeconds = options.chunkSeconds ?? 20
  const chunkCount = Math.ceil(duration / chunkSeconds)
  /** @type {Map<string, Promise<{ input: Input, track: any, first: number } | null>>} */
  const opened = new Map()

  const open = (assetId) => {
    let entry = opened.get(assetId)
    if (!entry) {
      entry = (async () => {
        const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blobs[assetId]) })
        const track = await input.getPrimaryAudioTrack()
        if (!track || !(await track.canDecode())) {
          input.dispose()
          return null
        }
        return { input, track, first: await track.getFirstTimestamp() }
      })().catch(() => null)
      opened.set(assetId, entry)
    }
    return entry
  }

  async function decode(ctx, assetId, from, to, signal) {
    const src = await open(assetId)
    if (!src) return null
    const { track, first } = src
    const rate = track.sampleRate
    const channels = track.numberOfChannels
    const length = Math.max(1, Math.ceil((to - from) * rate))
    const out = ctx.createBuffer(channels, length, rate)
    const sink = new AudioBufferSink(track)
    for await (const { buffer, timestamp } of sink.buffers(first + from, first + to)) {
      if (signal?.aborted) throw new ExportCancelledError()
      const offset = Math.round((timestamp - first - from) * rate)
      for (let ch = 0; ch < channels; ch++) {
        const data = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1))
        const dst = out.getChannelData(ch)
        const skip = Math.max(0, -offset)
        const start = Math.max(0, offset)
        const count = Math.min(data.length - skip, length - start)
        if (count > 0) dst.set(data.subarray(skip, skip + count), start)
      }
    }
    return out
  }

  /**
   * @param {number} index
   * @param {AbortSignal} [signal]
   * @returns {Promise<{ sampleRate: number, channels: Float32Array[] }>}
   */
  async function renderChunk(index, signal) {
    const w0 = index * chunkSeconds
    const w1 = Math.min(duration, w0 + chunkSeconds)
    const frames = Math.max(1, Math.round((w1 - w0) * sampleRate))
    const ctx = new OfflineAudioContext(2, frames, sampleRate)
    for (const item of audible) {
      if (signal?.aborted) throw new ExportCancelledError()
      const end = item.start + item.duration
      const a = Math.max(w0, item.start)
      const b = Math.min(w1, end)
      if (b - a < 1e-4) continue
      const assetDuration = project.assets[item.assetId]?.duration ?? 0

      const gain = ctx.createGain()
      const points = [a, b, item.start + item.audio.fadeIn, end - item.audio.fadeOut].filter((t) => t >= a && t <= b).sort((x, y) => x - y)
      gain.gain.setValueAtTime(gainAt(item, a), a - w0)
      for (const t of points) if (t > a) gain.gain.linearRampToValueAtTime(gainAt(item, t), t - w0)
      gain.connect(ctx.destination)

      for (const piece of sourcePieces(item, a, b, assetDuration)) {
        const srcTo = assetDuration > 0 ? Math.min(piece.s1, assetDuration) : piece.s1
        if (srcTo - piece.s0 < 1e-3) continue
        const decoded = await decode(ctx, item.assetId, piece.s0, srcTo, signal)
        if (!decoded) break
        const speed = (piece.s1 - piece.s0) / Math.max(1e-9, piece.t1 - piece.t0)
        const { playbackRate, stretchFactor } = speedAndPitch(speed, item.audio.pitch)
        const buffer = Math.abs(stretchFactor - 1) > 0.002 ? stretchAudioBuffer(ctx, decoded, stretchFactor) : decoded
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.playbackRate.value = playbackRate
        source.connect(gain)
        source.start(piece.t0 - w0, 0)
        source.stop(Math.min(w1, piece.t1 + 0.004) - w0)
      }
    }
    const rendered = await ctx.startRendering()
    return { sampleRate, channels: [rendered.getChannelData(0).slice(), rendered.getChannelData(1).slice()] }
  }

  return {
    sampleRate,
    chunkSeconds,
    chunkCount,
    duration,
    renderChunk,
    close() {
      for (const entry of opened.values()) void entry.then((e) => e?.input.dispose())
      opened.clear()
    },
  }
}
