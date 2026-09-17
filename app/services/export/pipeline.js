/**
 * Export pipeline: renders every frame with the shared compositor and encodes
 * video + audio with WebCodecs (via mediabunny).
 *
 * The code has no DOM dependencies, so it runs inside the export worker
 * (OffscreenCanvas) and - as a fallback - on the main thread.
 */
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny'
import { projectDuration } from '../../core/model/queries'
import { collectVisualLayers, renderFrame } from '../../core/render/compositor'
import { ExportCancelledError } from './types'

/**
 * @typedef {object} PipelineHooks
 * @property {(width: number, height: number) => (OffscreenCanvas | HTMLCanvasElement)} createCanvas
 * @property {(progress: import('./types').ExportProgress) => void} onProgress
 * @property {() => boolean} isCancelled
 */

/** Sequential frame reader for one video file - decodes forward, re-seeks on jumps. */
class VideoFrameReader {
  #input
  #track
  #firstTimestamp
  #sink
  #iterator = null
  #current = null
  #next = null
  #exhausted = false
  #lastRequest = Number.NEGATIVE_INFINITY

  constructor(input, track, firstTimestamp) {
    this.#input = input
    this.#track = track
    this.#firstTimestamp = firstTimestamp
    this.#sink = new VideoSampleSink(track)
  }

