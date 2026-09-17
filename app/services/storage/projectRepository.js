import { createId } from '../../core/model/defaults'
import { referencedAssetIds } from '../../core/model/queries'
import { normalizeProject } from '../../core/model/schema'
import { getDB } from './db'
import { deleteBlobs } from './mediaRepository'

/**
 * @typedef {object} ProjectSummary
 * @property {string} id
 * @property {string} name
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {number} duration
 * @property {number} assetCount
 * @property {number} missingStorage assets that could not be persisted
 */

/** @returns {ProjectSummary} */
function summarize(project) {
  let duration = 0
  for (const track of project.tracks) {
    const last = track.items[track.items.length - 1]
    if (last) duration = Math.max(duration, last.start + last.duration)
  }
  const assets = Object.values(project.assets).filter((a) => !a.removed)
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    width: project.settings.width,
    height: project.settings.height,
    fps: project.settings.fps,
    duration,
    assetCount: assets.length,
    missingStorage: assets.filter((a) => a.storage !== 'indexeddb').length,
  }
}

/** Removes Immer freezing / proxies so the value can be structured-cloned. */
function toPlain(value) {
  return JSON.parse(JSON.stringify(value))
}

export const projectRepository = {
  /** @returns {Promise<ProjectSummary[]>} */
  async list() {
    const db = await getDB()
    const projects = await db.getAllFromIndex('projects', 'updatedAt')
    return projects.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt)
  },

  async get(id) {
    const db = await getDB()
    const raw = await db.get('projects', id)
    return raw ? normalizeProject(raw) : null
  },

  async save(project) {
    const db = await getDB()
    await db.put('projects', toPlain(project))
  },

  async rename(id, name) {
    const db = await getDB()
    const tx = db.transaction('projects', 'readwrite')
    const project = await tx.store.get(id)
    if (project) {
      project.name = name
      project.updatedAt = Date.now()
      await tx.store.put(project)
    }
    await tx.done
  },

  /** Duplicates a project. Media blobs are shared by asset id and reference-counted on delete. */
  async duplicate(id, name) {
    const db = await getDB()
    const source = await db.get('projects', id)
    if (!source) return null
    const now = Date.now()
    const copy = {
      ...toPlain(normalizeProject(source)),
      id: createId(),
      name: name ?? `${source.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    }
    await db.put('projects', copy)
    const thumb = await db.get('thumbnails', id)
    if (thumb) await db.put('thumbnails', { ...thumb, projectId: copy.id })
    return copy
  },

  /** Deletes a project and every media blob no other project references. */
  async remove(id) {
    const db = await getDB()
    const project = await db.get('projects', id)
    await db.delete('projects', id)
    await db.delete('thumbnails', id)
    if (!project) return
    const stillUsed = new Set()
    for (const other of await db.getAll('projects')) {
      for (const assetId of Object.keys(other.assets ?? {})) stillUsed.add(assetId)
    }
    const orphaned = Object.keys(project.assets ?? {}).filter((a) => !stillUsed.has(a))
    await deleteBlobs(orphaned)
  },

  /** Deletes blobs of assets purged from a project that no project references any more. */
  async collectGarbage(purgedAssetIds) {
    if (purgedAssetIds.length === 0) return
    const db = await getDB()
    const stillUsed = new Set()
    for (const p of await db.getAll('projects')) {
      for (const assetId of referencedAssetIds(normalizeProject(p))) stillUsed.add(assetId)
      for (const [assetId, asset] of Object.entries(p.assets ?? {})) if (!asset.removed) stillUsed.add(assetId)
    }
    await deleteBlobs(purgedAssetIds.filter((a) => !stillUsed.has(a)))
  },

  async saveThumbnail(projectId, blob) {
    const db = await getDB()
    await db.put('thumbnails', { projectId, blob, updatedAt: Date.now() })
  },

  async getThumbnail(projectId) {
    const db = await getDB()
    return (await db.get('thumbnails', projectId))?.blob ?? null
  },
}
