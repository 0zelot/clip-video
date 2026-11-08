/**
 * Local speech recognition (Whisper via transformers.js).
 *
 * The audio never leaves the device: the model runs in this browser with
 * WebGPU when available and WebAssembly otherwise. The model weights are
 * downloaded once from the Hugging Face CDN and cached by the browser, so
 * later runs work offline as well.
 *
 * The library is imported dynamically, so the ~1 MB runtime is only fetched
 * when the user actually asks for a transcription.
 */
import { decodeForSpeech } from './audioSource'

// Word timing is computed from the decoder's cross-attentions, so these must be
// the `_timestamped` exports: the plain `onnx-community/whisper-*` models do not
// output attentions and fail with "Model outputs must contain cross attentions".
export const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-tiny_timestamped', label: 'Tiny · fastest', size: '~45 MB' },
  { id: 'onnx-community/whisper-base_timestamped', label: 'Base · better quality', size: '~85 MB' },
  { id: 'onnx-community/whisper-small_timestamped', label: 'Small · best quality', size: '~250 MB' },
]

const SAMPLE_RATE = 16000

export const CAPTION_LANGUAGES = [
  { id: 'auto', label: 'Detect automatically' },
  { id: 'pl', label: 'Polski' },
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'it', label: 'Italiano' },
  { id: 'uk', label: 'Українська' },
  { id: 'cs', label: 'Čeština' },
  { id: 'ru', label: 'Русский' },
]

let pipelinePromise = null
let loadedKey = null

async function getTranscriber(modelId, onProgress) {
  const key = modelId
  if (pipelinePromise && loadedKey === key) return pipelinePromise
  loadedKey = key
  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    // Keep everything in the browser cache; never look for local model files on a server.
    env.allowLocalModels = false
    env.useBrowserCache = true
    const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
    try {
      return await pipeline('automatic-speech-recognition', modelId, {
        dtype: device === 'webgpu' ? 'fp32' : 'q8',
        device,
        progress_callback: (info) => {
          if (info?.status === 'progress' && info.total) onProgress?.(info.loaded / info.total, 'download')
        },
      })
    } catch (error) {
      // WebGPU is not always usable even when present - retry on WebAssembly.
      if (device !== 'webgpu') throw error
      return pipeline('automatic-speech-recognition', modelId, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (info) => {
          if (info?.status === 'progress' && info.total) onProgress?.(info.loaded / info.total, 'download')
        },
      })
    }
  })()
  try {
    return await pipelinePromise
  } catch (error) {
    pipelinePromise = null
    loadedKey = null
    throw error
  }
}

/** True when the browser can run the local speech model at all. */
export function canTranscribe() {
  return typeof WebAssembly !== 'undefined' && typeof OfflineAudioContext !== 'undefined'
}

/**
 * Transcribes a media file into word timestamps.
 *
 * @param {Blob} blob audio or video file
 * @param {{ model?: string, language?: string, task?: 'transcribe' | 'translate', onProgress?: (p: { phase: string, ratio: number }) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<{ text: string, words: { text: string, start: number, end: number }[], language: string | null }>}
 */
export async function transcribeMedia(blob, options = {}) {
  const model = options.model ?? WHISPER_MODELS[0].id
  const report = (phase, ratio) => options.onProgress?.({ phase, ratio })

  report('decoding', 0)
  const { samples } = await decodeForSpeech(blob, {
    signal: options.signal,
    onProgress: (r) => report('decoding', r),
  })

  report('model', 0)
  const transcriber = await getTranscriber(model, (ratio) => report('model', ratio))
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  return transcribeSamples(transcriber, samples, { language: options.language, task: options.task, onProgress: options.onProgress })
}

/**
 * Detects the spoken language the way Whisper does it: one decoder step after
 * <|startoftranscript|> on 30 s of audio, then the most likely language token.
 *
 * transformers.js does not implement this - without an explicit language it
 * silently assumes English, which turns e.g. Polish speech into English text.
 *
 * @param {*} transcriber an automatic-speech-recognition pipeline
 * @param {Float32Array} samples mono audio at 16 kHz
 * @returns {Promise<string | null>} language code such as 'pl', or null if unknown
 */
export async function detectLanguage(transcriber, samples) {
  const { Tensor } = await import('@huggingface/transformers')
  const { model, processor } = transcriber
  const config = model.generation_config
  const langToId = config?.lang_to_id
  if (!config?.is_multilingual || !langToId) return null

  // Skip leading silence so a quiet intro does not decide the language.
  let start = samples.findIndex((s) => Math.abs(s) > 0.02)
  start = Math.max(0, start - SAMPLE_RATE / 2)
  const { input_features } = await processor(samples.subarray(start, start + 30 * SAMPLE_RATE))

  const { logits } = await model({
    input_features,
    decoder_input_ids: new Tensor('int64', [BigInt(config.decoder_start_token_id)], [1, 1]),
  })
  // logits: [1, 1, vocab] - a single position, so the token id indexes it directly.
  let best = null
  let bestScore = -Infinity
  for (const [token, id] of Object.entries(langToId)) {
    if (logits.data[id] > bestScore) {
      bestScore = logits.data[id]
      best = token
    }
  }
  return best ? best.slice(2, -2) : null // '<|pl|>' -> 'pl'
}

/**
 * Runs Whisper on decoded audio and returns word timestamps.
 *
 * @param {*} transcriber an automatic-speech-recognition pipeline
 * @param {Float32Array} samples mono audio at 16 kHz
 * @param {{ language?: string, task?: 'transcribe' | 'translate', onProgress?: (p: { phase: string, ratio: number }) => void }} [options]
 *   `task: 'translate'` returns the speech translated into English (Whisper does that itself)
 * @returns {Promise<{ text: string, words: { text: string, start: number, end: number }[], language: string | null }>}
 */
export async function transcribeSamples(transcriber, samples, options = {}) {
  const report = (phase, ratio) => options.onProgress?.({ phase, ratio })

  report('transcribing', 0)
  let language = options.language && options.language !== 'auto' ? options.language : null
  if (!language) language = await detectLanguage(transcriber, samples)

  const output = await transcriber(samples, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: 'word',
    ...(language ? { language } : {}),
    task: options.task === 'translate' ? 'translate' : 'transcribe',
  })

  const chunks = Array.isArray(output) ? (output[0]?.chunks ?? []) : (output.chunks ?? [])
  const words = chunks
    .map((chunk) => ({
      text: String(chunk.text ?? '').trim(),
      start: Number(chunk.timestamp?.[0] ?? 0),
      end: Number(chunk.timestamp?.[1] ?? chunk.timestamp?.[0] ?? 0),
    }))
    .filter((w) => w.text && Number.isFinite(w.start))
    .map((w, i, all) => ({
      ...w,
      // Whisper occasionally omits the closing timestamp of a word.
      end: Number.isFinite(w.end) && w.end > w.start ? w.end : (all[i + 1]?.start ?? w.start + 0.3),
    }))

  report('done', 1)
  const text = Array.isArray(output) ? (output[0]?.text ?? '') : (output.text ?? words.map((w) => w.text).join(' '))
  return { text: String(text).trim(), words, language }
}
