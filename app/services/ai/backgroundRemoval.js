/**
 * On-device background removal for photos (MODNet via transformers.js).
 *
 * Like the caption model, the weights (~25 MB) are downloaded once from the
 * Hugging Face CDN and then cached by the browser; the image itself never
 * leaves the device.
 */

const MODEL_ID = 'Xenova/modnet'

let segmenterPromise = null

async function getSegmenter(onProgress) {
  if (segmenterPromise) return segmenterPromise
  segmenterPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.allowLocalModels = false
    env.useBrowserCache = true
    const progress_callback = (info) => {
      if (info?.status === 'progress' && info.total) onProgress?.(info.loaded / info.total)
    }
    const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm'
    try {
      return await pipeline('background-removal', MODEL_ID, { device, dtype: 'fp32', progress_callback })
    } catch (error) {
      if (device !== 'webgpu') throw error
      return pipeline('background-removal', MODEL_ID, { device: 'wasm', dtype: 'fp32', progress_callback })
    }
  })()
  try {
    return await segmenterPromise
  } catch (error) {
    segmenterPromise = null
    throw error
  }
}

/**
 * @param {Blob} blob source image
 * @param {{ onProgress?: (p: { phase: 'model' | 'processing', ratio: number }) => void }} [options]
 * @returns {Promise<Blob>} PNG with a transparent background
 */
export async function removeBackground(blob, options = {}) {
  const report = (phase, ratio) => options.onProgress?.({ phase, ratio })
  report('model', 0)
  const segmenter = await getSegmenter((r) => report('model', r))
  report('processing', 0)
  const url = URL.createObjectURL(blob)
  try {
    const output = await segmenter(url)
    const image = Array.isArray(output) ? output[0] : output
    report('processing', 1)
    return await image.toBlob('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
