/**
 * Offline audio mixdown.
 *
 * Decodes only the used ranges of each audible item (WebCodecs via
 * mediabunny) and renders the final mix with an OfflineAudioContext, which
 * runs on the browser's audio thread. The resulting PCM is handed to the
 * export worker for encoding.
 */
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'
import { projectDuration } from '../../core/model/queries'
import { sourceOut } from '../../core/time'
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

/** Decodes [from, to) of a file's primary audio track into a single AudioBuffer. */
async function decodeRange(ctx, blob, from, to, signal) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track || !(await track.canDecode())) return null
    const first = await track.getFirstTimestamp()
    const sampleRate = track.sampleRate
    const channels = track.numberOfChannels
    const length = Math.max(1, Math.ceil((to - from) * sampleRate))
    const out = ctx.createBuffer(channels, length, sampleRate)
    const sink = new AudioBufferSink(track)
    for await (const { buffer, timestamp } of sink.buffers(first + from, first + to)) {
      if (signal?.aborted) throw new ExportCancelledError()
      const offset = Math.round((timestamp - first - from) * sampleRate)
      for (let ch = 0; ch < channels; ch++) {
        const src = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1))
        const dst = out.getChannelData(ch)
        const skip = Math.max(0, -offset)
        const start = Math.max(0, offset)
        const count = Math.min(src.length - skip, length - start)
        if (count > 0) dst.set(src.subarray(skip, skip + count), start)
      }
    }
    return out
  } finally {
    input.dispose()
  }
}

/**
 * @param {import('../../core/model/types').Project} project
 * @param {Record<string, Blob>} blobs
 * @param {{ sampleRate?: number, onProgress?: (p: number) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<import('./types').MixedAudio | null>}
 */
export async function mixProjectAudio(project, blobs, options = {}) {
  const audible = collectAudible(project).filter((item) => blobs[item.assetId])
  const duration = projectDuration(project)
  if (audible.length === 0 || duration <= 0 || typeof OfflineAudioContext === 'undefined') return null

  const sampleRate = options.sampleRate ?? 48000
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate)

  let done = 0
  for (const item of audible) {
    if (options.signal?.aborted) throw new ExportCancelledError()
    const asset = project.assets[item.assetId]
    const loops = item.type === 'audio' && item.loop
    const assetDuration = asset?.duration ?? sourceOut(item)
    const from = loops ? 0 : item.sourceIn
    const to = loops ? assetDuration : Math.min(sourceOut(item), assetDuration)
    let buffer = await decodeRange(ctx, blobs[item.assetId], from, to, options.signal)
    done++
    options.onProgress?.(done / (audible.length + 1))
    if (!buffer) continue

    // Speed changes keep the original pitch (time stretching), and an explicit
    // pitch shift is realised by stretching first and resampling afterwards.
    const { playbackRate, stretchFactor } = speedAndPitch(item.speed, item.audio.pitch)
    if (Math.abs(stretchFactor - 1) > 0.002) buffer = stretchAudioBuffer(ctx, buffer, stretchFactor)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = playbackRate
    const gain = ctx.createGain()
    const end = item.start + item.duration
    const volume = item.audio.volume
    gain.gain.setValueAtTime(item.audio.fadeIn > 0 ? 0 : volume, item.start)
    if (item.audio.fadeIn > 0) gain.gain.linearRampToValueAtTime(volume, item.start + item.audio.fadeIn)
    if (item.audio.fadeOut > 0) {
      gain.gain.setValueAtTime(volume, Math.max(item.start, end - item.audio.fadeOut))
      gain.gain.linearRampToValueAtTime(0, end)
    }
    source.connect(gain).connect(ctx.destination)
    if (loops) {
      source.loop = true
      source.start(item.start, item.sourceIn % Math.max(buffer.duration, 1e-3))
    } else {
      source.start(item.start, 0)
    }
    source.stop(end)
  }

  const rendered = await ctx.startRendering()
  options.onProgress?.(1)
  return {
    sampleRate,
    channels: [rendered.getChannelData(0).slice(), rendered.getChannelData(1).slice()],
  }
}
