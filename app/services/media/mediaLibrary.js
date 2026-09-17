/**
 * Runtime registry of loaded media binaries (non-reactive on purpose).
 *
 * Blobs are exposed to media elements through object URLs - the file content
 * is never copied into JS memory or converted to base64.
 *
 * @typedef {object} AssetRuntime
 * @property {import('../../core/model/types').AssetKind} kind
 * @property {Blob} blob
 * @property {string} url
 * @property {HTMLImageElement} [image]
 * @property {boolean} imageReady
 */
class MediaLibrary {
  /** @type {Map<string, AssetRuntime>} */
  #entries = new Map()
  /** @type {Set<(assetId: string) => void>} */
  #listeners = new Set()

  /**
   * @param {string} id asset id
   * @param {import('../../core/model/types').AssetKind} kind
   * @param {Blob} blob
   * @param {{ fontFamily?: string }} [meta]
   */
  register(id, kind, blob, meta = {}) {
    const existing = this.#entries.get(id)
    if (existing && existing.blob === blob) return
    if (existing) URL.revokeObjectURL(existing.url)
    const entry = { kind, blob, url: URL.createObjectURL(blob), imageReady: false, fontFamily: meta.fontFamily }
    this.#entries.set(id, entry)
    if (kind === 'font' && meta.fontFamily && typeof FontFace !== 'undefined') {
      // Custom fonts are registered with the document so the preview can use them.
      void blob
        .arrayBuffer()
        .then((buffer) => new FontFace(meta.fontFamily, buffer).load())
        .then((face) => {
          document.fonts.add(face)
          entry.imageReady = true
          this.#emit(id)
        })
        .catch(() => {})
    }
    if (kind === 'image') {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        entry.imageReady = true
        this.#emit(id)
      }
      img.src = entry.url
      entry.image = img
    }
    this.#emit(id)
  }

  has(id) {
    return this.#entries.has(id)
  }

  getBlob(id) {
    return this.#entries.get(id)?.blob
  }

  getUrl(id) {
    return this.#entries.get(id)?.url
  }

  /** Returns a decoded image element, or null while it is still loading. */
  getImage(id) {
    const entry = this.#entries.get(id)
    return entry?.image && entry.imageReady ? entry.image : null
  }

  release(id) {
    const entry = this.#entries.get(id)
    if (!entry) return
    URL.revokeObjectURL(entry.url)
    this.#entries.delete(id)
    this.#emit(id)
  }

  clear() {
    for (const id of [...this.#entries.keys()]) this.release(id)
  }

  /** @param {(assetId: string) => void} listener @returns {() => void} unsubscribe */
  onChange(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #emit(id) {
    for (const l of this.#listeners) l(id)
  }
}

export const mediaLibrary = new MediaLibrary()
