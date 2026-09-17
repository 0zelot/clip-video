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

export const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-tiny', label: 'Tiny · fastest', size: '~45 MB' },
  { id: 'onnx-community/whisper-base', label: 'Base · better quality', size: '~85 MB' },
  { id: 'onnx-community/whisper-small', label: 'Small · best quality', size: '~250 MB' },
]

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
 * @param {{ model?: string, language?: string, onProgress?: (p: { phase: string, ratio: number }) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<{ text: string, words: { text: string, start: number, end: number }[] }>}
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

  report('transcribing', 0)
  const output = await transcriber(samples, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: 'word',
    ...(options.language && options.language !== 'auto' ? { language: options.language, task: 'transcribe' } : {}),
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
  return { text: String(text).trim(), words }
}
