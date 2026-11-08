/** Track, asset and project-settings operations (mutate an Immer draft). */
import { findTrack, referencedAssetIds } from '../model/queries'

/**
 * @param {import('../model/types').Project} project
 * @param {string} trackId
 * @param {Partial<Pick<import('../model/types').Track, 'name' | 'hidden' | 'muted' | 'locked'>>} patch
 */
export function updateTrack(project, trackId, patch) {
  const track = findTrack(project, trackId)
  if (!track) return false
  Object.assign(track, patch)
  return true
}

/**
 * Moves a track up (-1) or down (+1) within the tracks of the same kind.
 * @param {import('../model/types').Project} project
 * @param {string} trackId
 * @param {-1 | 1} direction
 */
export function moveTrack(project, trackId, direction) {
  const index = project.tracks.findIndex((t) => t.id === trackId)
  if (index === -1) return false
  const track = project.tracks[index]
  let target = index + direction
  while (target >= 0 && target < project.tracks.length && project.tracks[target].kind !== track.kind) target += direction
  if (target < 0 || target >= project.tracks.length) return false
  const [moved] = project.tracks.splice(index, 1)
  project.tracks.splice(target, 0, moved)
  return true
}

export function removeTrack(project, trackId) {
  const index = project.tracks.findIndex((t) => t.id === trackId)
  if (index === -1) return false
  project.tracks.splice(index, 1)
  return true
}

/** @param {Partial<import('../model/types').ProjectSettings>} patch */
export function updateSettings(project, patch) {
  Object.assign(project.settings, patch)
  project.settings.width = Math.max(16, Math.round(project.settings.width / 2) * 2)
  project.settings.height = Math.max(16, Math.round(project.settings.height / 2) * 2)
  project.settings.fps = Math.min(120, Math.max(1, Math.round(project.settings.fps)))
}

export function addAsset(project, asset) {
  project.assets[asset.id] = asset
}

export function updateAsset(project, assetId, patch) {
  const asset = project.assets[assetId]
  if (asset) Object.assign(asset, patch)
}

/**
 * Hides an asset from the library and removes every item using it. The asset
 * metadata is kept (flagged `removed`) so that undo can bring the items back;
 * it is purged by `purgeRemovedAssets` when the project is reopened.
 */
export function removeAssetFromProject(project, assetId) {
  const asset = project.assets[assetId]
  if (!asset) return
  asset.removed = true
  for (const track of project.tracks) track.items = track.items.filter((i) => i.assetId !== assetId)
  if (project.settings.background.kind === 'image' && project.settings.background.assetId === assetId) {
    project.settings.background = { kind: 'color', color: '#000000' }
  }
}

/**
 * Returns a copy of the project without removed, unreferenced assets, plus the
 * ids that were dropped.
 *
 * @param {import('../model/types').Project} project
 * @returns {{ project: import('../model/types').Project, purged: string[] }}
 */
export function purgeRemovedAssets(project) {
  const used = referencedAssetIds(project)
  const purged = Object.values(project.assets)
    .filter((a) => a.removed && !used.has(a.id))
    .map((a) => a.id)
  if (purged.length === 0) return { project, purged }
  const assets = { ...project.assets }
  for (const id of purged) delete assets[id]
  return { project: { ...project, assets }, purged }
}

/** Adds a timeline marker (beats, notes) and keeps them sorted. */
export function addMarker(project, marker) {
  project.markers = [...(project.markers ?? []).filter((m) => Math.abs(m.t - marker.t) > 1e-3), marker].sort((a, b) => a.t - b.t)
}

export function removeMarker(project, markerId) {
  project.markers = (project.markers ?? []).filter((m) => m.id !== markerId)
}
