/**
 * Media analysis worker: timeline thumbnails (filmstrips) and audio peaks.
 * Runs entirely off the main thread using WebCodecs through mediabunny.
 * The message protocol is documented in `services/media/analysis.js`.
 */
import { ALL_FORMATS, AudioSampleSink, BlobSource, CanvasSink, Input } from 'mediabunny'

const cancelled = new Set()

function post(message, transfer = []) {
  self.postMessage(message, transfer)
}

async function filmstrip(id, blob, height, maxFrames) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) throw new Error('No video track')
    if (!(await track.canDecode())) throw new Error('Video codec not supported')
    const duration = await input.computeDuration()
    const first = await track.getFirstTimestamp()
    const count = Math.max(1, Math.min(maxFrames, Math.ceil(duration / 0.5)))
    const step = duration / count
    const times = Array.from({ length: count }, (_, i) => i * step)
    const width = Math.max(1, Math.round((height * track.displayWidth) / Math.max(1, track.displayHeight)))
    const sink = new CanvasSink(track, { width, height, fit: 'cover', poolSize: 1 })
    post({ id, type: 'filmstrip-meta', times, width, height, interval: step })
    let index = 0
    for await (const wrapped of sink.canvasesAtTimestamps(times.map((t) => first + t))) {
      if (cancelled.has(id)) return
      if (wrapped) {
        const bitmap = await createImageBitmap(wrapped.canvas)
        post({ id, type: 'filmstrip-frame', index, bitmap }, [bitmap])
      }
      index++
    }
    post({ id, type: 'done' })
  } finally {
    input.dispose()
  }
}

async function peaks(id, blob, bucketsPerSecond) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track) throw new Error('No audio track')
    if (!(await track.canDecode())) throw new Error('Audio codec not supported')
    const duration = await input.computeDuration()
    const first = await track.getFirstTimestamp()
    const data = new Float32Array(Math.max(1, Math.ceil(duration * bucketsPerSecond)))
    const sink = new AudioSampleSink(track)
    let scratch = new Float32Array(0)
    for await (const sample of sink.samples()) {
      if (cancelled.has(id)) {
        sample.close()
        return
      }
      const frames = sample.numberOfFrames
      if (scratch.length < frames) scratch = new Float32Array(frames)
      const baseBucket = (sample.timestamp - first) * bucketsPerSecond
      const bucketsPerFrame = bucketsPerSecond / sample.sampleRate
      for (let ch = 0; ch < sample.numberOfChannels; ch++) {
        sample.copyTo(scratch, { planeIndex: ch, format: 'f32-planar' })
        for (let i = 0; i < frames; i++) {
          const b = Math.floor(baseBucket + i * bucketsPerFrame)
          if (b < 0 || b >= data.length) continue
          const v = Math.abs(scratch[i])
          if (v > data[b]) data[b] = v
        }
      }
      sample.close()
    }
    post({ id, type: 'peaks', data, bucketsPerSecond }, [data.buffer])
    post({ id, type: 'done' })
  } finally {
    input.dispose()
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'cancel') {
    cancelled.add(msg.id)
    return
  }
  try {
    if (msg.type === 'filmstrip') await filmstrip(msg.id, msg.blob, msg.height, msg.maxFrames)
    else if (msg.type === 'peaks') await peaks(msg.id, msg.blob, msg.bucketsPerSecond)
  } catch (error) {
    post({ id: msg.id, type: 'error', message: error instanceof Error ? error.message : String(error) })
  } finally {
    cancelled.delete(msg.id)
  }
}
