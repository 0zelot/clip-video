/**
 * Voice modulation for generated speech: tempo (keeping pitch), pitch
 * (keeping tempo), volume and effects such as radio, robot, echo or hall.
 * Everything is rendered offline into a new WAV, so the result sounds the same
 * in the preview and in the export.
 */
import { speedAndPitch, stretchAudioBuffer } from '../export/timeStretch'

/** @typedef {'none' | 'radio' | 'telephone' | 'megaphone' | 'robot' | 'alien' | 'echo' | 'hall' | 'cave' | 'underwater' | 'monster' | 'whisper'} VoiceEffect */

export const VOICE_EFFECTS = [
  { id: 'none', label: 'Natural' },
  { id: 'radio', label: 'Radio' },
  { id: 'telephone', label: 'Telephone' },
  { id: 'megaphone', label: 'Megaphone' },
  { id: 'robot', label: 'Robot' },
  { id: 'alien', label: 'Alien' },
  { id: 'echo', label: 'Echo' },
  { id: 'hall', label: 'Hall' },
  { id: 'cave', label: 'Cave' },
  { id: 'underwater', label: 'Underwater' },
  { id: 'monster', label: 'Monster' },
  { id: 'whisper', label: 'Breathy' },
]

/** One-tap character presets (pitch in semitones, rate as a multiplier). */
export const VOICE_PRESETS = [
  { id: 'natural', label: 'Natural', pitch: 0, rate: 1, effect: 'none' },
  { id: 'deep', label: 'Deep', pitch: -4, rate: 0.95, effect: 'none' },
  { id: 'giant', label: 'Giant', pitch: -8, rate: 0.85, effect: 'monster' },
  { id: 'chipmunk', label: 'Chipmunk', pitch: 7, rate: 1.15, effect: 'none' },
  { id: 'child', label: 'Child', pitch: 4, rate: 1.05, effect: 'none' },
  { id: 'old', label: 'Elderly', pitch: -2, rate: 0.85, effect: 'none' },
  { id: 'fast', label: 'Fast talker', pitch: 0, rate: 1.35, effect: 'none' },
  { id: 'robot', label: 'Robot', pitch: -1, rate: 0.95, effect: 'robot' },
  { id: 'radio', label: 'Radio host', pitch: -1, rate: 1.05, effect: 'radio' },
  { id: 'narrator', label: 'Narrator', pitch: -2, rate: 0.92, effect: 'hall' },
]

const TAILS = { echo: 1.2, hall: 2.2, cave: 3.5 }

function makeDistortionCurve(amount) {
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
  }
  return curve
}

function makeImpulse(ctx, seconds, decay) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  let seed = 1
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c)
    for (let i = 0; i < length; i++) data[i] = rand() * Math.pow(1 - i / length, decay)
  }
  return impulse
}

/**
 * Builds the effect chain between `input` and `output`.
 * @param {OfflineAudioContext} ctx
 */
function connectEffect(ctx, input, output, effect, mix) {
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  const wetAmount = Math.min(1, Math.max(0, mix))
  // Filters replace the sound (fully wet); spatial effects are blended.
  const blended = effect === 'echo' || effect === 'hall' || effect === 'cave'
  dry.gain.value = blended ? 1 : 1 - wetAmount
  wet.gain.value = wetAmount
  input.connect(dry).connect(output)
  const chain = (...nodes) => {
    let node = input
    for (const next of nodes) {
      node.connect(next)
      node = next
    }
    node.connect(wet).connect(output)
  }
  const filter = (type, frequency, q = 0.7, gain = 0) => {
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = frequency
    f.Q.value = q
    f.gain.value = gain
    return f
  }
  const shaper = (amount) => {
    const s = ctx.createWaveShaper()
    s.curve = makeDistortionCurve(amount)
    s.oversample = '2x'
    return s
  }
  const ringMod = (frequency) => {
    const carrier = ctx.createOscillator()
    carrier.frequency.value = frequency
    const vca = ctx.createGain()
    vca.gain.value = 0
    carrier.connect(vca.gain)
    carrier.start(0)
    return vca
  }
  switch (effect) {
    case 'radio':
      chain(filter('highpass', 450), filter('lowpass', 3800), filter('peaking', 1800, 1, 6), shaper(4), ctx.createDynamicsCompressor())
      break
    case 'telephone':
      chain(filter('highpass', 700, 1.2), filter('lowpass', 2800, 1.2), shaper(12))
      break
    case 'megaphone':
      chain(filter('highpass', 900), filter('lowpass', 2600), filter('peaking', 1500, 2, 10), shaper(40))
      break
    case 'robot': {
      const mod = ringMod(55)
      const delay = ctx.createDelay(0.05)
      delay.delayTime.value = 0.012
      const feedback = ctx.createGain()
      feedback.gain.value = 0.5
      delay.connect(feedback).connect(delay)
      chain(mod, delay)
      mod.connect(wet)
      break
    }
    case 'alien':
      chain(ringMod(420), filter('highpass', 200))
      break
    case 'echo': {
      const delay = ctx.createDelay(1)
      delay.delayTime.value = 0.28
      const feedback = ctx.createGain()
      feedback.gain.value = 0.42
      delay.connect(feedback).connect(delay)
      chain(delay)
      break
    }
    case 'hall':
    case 'cave': {
      const conv = ctx.createConvolver()
      conv.buffer = makeImpulse(ctx, effect === 'cave' ? 3.5 : 2.2, effect === 'cave' ? 1.6 : 3)
      chain(conv)
      break
    }
    case 'underwater':
      chain(filter('lowpass', 520, 4), filter('peaking', 300, 2, 8))
      break
    case 'monster':
      chain(filter('lowshelf', 180, 0.7, 9), shaper(8), filter('lowpass', 3000))
      break
    case 'whisper':
      chain(filter('highpass', 1800, 0.8), filter('peaking', 5000, 1, 6))
      break
    default:
      dry.gain.value = 1
      wet.gain.value = 0
  }
}

