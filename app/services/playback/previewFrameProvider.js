import { mediaLibrary } from '../media/mediaLibrary'

/**
 * Frame provider for the live preview: <video> elements from the pool and
 * decoded <img> elements.
 *
 * @param {import('./MediaElementPool').MediaElementPool} pool
 * @returns {import('../../core/render/compositor').FrameProvider}
 */
export function createPreviewFrameProvider(pool) {
  return {
    getFrame(item) {
      if (!mediaLibrary.has(item.assetId)) return 'missing'
      if (item.type === 'image') {
        const img = mediaLibrary.getImage(item.assetId)
        return img ? { image: img, width: img.naturalWidth, height: img.naturalHeight } : null
      }
      const video = pool.getVideo(item.id)
      if (!video || video.readyState < 2 || video.videoWidth === 0) return null
      if (!pool.isVideoReady(item.id)) {
        // Still seeking: drawing now would show a stale or blank frame.
        return null
      }
      return { image: video, width: video.videoWidth, height: video.videoHeight }
    },
  }
}
