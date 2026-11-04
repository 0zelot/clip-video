/**
 * Shared, non-reactive state between the preview canvas gestures and the
 * selection overlay: while a finger moves a clip, the preview must not start
 * scrubbing or panning with another finger.
 */
export const previewInteraction = { itemPointers: 0 }
