/** Export worker: renders and encodes the project off the main thread. */
import { runExportPipeline } from '../services/export/pipeline'
import { ExportCancelledError } from '../services/export/types'

let cancelled = false
/** Pending audio chunk requests (the main thread mixes audio). */
const audioWaiters = new Map()

function post(message, transfer = []) {
  self.postMessage(message, transfer)
}

function getAudioChunk(index) {
  return new Promise((resolve, reject) => {
    audioWaiters.set(index, { resolve, reject })
    post({ type: 'audio-request', index })
  })
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'cancel') {
    cancelled = true
    return
  }
  if (msg.type === 'audio-chunk') {
    const waiter = audioWaiters.get(msg.index)
    audioWaiters.delete(msg.index)
    if (msg.error) waiter?.reject(new Error(msg.error))
    else waiter?.resolve(msg.chunk)
    return
  }
  cancelled = false
  try {
    const result = await runExportPipeline(msg.job, {
      createCanvas: (w, h) => new OffscreenCanvas(w, h),
      onProgress: (progress) => post({ type: 'progress', progress }),
      isCancelled: () => cancelled,
      getAudioChunk,
    })
    post({ type: 'done', result }, result.buffer ? [result.buffer] : [])
  } catch (error) {
    if (error instanceof ExportCancelledError) post({ type: 'cancelled' })
    else post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
