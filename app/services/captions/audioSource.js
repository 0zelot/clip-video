/**
 * Decodes a media file into the mono 16 kHz PCM that speech recognition needs.
 * Everything happens locally: mediabunny decodes with WebCodecs, the resampling
 * is done by an OfflineAudioContext.
 */
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'

const TARGET_SAMPLE_RATE = 16000

/**
 * @param {Blob} blob
 * @param {{ onProgress?: (ratio: number) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<{ samples: Float32Array, sampleRate: number, duration: number }>}
 */
export async function decodeForSpeech(blob, options = {}) {
  if (typeof OfflineAudioContext === 'undefined') throw new Error('This browser cannot decode audio for transcription.')
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track) throw new Error('This file has no audio track.')
    if (!(await track.canDecode())) throw new Error('This browser cannot decode the audio of this file.')

    const duration = await input.computeDuration()
    const sourceRate = track.sampleRate
    const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(duration * TARGET_SAMPLE_RATE)), TARGET_SAMPLE_RATE)
    const buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(duration * sourceRate)), sourceRate)
    const mono = buffer.getChannelData(0)

    const sink = new AudioBufferSink(track)
    const first = await track.getFirstTimestamp()
    for await (const { buffer: chunk, timestamp } of sink.buffers()) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const offset = Math.round((timestamp - first) * sourceRate)
      const channels = chunk.numberOfChannels
      for (let i = 0; i < chunk.length; i++) {
        const target = offset + i
        if (target < 0 || target >= mono.length) continue
        let sum = 0
        for (let c = 0; c < channels; c++) sum += chunk.getChannelData(c)[i]
        mono[target] = sum / channels
      }
      options.onProgress?.(Math.min(1, timestamp / Math.max(duration, 0.001)))
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start()
    const rendered = await ctx.startRendering()
    return { samples: rendered.getChannelData(0).slice(), sampleRate: TARGET_SAMPLE_RATE, duration }
  } finally {
    input.dispose()
  }
}