  /** @returns {Promise<VideoFrameReader | null>} */
  static async open(blob) {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) })
    const track = await input.getPrimaryVideoTrack()
    if (!track || !(await track.canDecode())) {
      input.dispose()
      return null
    }
    return new VideoFrameReader(input, track, await track.getFirstTimestamp())
  }

  async #pull() {
    if (!this.#iterator || this.#exhausted) return null
    const r = await this.#iterator.next()
    if (r.done) {
      this.#exhausted = true
      return null
    }
    return r.value
  }

  async #reset(ts) {
    this.#current?.close()
    this.#next?.close()
    this.#current = null
    this.#next = null
    await this.#iterator?.return()
    this.#exhausted = false
    this.#iterator = this.#sink.samples(ts)
    this.#current = await this.#pull()
    this.#next = await this.#pull()
  }

  /** @returns {Promise<import('mediabunny').VideoSample | null>} */
  async frameAt(sourceTime) {
    const ts = Math.max(this.#firstTimestamp, this.#firstTimestamp + sourceTime)
    const jumpedBack = ts < this.#lastRequest - 1e-6
    const jumpedFar = this.#current !== null && ts - this.#current.timestamp > 2.5
    if (!this.#iterator || jumpedBack || jumpedFar) await this.#reset(ts)
    this.#lastRequest = ts
    while (this.#next && this.#next.timestamp <= ts + 1e-4) {
      this.#current?.close()
      this.#current = this.#next
      this.#next = await this.#pull()
    }
    return this.#current
  }

  get displaySize() {
    return { width: this.#track.displayWidth, height: this.#track.displayHeight }
  }

  async close() {
    this.#current?.close()
    this.#next?.close()
    await this.#iterator?.return().catch(() => {})
    this.#input.dispose()
  }
}

/**
 * Registers custom fonts with the rendering context (worker or document) so
 * text and captions export with the right typeface.
 */
async function registerFonts(fonts) {
  if (!fonts?.length || typeof FontFace === 'undefined') return
  const target = typeof self !== 'undefined' && self.fonts ? self.fonts : typeof document !== 'undefined' ? document.fonts : null
  if (!target) return
  await Promise.all(
    fonts.map(async ({ family, blob }) => {
      try {
        const face = await new FontFace(family, await blob.arrayBuffer()).load()
        target.add(face)
      } catch {
        // A missing font falls back to the default stack.
      }
    }),
  )
}

function even(n) {
  return Math.max(2, Math.round(n / 2) * 2)
}

async function resolveCodecs(job, width, height) {
  const warnings = []
  const bitrate = job.options.videoBitrate
  const tryContainer = async (container) => {
    const format = container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat()
    const videoPreference = container === 'mp4' ? ['avc', 'hevc', 'vp9', 'av1'] : ['vp9', 'vp8', 'av1']
    const supportedVideo = format.getSupportedVideoCodecs()
    const videoCodec = await getFirstEncodableVideoCodec(
      videoPreference.filter((c) => supportedVideo.includes(c)),
      { width, height, bitrate },
    )
    const audioPreference = container === 'mp4' ? ['aac', 'opus'] : ['opus', 'vorbis']
    const supportedAudio = format.getSupportedAudioCodecs()
    const audioCodec = job.audio
      ? await getFirstEncodableAudioCodec(
          audioPreference.filter((c) => supportedAudio.includes(c)),
          {
            numberOfChannels: job.audio.channels.length,
            sampleRate: job.audio.sampleRate,
            bitrate: job.options.audioBitrate,
          },
        )
      : null
    return { format, container, videoCodec, audioCodec }
  }

  let resolved = await tryContainer(job.options.container)
  if (!resolved.videoCodec) {
    const other = job.options.container === 'mp4' ? 'webm' : 'mp4'
    const fallback = await tryContainer(other)
    if (fallback.videoCodec) {
      warnings.push(`${job.options.container.toUpperCase()} encoding is not supported by this browser - exported as ${other.toUpperCase()} instead.`)
      resolved = fallback
    }
  }
  if (!resolved.videoCodec) throw new Error('This browser cannot encode video (no supported WebCodecs encoder found).')
  if (job.options.container === 'mp4' && resolved.container === 'mp4' && resolved.videoCodec !== 'avc') {
    warnings.push(`H.264 is not available - used ${resolved.videoCodec.toUpperCase()} instead.`)
  }
  if (job.audio && !resolved.audioCodec) warnings.push('No audio encoder is available in this browser - the video was exported without sound.')
  else if (resolved.container === 'mp4' && resolved.audioCodec && resolved.audioCodec !== 'aac') {
    warnings.push(`AAC is not available - audio was encoded as ${resolved.audioCodec.toUpperCase()}.`)
  }
  return { ...resolved, warnings }
}

/**
 * @param {import('./types').ExportJob} job
 * @param {PipelineHooks} hooks
 * @returns {Promise<import('./types').ExportResult>}
 */
export async function runExportPipeline(job, hooks) {
  const { project, options } = job
  const duration = projectDuration(project)
  if (duration <= 0) throw new Error('The timeline is empty.')

  const width = even(options.width)
  const height = even(options.height)
  const fps = options.fps
  const totalFrames = Math.max(1, Math.round(duration * fps))
  const scale = width / project.settings.width

  await registerFonts(job.fonts)
  const { format, container, videoCodec, audioCodec, warnings } = await resolveCodecs(job, width, height)

  const canvas = hooks.createCanvas(width, height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Could not create a 2D canvas for rendering.')

  const output = new Output({ format, target: new BufferTarget() })
  const videoSource = new CanvasSource(canvas, {
    codec: videoCodec,
    bitrate: options.videoBitrate,
    keyFrameInterval: 2,
    latencyMode: 'quality',
  })
  output.addVideoTrack(videoSource, { frameRate: fps })
  const audioSource = audioCodec && job.audio ? new AudioSampleSource({ codec: audioCodec, bitrate: options.audioBitrate }) : null
  if (audioSource) output.addAudioTrack(audioSource)

  // Media readers
  /** @type {Map<string, Promise<VideoFrameReader | null>>} */
  const readers = new Map()
  /** @type {Map<string, Promise<ImageBitmap | null>>} */
  const images = new Map()
  const getReader = (assetId, itemId) => {
    // One reader per item keeps decoding sequential even when two clips share a file.
    let reader = readers.get(itemId)
    if (!reader) {
      const blob = job.blobs[assetId]
      reader = blob ? VideoFrameReader.open(blob).catch(() => null) : Promise.resolve(null)
      readers.set(itemId, reader)
    }
    return reader
  }
  const getImage = (assetId) => {
    let image = images.get(assetId)
    if (!image) {
      const blob = job.blobs[assetId]
      image = blob ? createImageBitmap(blob).catch(() => null) : Promise.resolve(null)
      images.set(assetId, image)
    }
    return image
  }

  const report = (framesDone, phase) =>
    hooks.onProgress({ phase, progress: framesDone / totalFrames, framesDone, framesTotal: totalFrames })

  let cancelled = false
  try {
    await output.start()

    const audio = job.audio
    const audioChunk = audio ? Math.round(audio.sampleRate / 2) : 0
    let audioWritten = 0
    const writeAudioUntil = async (time) => {
      if (!audio || !audioSource) return
      const totalAudioFrames = audio.channels[0].length
      const target = Math.min(totalAudioFrames, Math.ceil(time * audio.sampleRate))
      while (audioWritten < target) {
        const count = Math.min(audioChunk, totalAudioFrames - audioWritten)
        const data = new Float32Array(count * audio.channels.length)
        audio.channels.forEach((ch, i) => data.set(ch.subarray(audioWritten, audioWritten + count), i * count))
        const sample = new AudioSample({
          data,
          format: 'f32-planar',
          numberOfChannels: audio.channels.length,
          sampleRate: audio.sampleRate,
          timestamp: audioWritten / audio.sampleRate,
        })
        await audioSource.add(sample)
        sample.close()
        audioWritten += count
      }
    }

    // Decoded samples are converted to drawable images only at draw time: the
    // VideoFrame returned by `toCanvasImageSource` may be closed after a microtask.
    const frames = new Map()
    const provider = {
      getFrame: (item) => {
        const frame = frames.get(item.id)
        if (!frame) return 'missing'
        if (frame === 'missing') return frame
        if ('toCanvasImageSource' in frame) {
          return { image: frame.toCanvasImageSource(), width: frame.displayWidth, height: frame.displayHeight }
        }
        return frame
      },
    }
    const activeReaders = new Set()

    for (let i = 0; i < totalFrames; i++) {
      if (hooks.isCancelled()) {
        cancelled = true
        throw new ExportCancelledError()
      }
      const t = i / fps
      frames.clear()
      const layers = collectVisualLayers(project, t)
      const needed = new Set()

      // Background blur needs the bottom layer as well; it is part of `layers`.
      for (const layer of layers) {
        const { item } = layer
        if (item.type === 'image') {
          const bitmap = await getImage(item.assetId)
          frames.set(item.id, bitmap ? { image: bitmap, width: bitmap.width, height: bitmap.height } : 'missing')
        } else {
          needed.add(item.id)
          const reader = await getReader(item.assetId, item.id)
          const sample = reader ? await reader.frameAt(layer.sourceTime) : null
          if (sample) {
            frames.set(item.id, sample)
          } else {
            frames.set(item.id, 'missing')
          }
        }
      }

      renderFrame(ctx, project, t, provider, { scale })
      await videoSource.add(t, 1 / fps)
      await writeAudioUntil(t + 1 / fps)

      // Close readers of items that are no longer on screen.
      for (const id of needed) activeReaders.add(id)
      for (const id of [...activeReaders]) {
        if (needed.has(id)) continue
        activeReaders.delete(id)
        const reader = readers.get(id)
        readers.delete(id)
        void reader?.then((r) => r?.close())
      }

      if (i % 5 === 0) report(i + 1, 'video')
    }

    await writeAudioUntil(Number.POSITIVE_INFINITY)
    hooks.onProgress({ phase: 'finalizing', progress: 1, framesDone: totalFrames, framesTotal: totalFrames })
    videoSource.close()
    audioSource?.close()
    await output.finalize()

    const buffer = output.target.buffer
    if (!buffer) throw new Error('Encoder produced no output.')
    return {
      buffer,
      mimeType: format.mimeType,
      extension: container,
      videoCodec,
      audioCodec: audioSource ? audioCodec : null,
      warnings,
    }
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {})
    if (cancelled) throw new ExportCancelledError()
    throw error
  } finally {
    for (const reader of readers.values()) void reader.then((r) => r?.close())
    for (const image of images.values()) void image.then((b) => b?.close())
  }
}
