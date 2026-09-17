/** Export worker: renders and encodes the project off the main thread. */
import { runExportPipeline } from '../services/export/pipeline'
import { ExportCancelledError } from '../services/export/types'

let cancelled = false

function post(message, transfer = []) {
  self.postMessage(message, transfer)
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'cancel') {
    cancelled = true
    return
  }
  cancelled = false
  try {
    const result = await runExportPipeline(msg.job, {
      createCanvas: (w, h) => new OffscreenCanvas(w, h),
      onProgress: (progress) => post({ type: 'progress', progress }),
      isCancelled: () => cancelled,
    })
    post({ type: 'done', result }, [result.buffer])
  } catch (error) {
    if (error instanceof ExportCancelledError) post({ type: 'cancelled' })
    else post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
