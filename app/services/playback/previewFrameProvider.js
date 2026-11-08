import { mediaLibrary } from '../media/mediaLibrary'

/** How far (in source seconds) a snapshot may be from the wanted frame and still be shown. */
const SNAPSHOT_TOLERANCE = 3

/**
 * Frame provider for the live preview: <video> elements from the pool and
 * decoded <img> elements.
 *
 * When a video element cannot deliver its frame right now (seeking, buffering,
 * just created) the last snapshot of that clip is returned instead, so the
 * preview never flashes black during playback or scrubbing.
 *
 * @param {import('./MediaElementPool').MediaElementPool} pool
 * @param {{ playing?: boolean }} [options]
 * @returns {import('../../core/render/compositor').FrameProvider & { usedSnapshot: boolean }}
 */
export function createPreviewFrameProvider(pool, options = {}) {
  const provider = {
    /** True when at least one layer was drawn from a snapshot (a refresh will follow). */
    usedSnapshot: false,
    getFrame(item, sourceTime) {
      if (!mediaLibrary.has(item.assetId)) return 'missing'
      if (item.type === 'image') {
        const img = mediaLibrary.getImage(item.assetId)
        return img ? { image: img, width: img.naturalWidth, height: img.naturalHeight } : null
      }
      const video = pool.getVideo(item.id)
      if (video && video.readyState >= 2 && video.videoWidth > 0 && pool.isVideoReady(item.id)) {
        pool.snapshot(item.id, sourceTime, !options.playing)
        return { image: video, width: video.videoWidth, height: video.videoHeight }
      }
      const snap = pool.getSnapshot(item.id)
      if (snap && Math.abs(snap.sourceTime - sourceTime) <= SNAPSHOT_TOLERANCE) {
        provider.usedSnapshot = true
        return { image: snap.canvas, width: snap.canvas.width, height: snap.canvas.height }
      }
      return null
    },
  }
  return provider
}
