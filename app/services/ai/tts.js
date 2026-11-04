/**
 * On-device text to speech (Piper voices via vits-web).
 *
 * Each voice (~20-60 MB) is downloaded once and stored in the browser's
 * private file system (OPFS); afterwards speech is generated offline. The text
 * never leaves the device.
 *
 * Pitch and speed of a speaker are baked into the generated WAV, so the clip
 * sounds the same in the preview and in the export.
 */
import { speedAndPitch, stretchAudioBuffer } from '../export/timeStretch'

/** Curated voices (Polish first), id → label. Any Piper voice id works. */
export const TTS_VOICES = [
  { id: 'pl_PL-gosia-medium', label: 'Gosia', lang: 'Polski', gender: 'F' },
  { id: 'pl_PL-darkman-medium', label: 'Darkman', lang: 'Polski', gender: 'M' },
  { id: 'pl_PL-mc_speech-medium', label: 'MC Speech', lang: 'Polski', gender: 'M' },
  { id: 'pl_PL-mls_6892-low', label: 'MLS', lang: 'Polski', gender: 'M' },
  { id: 'en_US-hfc_female-medium', label: 'HFC female', lang: 'English (US)', gender: 'F' },
  { id: 'en_US-hfc_male-medium', label: 'HFC male', lang: 'English (US)', gender: 'M' },
  { id: 'en_US-amy-medium', label: 'Amy', lang: 'English (US)', gender: 'F' },
  { id: 'en_US-ryan-high', label: 'Ryan', lang: 'English (US)', gender: 'M' },
  { id: 'en_US-joe-medium', label: 'Joe', lang: 'English (US)', gender: 'M' },
  { id: 'en_US-kristin-medium', label: 'Kristin', lang: 'English (US)', gender: 'F' },
  { id: 'en_US-lessac-medium', label: 'Lessac', lang: 'English (US)', gender: 'F' },
  { id: 'en_GB-alba-medium', label: 'Alba', lang: 'English (UK)', gender: 'F' },
  { id: 'en_GB-alan-medium', label: 'Alan', lang: 'English (UK)', gender: 'M' },
  { id: 'en_GB-northern_english_male-medium', label: 'Northern male', lang: 'English (UK)', gender: 'M' },
  { id: 'de_DE-thorsten-medium', label: 'Thorsten', lang: 'Deutsch', gender: 'M' },
  { id: 'de_DE-kerstin-low', label: 'Kerstin', lang: 'Deutsch', gender: 'F' },
  { id: 'es_ES-davefx-medium', label: 'Davefx', lang: 'Español', gender: 'M' },
  { id: 'es_MX-claude-high', label: 'Claude', lang: 'Español (MX)', gender: 'F' },
  { id: 'fr_FR-siwis-medium', label: 'Siwis', lang: 'Français', gender: 'F' },
  { id: 'fr_FR-tom-medium', label: 'Tom', lang: 'Français', gender: 'M' },
  { id: 'it_IT-riccardo-x_low', label: 'Riccardo', lang: 'Italiano', gender: 'M' },
  { id: 'uk_UA-ukrainian_tts-medium', label: 'Ukrainian', lang: 'Українська', gender: 'F' },
  { id: 'cs_CZ-jirka-medium', label: 'Jirka', lang: 'Čeština', gender: 'M' },
  { id: 'ru_RU-irina-medium', label: 'Irina', lang: 'Русский', gender: 'F' },
  { id: 'pt_BR-faber-medium', label: 'Faber', lang: 'Português (BR)', gender: 'M' },
]

let libPromise = null
function lib() {
  if (!libPromise) libPromise = import('@diffusionstudio/vits-web')
  return libPromise
}

export function canSpeak() {
  return typeof WebAssembly !== 'undefined' && typeof OfflineAudioContext !== 'undefined' && !!navigator.storage?.getDirectory
}

/** @returns {Promise<string[]>} ids of voices already stored on this device */
export async function storedVoices() {
  try {
    return await (await lib()).stored()
  } catch {
    return []
  }
}

/**
 * Generates speech.
 * @param {{ text: string, voiceId: string, pitch?: number, rate?: number }} options
 * @param {(p: { phase: 'download' | 'speaking', ratio: number }) => void} [onProgress]
 * @returns {Promise<Blob>} WAV
 */
export async function speak(options, onProgress) {
  const tts = await lib()
  const text = options.text.trim()
  if (!text) throw new Error('Nothing to say')
  const stored = await storedVoices()
  if (!stored.includes(options.voiceId)) {
    await tts.download(options.voiceId, (p) => {
      if (p.total) onProgress?.({ phase: 'download', ratio: p.loaded / p.total })
    })
  }
  onProgress?.({ phase: 'speaking', ratio: 0 })
  const wav = await tts.predict({ text, voiceId: options.voiceId })
  onProgress?.({ phase: 'speaking', ratio: 1 })
  const rate = options.rate ?? 1
  const pitch = options.pitch ?? 0
  if (Math.abs(rate - 1) < 0.01 && Math.abs(pitch) < 0.05) return wav
  return reshape(wav, rate, pitch)
}

/** Changes speed (keeping pitch) and pitch of a WAV. */
async function reshape(blob, rate, semitones) {
  const data = await blob.arrayBuffer()
  const decoder = new OfflineAudioContext(1, 1, 44100)
  const decoded = await decoder.decodeAudioData(data)
  const { playbackRate, stretchFactor } = speedAndPitch(rate, semitones)
  const ctx = new OfflineAudioContext(decoded.numberOfChannels, Math.max(1, Math.ceil((decoded.duration / rate) * decoded.sampleRate)), decoded.sampleRate)
  const stretched = stretchAudioBuffer(ctx, decoded, stretchFactor)
  const source = ctx.createBufferSource()
  source.buffer = stretched
  source.playbackRate.value = playbackRate
  source.connect(ctx.destination)
  source.start(0)
  const rendered = await ctx.startRendering()
  return encodeWav(rendered)
}

/** 16-bit PCM WAV encoder. */
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

/**
 * Parses a dialogue script: lines like `A: Hello` or `Anna: Hi there`.
 * Lines without a speaker continue with the previous one.
 * @returns {{ speaker: string | null, text: string }[]}
 */
export function parseScript(script) {
  const lines = []
  let current = null
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /^([\p{L}\p{N} _.-]{1,24}):\s*(.+)$/u.exec(line)
    if (m) {
      current = m[1].trim()
      lines.push({ speaker: current, text: m[2].trim() })
    } else {
      lines.push({ speaker: current, text: line })
    }
  }
  return lines
}
