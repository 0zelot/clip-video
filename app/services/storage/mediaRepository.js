import { getDB, isQuotaError } from './db'

/**
 * Persistent storage of media binaries.
 *
 * Files are stored as Blobs in IndexedDB - browsers (including Android
 * WebView) keep those on disk, not in memory, and never base64-encode them.
 *
 * @typedef {{ ok: true } | { ok: false, reason: 'quota' | 'unavailable', error: unknown }} StoreBlobResult
 */
export const mediaRepository = {
  /** @returns {Promise<StoreBlobResult>} */
  async put(id, blob, name) {
    try {
      const db = await getDB()
      await db.put('blobs', { id, blob, name, size: blob.size, storedAt: Date.now() })
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: isQuotaError(error) ? 'quota' : 'unavailable', error }
    }
  },

  async get(id) {
    try {
      const db = await getDB()
      return (await db.get('blobs', id))?.blob ?? null
    } catch {
      return null
    }
  },

  async has(id) {
    const db = await getDB()
    return (await db.getKey('blobs', id)) !== undefined
  },
}

export async function deleteBlobs(ids) {
  if (ids.length === 0) return
  const db = await getDB()
  const tx = db.transaction('blobs', 'readwrite')
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
}

/**
 * @typedef {object} StorageInfo
 * @property {number} usage
 * @property {number} quota
 * @property {boolean} persisted
 * @property {boolean} supported
 */

/** @returns {Promise<StorageInfo>} */
export async function getStorageInfo() {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!storage?.estimate) return { usage: 0, quota: 0, persisted: false, supported: false }
  const [estimate, persisted] = await Promise.all([storage.estimate(), storage.persisted?.() ?? Promise.resolve(false)])
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persisted, supported: true }
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
