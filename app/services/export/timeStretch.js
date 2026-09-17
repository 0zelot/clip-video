/**
 * WSOLA time stretching.
 *
 * Used by the exporter so that changing a clip's speed (or its pitch) does not
 * turn voices into chipmunks: the audio is stretched in the time domain and the
 * remaining resampling is done by the Web Audio graph.
 *
 * The algorithm overlap-adds short windows, picking the offset with the best
 * correlation to the previous output so waveforms stay in phase.
 */

const FRAME_MS = 0.06
const SEARCH_MS = 0.012
// Correlation is computed on a decimated signal - plenty for speech and music,
// and about 16x cheaper than the full-resolution search.
const DECIMATION = 4
const CORRELATION_WINDOW = 512

function hann(length) {
  const w = new Float32Array(length)
  for (let i = 0; i < length; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1))
  return w
}

/**
 * @param {Float32Array[]} channels input PCM
 * @param {number} sampleRate
 * @param {number} factor output length / input length (0.25 .. 4)
 * @returns {Float32Array[]} stretched PCM
 */
export function timeStretch(channels, sampleRate, factor) {
  if (!channels.length || Math.abs(factor - 1) < 0.002) return channels
  const clamped = Math.min(6, Math.max(0.15, factor))
  const inputLength = channels[0].length
  const frame = Math.max(256, Math.round(sampleRate * FRAME_MS))
  const overlap = frame >> 1
  const synthesisHop = frame - overlap
  const analysisHop = Math.max(1, Math.round(synthesisHop / clamped))
  const search = Math.max(1, Math.round(sampleRate * SEARCH_MS))
  const window = hann(frame)

  const outputLength = Math.max(frame, Math.ceil(inputLength * clamped) + frame)
  const output = channels.map(() => new Float32Array(outputLength))
  const reference = channels[0]

  let inputPos = 0
  let outputPos = 0
  let written = 0

  while (inputPos + frame + search < inputLength && outputPos + frame < outputLength) {
    let bestOffset = 0
    if (outputPos > 0) {
      // Find the input offset whose start matches the tail we already wrote.
      let bestScore = -Infinity
      const tailStart = outputPos
      for (let offset = -search; offset <= search; offset += DECIMATION) {
        const candidate = inputPos + offset
        if (candidate < 0 || candidate + CORRELATION_WINDOW >= inputLength) continue
        let score = 0
        for (let i = 0; i < CORRELATION_WINDOW; i += DECIMATION) {
          score += reference[candidate + i] * (output[0][tailStart + i] ?? 0)
        }
        if (score > bestScore) {
          bestScore = score
          bestOffset = offset
        }
      }
    }

    const readPos = Math.max(0, Math.min(inputLength - frame - 1, inputPos + bestOffset))
    for (let c = 0; c < channels.length; c++) {
      const input = channels[c]
      const out = output[c]
      for (let i = 0; i < frame; i++) {
        out[outputPos + i] += input[readPos + i] * window[i]
      }
    }

    written = outputPos + frame
    outputPos += synthesisHop
    inputPos += analysisHop
  }

  // Hann windows at 50% overlap sum to 1, except at the very first half window.
  const fadeIn = Math.min(overlap, written)
  for (let c = 0; c < output.length; c++) {
    for (let i = 0; i < fadeIn; i++) {
      const w = window[i]
      if (w > 0.01) output[c][i] /= w
    }
  }

  const finalLength = Math.max(1, Math.min(outputLength, Math.round(inputLength * clamped)))
  return output.map((data) => data.subarray(0, finalLength))
}

/**
 * Stretches an AudioBuffer, returning a new buffer of the requested length.
 * @param {BaseAudioContext} ctx
 * @param {AudioBuffer} buffer
 * @param {number} factor
 */
export function stretchAudioBuffer(ctx, buffer, factor) {
  if (Math.abs(factor - 1) < 0.002) return buffer
  const channels = []
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c))
  const stretched = timeStretch(channels, buffer.sampleRate, factor)
  const result = ctx.createBuffer(buffer.numberOfChannels, stretched[0].length, buffer.sampleRate)
  for (let c = 0; c < buffer.numberOfChannels; c++) result.copyToChannel(stretched[c], c)
  return result
}

/** Playback rate and stretch factor that realise a speed + pitch combination. */
export function speedAndPitch(speed, semitones) {
  const pitchRatio = Math.pow(2, (semitones ?? 0) / 12)
  return { playbackRate: pitchRatio, stretchFactor: pitchRatio / speed }
}
