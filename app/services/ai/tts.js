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
import { parseOverrides, processVoice } from './voiceFx'

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
  // Automated tests can provide a stand-in engine (same API) to run offline.
  if (globalThis.__clipTtsEngine) return Promise.resolve(globalThis.__clipTtsEngine)
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

/** Raw speech cache (voice + text → WAV), so previews and re-generations are instant. */
const cache = new Map()

/**
 * Generates speech with optional modulation.
 * @param {{ text: string, voiceId: string } & import('./voiceFx').VoiceSettings} options
 * @param {(p: { phase: 'download' | 'speaking', ratio: number }) => void} [onProgress]
 * @returns {Promise<Blob>} WAV
 */
export async function speak(options, onProgress) {
  const text = options.text.trim()
  if (!text) throw new Error('Nothing to say')
  const key = `${options.voiceId}\u0000${text}`
  let wav = cache.get(key)
  if (!wav) {
    const tts = await lib()
    const stored = await storedVoices()
    if (!stored.includes(options.voiceId)) {
      await tts.download(options.voiceId, (p) => {
        if (p.total) onProgress?.({ phase: 'download', ratio: p.loaded / p.total })
      })
    }
    onProgress?.({ phase: 'speaking', ratio: 0 })
    wav = await tts.predict({ text, voiceId: options.voiceId })
    if (cache.size > 60) cache.delete(cache.keys().next().value)
    cache.set(key, wav)
  }
  onProgress?.({ phase: 'speaking', ratio: 1 })
  return processVoice(wav, options)
}

/**
 * Parses a dialogue script: lines like `A: Hello`, `Anna: Hi there` or with
 * per-line voice changes `B [+3, 1.2x, echo]: Really?!`. Lines without a
 * speaker continue with the previous one.
 * @returns {{ speaker: string | null, text: string, overrides: ReturnType<typeof parseOverrides> }[]}
 */
export function parseScript(script) {
  const lines = []
  let current = null
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /^([\p{L}\p{N} _.-]{1,24}?)\s*(?:\[([^\]]*)\])?\s*:\s*(.+)$/u.exec(line)
    if (m) {
      current = m[1].trim()
      lines.push({ speaker: current, text: m[3].trim(), overrides: m[2] ? parseOverrides(m[2]) : {} })
    } else {
      lines.push({ speaker: current, text: line, overrides: {} })
    }
  }
  return lines
}

export { encodeWav } from './voiceFx'
