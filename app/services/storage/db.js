import { openDB } from 'idb'

/**
 * IndexedDB stores:
 * - `projects`  id → project model (JSON, no binaries), indexed by `updatedAt`
 * - `blobs`     assetId → { id, blob, name, size, storedAt }
 * - `thumbnails` projectId → { projectId, blob, updatedAt }
 * - `kv`        generic key/value store for app-level data (presets, preferences)
 */
const DB_NAME = 'clip'
const DB_VERSION = 1

let dbPromise = null

export function getDB() {
  if (!dbPromise) {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available in this browser.'))
    }
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const projects = db.createObjectStore('projects', { keyPath: 'id' })
          projects.createIndex('updatedAt', 'updatedAt')
          db.createObjectStore('blobs', { keyPath: 'id' })
          db.createObjectStore('thumbnails', { keyPath: 'projectId' })
          db.createObjectStore('kv')
        }
      },
      blocking() {
        // Another tab wants to upgrade - close so it can proceed.
        void dbPromise?.then((db) => db.close())
        dbPromise = null
      },
    }).catch((error) => {
      dbPromise = null
      throw error
    })
  }
  return dbPromise
}

export function isQuotaError(error) {
  if (!error || typeof error !== 'object') return false
  return error.name === 'QuotaExceededError' || /quota/i.test(error.message ?? '')
}