/**
 * @typedef {object} VoiceSettings
 * @property {number} [rate] tempo multiplier, 1 = unchanged (pitch is kept)
 * @property {number} [pitch] semitones (tempo is kept)
 * @property {VoiceEffect} [effect]
 * @property {number} [mix] effect amount 0..1
 * @property {number} [volume] dB, 0 = unchanged
 */

export function isNeutral(settings) {
  return (
    Math.abs((settings.rate ?? 1) - 1) < 0.005 &&
    Math.abs(settings.pitch ?? 0) < 0.05 &&
    (settings.effect ?? 'none') === 'none' &&
    Math.abs(settings.volume ?? 0) < 0.05
  )
}

/**
 * Applies tempo, pitch, effect and volume to a WAV.
 * @param {Blob} blob
 * @param {VoiceSettings} settings
 * @returns {Promise<Blob>} WAV
 */
export async function processVoice(blob, settings = {}) {
  if (isNeutral(settings)) return blob
  const rate = Math.min(3, Math.max(0.3, settings.rate ?? 1))
  const pitch = Math.min(12, Math.max(-12, settings.pitch ?? 0))
  const effect = settings.effect ?? 'none'
  const decoder = new OfflineAudioContext(1, 1, 44100)
  const decoded = await decoder.decodeAudioData(await blob.arrayBuffer())
  const sampleRate = decoded.sampleRate
  const length = Math.ceil((decoded.duration / rate + (TAILS[effect] ?? 0) + 0.05) * sampleRate)
  const ctx = new OfflineAudioContext(2, length, sampleRate)
  const { playbackRate, stretchFactor } = speedAndPitch(rate, pitch)
  const source = ctx.createBufferSource()
  source.buffer = stretchAudioBuffer(ctx, decoded, stretchFactor)
  source.playbackRate.value = playbackRate
  const gain = ctx.createGain()
  gain.gain.value = Math.pow(10, (settings.volume ?? 0) / 20)
  connectEffect(ctx, source, gain, effect, settings.mix ?? 0.8)
  gain.connect(ctx.destination)
  source.start(0)
  const rendered = await ctx.startRendering()
  return encodeWav(trimSilence(rendered))
}

/** Drops the silent end of an effect tail. */
function trimSilence(buffer) {
  let last = 0
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = data.length - 1; i > last; i--) {
      if (Math.abs(data[i]) > 0.002) {
        last = i
        break
      }
    }
  }
  return { numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, length: Math.min(buffer.length, last + Math.round(buffer.sampleRate * 0.05)), getChannelData: (c) => buffer.getChannelData(c) }
}

/** 16-bit PCM WAV encoder (accepts an AudioBuffer-like object). */
export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const bytes = 44 + length * channels * 2
  const view = new DataView(new ArrayBuffer(bytes))
  const writeString = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, bytes - 8, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, length * channels * 2, true)
  const data = []
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]))
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' })
}

const EFFECT_IDS = new Set(VOICE_EFFECTS.map((e) => e.id))

/**
 * Per-line overrides written in square brackets after the speaker name, e.g.
 * `A [+3, 1.2x, echo, loud, pause 1]: text`.
 * @returns {{ pitch?: number, rate?: number, effect?: VoiceEffect, volume?: number, pause?: number }}
 */
export function parseOverrides(text) {
  const out = {}
  for (const raw of text.split(/[,;]+/)) {
    const token = raw.trim().toLowerCase()
    if (!token) continue
    let m
    if ((m = /^([+-]\d+(?:\.\d+)?)\s*(?:st|semitones?)?$/.exec(token))) out.pitch = Number(m[1])
    else if ((m = /^(?:x\s*)?(\d+(?:\.\d+)?)\s*x$/.exec(token)) || (m = /^x\s*(\d+(?:\.\d+)?)$/.exec(token))) out.rate = Number(m[1])
    else if ((m = /^(?:pause|wait|gap)\s*(\d+(?:\.\d+)?)\s*s?$/.exec(token))) out.pause = Number(m[1])
    else if (token === 'fast') out.rate = 1.25
    else if (token === 'slow') out.rate = 0.8
    else if (token === 'high') out.pitch = 3
    else if (token === 'low') out.pitch = -3
    else if (token === 'loud') out.volume = 4
    else if (token === 'quiet') out.volume = -6
    else if (EFFECT_IDS.has(token)) out.effect = token
  }
  return out
}
