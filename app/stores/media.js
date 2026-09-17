import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createId } from '~/core/model/defaults'
import { mediaAnalysis } from '~/services/media/analysis'
import { mediaLibrary } from '~/services/media/mediaLibrary'
import { classifyFile, extensionOf, probeFile } from '~/services/media/probe'
import { mediaRepository, requestPersistentStorage } from '~/services/storage/mediaRepository'
import { useCaptionsStore } from './captions'
import { useEditorStore } from './editor'
import { useProjectStore } from './project'
import { useUiStore } from './ui'

/**
 * @typedef {'loading' | 'ready' | 'missing'} AssetStatus
 * @typedef {{ id: string, name: string, state: 'probing' | 'storing' | 'done' | 'error' }} ImportTask
 */

function requestAnalysis(asset, blob) {
  if (asset.kind === 'video') mediaAnalysis.requestFilmstrip(asset.id, blob)
  if (asset.kind === 'audio' || (asset.kind === 'video' && asset.hasAudio)) mediaAnalysis.requestPeaks(asset.id, blob)
}

export const useMediaStore = defineStore('media', () => {
  /** @type {import('vue').Ref<Record<string, AssetStatus>>} */
  const status = ref({})
  /** @type {import('vue').Ref<ImportTask[]>} */
  const imports = ref([])

  function setStatus(id, s) {
    status.value = { ...status.value, [id]: s }
  }

  /**
   * Loads the binaries of every asset of a project from local storage.
   * @returns {Promise<string[]>} ids of assets whose file is missing
   */
  async function loadProjectMedia(project) {
    const assets = Object.values(project.assets)
    const missing = []
    status.value = Object.fromEntries(assets.map((a) => [a.id, 'loading']))
    await Promise.all(
      assets.map(async (asset) => {
        if (mediaLibrary.has(asset.id)) {
          setStatus(asset.id, 'ready')
          requestAnalysis(asset, mediaLibrary.getBlob(asset.id))
          return
        }
        const blob = await mediaRepository.get(asset.id)
        if (blob) {
          mediaLibrary.register(asset.id, asset.kind, blob, { fontFamily: asset.fontFamily })
          setStatus(asset.id, 'ready')
          requestAnalysis(asset, blob)
        } else {
          setStatus(asset.id, 'missing')
          if (!asset.removed) missing.push(asset.id)
        }
      }),
    )
    return missing
  }

  function unloadAll() {
    for (const id of Object.keys(status.value)) mediaAnalysis.forget(id)
    mediaLibrary.clear()
    status.value = {}
  }

  /** @returns {Promise<import('~/core/model/types').AssetStorage>} */
  async function storeBlob(asset, file) {
    const result = await mediaRepository.put(asset.id, file, asset.name)
    if (result.ok) return 'indexeddb'
    const ui = useUiStore()
    ui.toast(
      result.reason === 'quota'
        ? `Not enough local storage to keep "${asset.name}". It will be available until the app is closed - keep the original file to re-link it later.`
        : `"${asset.name}" could not be stored on this device. It will be available until the app is closed - keep the original file to re-link it later.`,
      'warning',
      { timeout: 10000 },
    )
    return 'memory'
  }

  /**
   * Imports files into the open project. Media is stored locally and, when
   * `addToTimeline` is set, placed on the timeline one after another.
   *
   * @param {File[]} files
   * @param {{ addToTimeline?: boolean, hint?: import('~/core/operations/items').PlacementHint }} [options]
   * @returns {Promise<import('~/core/model/types').MediaAsset[]>}
   */
  async function importFiles(files, options = {}) {
    const projectStore = useProjectStore()
    const editor = useEditorStore()
    const ui = useUiStore()
    if (!projectStore.project || files.length === 0) return []

    void requestPersistentStorage()
    const imported = []
    const unsupported = []
    const later = []
    let hint = { playhead: editor.currentTime(), ...options.hint }

    for (const file of files) {
      const category = classifyFile(file)
      if (category === 'subtitle' || category === 'text') {
        later.push(file)
        continue
      }
      if (category === 'font') {
        const asset = await importFont(file)
        if (asset) imported.push(asset)
        continue
      }
      if (category === 'unsupported') {
        unsupported.push(file.name)
        continue
      }
      const task = { id: createId(), name: file.name, state: 'probing' }
      imports.value = [...imports.value, task]
      const update = (state) => {
        imports.value = imports.value.map((t) => (t.id === task.id ? { ...t, state } : t))
      }
      try {
        const probe = await probeFile(file, category)
        for (const warning of probe.warnings) ui.toast(`${file.name}: ${warning}`, 'warning')
        update('storing')
        const asset = {
          id: createId(),
          kind: probe.kind,
          name: file.name,
          mimeType: file.type,
          size: file.size,
          lastModified: file.lastModified,
          storage: 'indexeddb',
          duration: probe.duration,
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
          hasAudio: probe.hasAudio,
          hasVideo: probe.hasVideo,
          importedAt: Date.now(),
        }
        asset.storage = await storeBlob(asset, file)
        mediaLibrary.register(asset.id, asset.kind, file, { fontFamily: asset.fontFamily })
        setStatus(asset.id, 'ready')
        projectStore.addAsset(asset)
        requestAnalysis(asset, file)
        imported.push(asset)

        if (options.addToTimeline) {
          const itemId = projectStore.addAssetToTimeline(asset, hint)
          const project = projectStore.project
          const placed = itemId && project ? project.tracks.flatMap((t) => t.items).find((i) => i.id === itemId) : undefined
          // Subsequent files of the same drop are chained after this one.
          hint = placed ? { trackId: hint.trackId, time: placed.start + placed.duration, playhead: placed.start + placed.duration } : hint
        }
        update('done')
      } catch (error) {
        update('error')
        ui.toast(`Could not import "${file.name}": ${error instanceof Error ? error.message : String(error)}`, 'error')
      } finally {
        setTimeout(() => {
          imports.value = imports.value.filter((t) => t.id !== task.id)
        }, 1500)
      }
    }

    if (unsupported.length) ui.toast(`Unsupported file type: ${unsupported.join(', ')}`, 'error')
    // Subtitles and plain text become captions.
    for (const file of later) {
      const captions = useCaptionsStore()
      if (classifyFile(file) === 'subtitle') await captions.importSubtitleFile(file)
      else captions.importText(await file.text())
    }
    if (imported.length && options.addToTimeline) editor.engine?.refresh()
    return imported
  }

  /** Imports a custom font file and registers it for text and captions. */
  async function importFont(file) {
    const projectStore = useProjectStore()
    const ui = useUiStore()
    const family = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Custom font'
    const asset = {
      id: createId(),
      kind: 'font',
      name: file.name,
      mimeType: file.type || `font/${extensionOf(file.name)}`,
      size: file.size,
      lastModified: file.lastModified,
      storage: 'indexeddb',
      fontFamily: family,
      importedAt: Date.now(),
    }
    asset.storage = await storeBlob(asset, file)
    mediaLibrary.register(asset.id, 'font', file, { fontFamily: family })
    setStatus(asset.id, 'ready')
    projectStore.addAsset(asset)
    ui.toast(`Font "${family}" is ready to use in text and captions`, 'success')
    return asset
  }

  /** Re-attaches a local file to an asset whose binary is missing. */
  async function relink(assetId, file) {
    const projectStore = useProjectStore()
    const ui = useUiStore()
    const asset = projectStore.project?.assets[assetId]
    if (!asset) return false
    const category = classifyFile(file)
    if (category !== asset.kind && !(asset.kind === 'audio' && category === 'video')) {
      ui.toast(`"${file.name}" is not a ${asset.kind} file.`, 'error')
      return false
    }
    if (file.size !== asset.size || file.name !== asset.name) {
      const ok = await ui.confirm({
        title: 'Different file',
        message: `"${file.name}" does not look like the original "${asset.name}". Use it anyway?`,
        confirmLabel: 'Use this file',
      })
      if (!ok) return false
    }
    const storage = await storeBlob(asset, file)
    mediaLibrary.register(assetId, asset.kind, file, { fontFamily: asset.fontFamily })
    projectStore.updateAsset(assetId, { storage, size: file.size, lastModified: file.lastModified })
    setStatus(assetId, 'ready')
    requestAnalysis(asset, file)
    useEditorStore().engine?.refresh()
    ui.toast(`Re-linked "${asset.name}"`, 'success')
    return true
  }

  /** Re-links several missing assets at once by matching file names. */
  async function relinkMany(files) {
    const projectStore = useProjectStore()
    const project = projectStore.project
    if (!project) return 0
    let count = 0
    for (const file of files) {
      const asset = Object.values(project.assets).find((a) => status.value[a.id] === 'missing' && a.name === file.name)
      if (asset && (await relink(asset.id, file))) count++
    }
    return count
  }

  /** Font families available for text: system fonts plus imported ones. */
  function customFonts() {
    const project = useProjectStore().project
    if (!project) return []
    return Object.values(project.assets)
      .filter((a) => a.kind === 'font' && !a.removed)
      .map((a) => ({ id: a.fontFamily ?? a.name, label: a.fontFamily ?? a.name, assetId: a.id }))
  }

  return { status, imports, loadProjectMedia, unloadAll, importFiles, importFont, customFonts, relink, relinkMany }
})
