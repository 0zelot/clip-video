/**
 * Shared shapes of the export pipeline.
 *
 * @typedef {'mp4' | 'webm'} ExportContainer
 *
 * @typedef {object} ExportOptions
 * @property {ExportContainer} container
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {number} videoBitrate bits per second
 * @property {number} audioBitrate bits per second
 * @property {boolean} includeAudio
 *
 * @typedef {{ sampleRate: number, channels: Float32Array[] }} MixedAudio planar channel data
 *
 * @typedef {object} ExportJob
 * @property {import('../../core/model/types').Project} project
 * @property {Record<string, Blob>} blobs blobs of every asset referenced by the timeline
 * @property {ExportOptions} options
 * @property {MixedAudio | null} audio
 *
 * @typedef {'preparing' | 'audio' | 'video' | 'finalizing' | 'done'} ExportPhase
 *
 * @typedef {object} ExportProgress
 * @property {ExportPhase} phase
 * @property {number} progress 0..1 over the whole export
 * @property {number} framesDone
 * @property {number} framesTotal
 *
 * @typedef {object} ExportResult
 * @property {ArrayBuffer} buffer
 * @property {string} mimeType
 * @property {string} extension
 * @property {string} videoCodec
 * @property {string | null} audioCodec
 * @property {string[]} warnings
 *
 * Worker protocol:
 *   → { type: 'start', job } | { type: 'cancel' }
 *   ← { type: 'progress', progress } | { type: 'done', result } | { type: 'error', message } | { type: 'cancelled' }
 */

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled')
    this.name = 'ExportCancelledError'
  }
}
