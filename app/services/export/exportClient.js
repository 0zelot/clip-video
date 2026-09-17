import { referencedAssetIds } from '../../core/model/queries'
import { mediaLibrary } from '../media/mediaLibrary'
import { mixProjectAudio } from './audioMix'
import { runExportPipeline } from './pipeline'
import { ExportCancelledError } from './types'

/**
 * @typedef {{ supported: boolean, worker: boolean, reason?: string }} ExportSupport
 * @typedef {{ promise: Promise<import('./types').ExportResult>, cancel: () => void }} ExportHandle
 */

/** @returns {ExportSupport} */
export function getExportSupport() {
  if (typeof VideoEncoder === 'undefined') {
    return {
      supported: false,
      worker: false,
      reason: 'This browser does not support WebCodecs video encoding. Use a recent Chrome, Edge, Firefox or Safari, or the Android app.',
    }
  }
  const worker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined'
  return { supported: true, worker }
}

class WorkerStartupError extends Error {}

/** Audio mixing takes this share of the overall progress bar. */
const AUDIO_WEIGHT = 0.1

/**
 * @param {import('../../core/model/types').Project} project
 * @param {import('./types').ExportOptions} options
 * @param {(p: import('./types').ExportProgress) => void} onProgress
 * @returns {ExportHandle}
 */
export function startExport(project, options, onProgress) {
  const abort = new AbortController()
  let worker = null
  let killWorker = null

  const promise = (async () => {
    const support = getExportSupport()
    if (!support.supported) throw new Error(support.reason)

    onProgress({ phase: 'preparing', progress: 0, framesDone: 0, framesTotal: 0 })
    const blobs = {}
    const fonts = []
    for (const assetId of referencedAssetIds(project)) {
      const blob = mediaLibrary.getBlob(assetId)
      if (!blob) continue
      const asset = project.assets[assetId]
      // Custom fonts are handed to the renderer separately so it can register them.
      if (asset?.kind === 'font') fonts.push({ family: asset.fontFamily ?? asset.name, blob })
      else blobs[assetId] = blob
    }

    const audioWeight = options.includeAudio ? AUDIO_WEIGHT : 0
    const audio = options.includeAudio
      ? await mixProjectAudio(project, blobs, {
          signal: abort.signal,
          onProgress: (p) => onProgress({ phase: 'audio', progress: p * audioWeight, framesDone: 0, framesTotal: 0 }),
        })
      : null
    if (abort.signal.aborted) throw new ExportCancelledError()

    // Immer freezes objects; a JSON round-trip yields a plain, cloneable snapshot.
    const job = { project: JSON.parse(JSON.stringify(project)), blobs, fonts, options, audio }
    const mapProgress = (p) => ({ ...p, progress: audioWeight + p.progress * (1 - audioWeight) })

    if (support.worker) {
      try {
        return await runInWorker(job, mapProgress)
      } catch (error) {
        if (error instanceof ExportCancelledError || !(error instanceof WorkerStartupError)) throw error
        // Worker could not start (e.g. module workers unsupported) - fall back to the main thread.
      }
    }
    return runExportPipeline(job, {
      createCanvas: (w, h) => {
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        return canvas
      },
      onProgress: (p) => onProgress(mapProgress(p)),
      isCancelled: () => abort.signal.aborted,
    })
  })()

  function runInWorker(job, mapProgress) {
    return new Promise((resolve, reject) => {
      let started = false
      try {
        worker = new Worker(new URL('../../workers/export.worker.js', import.meta.url), { type: 'module' })
      } catch (error) {
        reject(new WorkerStartupError(String(error)))
        return
      }
      const cleanup = () => {
        worker?.terminate()
        worker = null
        abort.signal.removeEventListener('abort', onAbort)
      }
      const onAbort = () => worker?.postMessage({ type: 'cancel' })
      killWorker = () => {
        cleanup()
        reject(new ExportCancelledError())
      }
      abort.signal.addEventListener('abort', onAbort)
      worker.onmessage = (event) => {
        const msg = event.data
        started = true
        if (msg.type === 'progress') onProgress(mapProgress(msg.progress))
        else if (msg.type === 'done') {
          cleanup()
          resolve(msg.result)
        } else if (msg.type === 'cancelled') {
          cleanup()
          reject(new ExportCancelledError())
        } else if (msg.type === 'error') {
          cleanup()
          reject(new Error(msg.message))
        }
      }
      worker.onerror = (event) => {
        cleanup()
        reject(started ? new Error(event.message || 'Export worker crashed') : new WorkerStartupError(event.message))
      }
      worker.postMessage({ type: 'start', job })
    })
  }

  return {
    promise,
    cancel() {
      abort.abort()
      // If the worker does not react quickly (e.g. stuck in the encoder), terminate it.
      setTimeout(() => {
        if (worker) killWorker?.()
      }, 3000)
    },
  }
}
