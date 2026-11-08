import { defineStore } from 'pinia'
import { produce } from 'immer'
import { computed, ref, shallowRef } from 'vue'
import * as itemOps from '~/core/operations/items'
import * as projectOps from '~/core/operations/project'
import * as textOps from '~/core/operations/text'
import { projectDuration } from '~/core/model/queries'
import { removeKeyframesAt, setKeyframes } from '~/core/render/animate'
import { projectRepository } from '~/services/storage/projectRepository'

/**
 * @typedef {'saved' | 'saving' | 'unsaved' | 'error'} SaveStatus
 *
 * The part of a project covered by undo/redo. Assets and the name are not.
 * @typedef {{ tracks: import('~/core/model/types').Track[], settings: import('~/core/model/types').ProjectSettings }} Snapshot
 *
 * @typedef {{ snapshot: Snapshot, label: string, key?: string, time: number }} HistoryEntry
 *
 * @typedef {object} MutateOptions
 * @property {boolean} [history] record an undo step (default true)
 * @property {string} [coalesceKey] consecutive changes with the same key within
 *   a short window share one undo step (sliders, typing)
 */

const HISTORY_LIMIT = 200
const COALESCE_WINDOW_MS = 1200
const AUTOSAVE_DELAY_MS = 800
const AUTOSAVE_MAX_WAIT_MS = 5000
const AUTOSAVE_PREF_KEY = 'clip:autosave'

function readAutosavePref() {
  try {
    return localStorage.getItem(AUTOSAVE_PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * Holds the open project as an immutable value.
 *
 * Every change goes through `mutate`, which uses Immer to produce the next
 * state with structural sharing. Undo entries are just references to previous
 * `tracks`/`settings` objects, so history costs almost no memory and never
 * contains media data.
 */
export const useProjectStore = defineStore('project', () => {
  /** @type {import('vue').ShallowRef<import('~/core/model/types').Project | null>} */
  const project = shallowRef(null)
  /** @type {import('vue').ShallowRef<HistoryEntry[]>} */
  const past = shallowRef([])
  /** @type {import('vue').ShallowRef<HistoryEntry[]>} */
  const future = shallowRef([])

  /** @type {import('vue').Ref<SaveStatus>} */
  const saveStatus = ref('saved')
  const saveError = ref(null)
  const lastSavedAt = ref(null)
  const autosave = ref(readAutosavePref())
  const revision = ref(0)

  let savedRevision = 0
  let saveTimer = null
  let firstDirtyAt = 0
  let saving = null

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)
  const undoLabel = computed(() => past.value[past.value.length - 1]?.label ?? null)
  const redoLabel = computed(() => future.value[future.value.length - 1]?.label ?? null)
  const duration = computed(() => (project.value ? projectDuration(project.value) : 0))
  const hasUnsavedChanges = computed(() => saveStatus.value !== 'saved')

  function open(p) {
    cancelScheduledSave()
    project.value = p
    past.value = []
    future.value = []
    revision.value = 0
    savedRevision = 0
    saveStatus.value = 'saved'
    saveError.value = null
    lastSavedAt.value = p.updatedAt
  }

  function close() {
    cancelScheduledSave()
    project.value = null
    past.value = []
    future.value = []
  }

  function markDirty() {
    revision.value++
    saveStatus.value = 'unsaved'
    if (autosave.value) scheduleSave()
  }

  /**
   * @param {string} label shown in the undo tooltip
   * @param {(draft: import('~/core/model/types').Project) => unknown} recipe
   * @param {MutateOptions} [options]
   */
  function mutate(label, recipe, options = {}) {
    const current = project.value
    if (!current) return undefined
    let result
    const next = produce(current, (draft) => {
      result = recipe(draft)
    })
    if (next === current) return result

    if (options.history !== false) {
      const now = Date.now()
      const last = past.value[past.value.length - 1]
      if (options.coalesceKey && last?.key === options.coalesceKey && now - last.time < COALESCE_WINDOW_MS) {
        last.time = now
      } else {
        const entry = { snapshot: { tracks: current.tracks, settings: current.settings, markers: current.markers ?? [] }, label, key: options.coalesceKey, time: now }
        past.value = [...past.value.slice(-(HISTORY_LIMIT - 1)), entry]
      }
      if (future.value.length) future.value = []
    }
    project.value = { ...next, updatedAt: Date.now() }
    markDirty()
    return result
  }

  function restore(from, to) {
    const current = project.value
    const entry = from.value[from.value.length - 1]
    if (!current || !entry) return null
    from.value = from.value.slice(0, -1)
    to.value = [...to.value, { snapshot: { tracks: current.tracks, settings: current.settings, markers: current.markers ?? [] }, label: entry.label, time: 0 }]
    project.value = { ...current, ...entry.snapshot, updatedAt: Date.now() }
    markDirty()
    return entry.label
  }

  const undo = () => restore(past, future)
  const redo = () => restore(future, past)

  // ----- persistence --------------------------------------------------------

  function cancelScheduledSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = null
    firstDirtyAt = 0
  }

  function scheduleSave() {
    const now = Date.now()
    if (!firstDirtyAt) firstDirtyAt = now
    if (saveTimer) clearTimeout(saveTimer)
    // Debounce, but never postpone longer than AUTOSAVE_MAX_WAIT_MS during continuous edits.
    const delay = Math.max(0, Math.min(AUTOSAVE_DELAY_MS, firstDirtyAt + AUTOSAVE_MAX_WAIT_MS - now))
    saveTimer = setTimeout(() => void save(), delay)
  }

  /** @returns {Promise<boolean>} whether the project is stored */
  async function save() {
    cancelScheduledSave()
    if (saving) {
      await saving
      if (revision.value === savedRevision) return true
    }
    const snapshot = project.value
    if (!snapshot) return true
    const rev = revision.value
    saveStatus.value = 'saving'
    saving = (async () => {
      try {
        await projectRepository.save(snapshot)
        savedRevision = rev
        lastSavedAt.value = Date.now()
        saveError.value = null
        saveStatus.value = revision.value === rev ? 'saved' : 'unsaved'
        if (saveStatus.value === 'unsaved' && autosave.value) scheduleSave()
        return true
      } catch (error) {
        saveError.value = error instanceof Error ? error.message : String(error)
        saveStatus.value = 'error'
        return false
      } finally {
        saving = null
      }
    })()
    return saving
  }

  function setAutosave(enabled) {
    autosave.value = enabled
    try {
      localStorage.setItem(AUTOSAVE_PREF_KEY, enabled ? 'on' : 'off')
    } catch {
      // preference is optional
    }
    if (enabled && saveStatus.value !== 'saved') scheduleSave()
  }

  // ----- editing actions ----------------------------------------------------

  const actions = {
    rename: (name) => mutate('Rename project', (p) => void (p.name = name.trim() || p.name), { history: false }),
    updateSettings: (patch, key) => mutate('Change project settings', (p) => projectOps.updateSettings(p, patch), { coalesceKey: key }),

    addAsset: (asset) => mutate('Import media', (p) => projectOps.addAsset(p, asset), { history: false }),
    updateAsset: (assetId, patch) => mutate('Update media', (p) => projectOps.updateAsset(p, assetId, patch), { history: false }),
    removeAsset: (assetId) => mutate('Remove media', (p) => projectOps.removeAssetFromProject(p, assetId)),
    addAssetToTimeline: (asset, hint) => mutate('Add to timeline', (p) => itemOps.addAssetToTimeline(p, asset, hint)?.id ?? null),

    moveItem: (itemId, trackId, start) => mutate('Move clip', (p) => itemOps.moveItem(p, itemId, trackId, start)),
    moveItemToNewTrack: (itemId, start, kind, index) =>
      mutate('Move clip to new track', (p) => {
        const track = itemOps.addTrack(p, kind, index)
        return itemOps.moveItem(p, itemId, track.id, start)
      }),
    trimStart: (itemId, time) => mutate('Trim clip', (p) => itemOps.trimItemStart(p, itemId, time)),
    trimEnd: (itemId, time) => mutate('Trim clip', (p) => itemOps.trimItemEnd(p, itemId, time)),
    split: (time, itemIds) => mutate('Split', (p) => itemOps.splitAt(p, time, itemIds)) ?? [],
    deleteItems: (itemIds) => mutate('Delete', (p) => itemOps.deleteItems(p, itemIds)) ?? 0,
    duplicateItems: (itemIds) => mutate('Duplicate', (p) => itemOps.duplicateItems(p, itemIds)) ?? [],
    deleteRange: (from, to, ripple) => mutate('Delete range', (p) => itemOps.deleteRange(p, from, to, ripple)),
    setItemTiming: (itemId, timing) => mutate('Change timing', (p) => itemOps.setItemTiming(p, itemId, timing)),
    setSourceIn: (itemId, sourceIn) => mutate('Change in point', (p) => itemOps.setSourceIn(p, itemId, sourceIn)),
    updateItem: (itemId, patch, key, label = 'Edit clip') =>
      mutate(label, (p) => itemOps.updateItem(p, itemId, patch), { coalesceKey: key }),

    // ----- speed, transitions, effects -----
    setItemSpeed: (itemId, speed) => mutate('Change speed', (p) => itemOps.setItemSpeed(p, itemId, speed), { coalesceKey: `speed:${itemId}` }),
    /**
     * Splits the clips at the range borders and runs `apply` on the pieces
     * inside - used for "apply to this part only" (speed, effects, volume).
     * @returns {string[]} ids of the affected pieces
     */
    applyToRange: (from, to, itemIds, apply, label = 'Edit range') =>
      mutate(label, (p) => {
        const ids = itemOps.isolateRange(p, from, to, itemIds)
        for (const id of ids) apply(p, id)
        return ids
      }) ?? [],
    setTransition: (itemId, transition) => mutate('Change transition', (p) => itemOps.setTransition(p, itemId, transition)),
    applyTransitionToTrack: (itemId, transition) =>
      mutate('Apply transition to all cuts', (p) => itemOps.applyTransitionToTrack(p, itemId, transition)) ?? 0,
    setSpeedRamp: (itemId, speed, ramp) =>
      mutate('Speed ramp', (p) => itemOps.setItemSpeed(p, itemId, speed, { ramp: ramp ?? null }), { coalesceKey: `speedramp:${itemId}` }),
    setEffectsRamp: (itemId, ramp) =>
      mutate('Effect fade', (p) => {
        const item = p.tracks.flatMap((t) => t.items).find((i) => i.id === itemId)
        if (!item) return false
        if (!ramp || (!(ramp.rampIn > 0) && !(ramp.rampOut > 0))) delete item.effectsRamp
        else item.effectsRamp = { from: ramp.from ?? item.effectsRamp?.from ?? {}, rampIn: Math.max(0, ramp.rampIn ?? 0), rampOut: Math.max(0, ramp.rampOut ?? 0) }
        return true
      }, { coalesceKey: `fxramp:${itemId}` }),
    setKeyframes: (itemId, local, values, key) =>
      mutate('Keyframe', (p) => {
        const item = p.tracks.flatMap((t) => t.items).find((i) => i.id === itemId)
        if (!item) return false
        setKeyframes(item, local, values)
        return true
      }, { coalesceKey: key }),
    removeKeyframesAt: (itemId, local) =>
      mutate('Remove keyframe', (p) => {
        const item = p.tracks.flatMap((t) => t.items).find((i) => i.id === itemId)
        if (!item) return false
        removeKeyframesAt(item, local)
        return true
      }),
    clearKeyframes: (itemId) =>
      mutate('Clear keyframes', (p) => {
        const item = p.tracks.flatMap((t) => t.items).find((i) => i.id === itemId)
        if (item) delete item.keyframes
      }),
    insertOverlay: (item, label = 'Add overlay', options = {}) => mutate(label, (p) => itemOps.insertOverlay(p, item, options)?.id ?? null),
    insertFreezeFrame: (videoItemId, t, still) => mutate('Freeze frame', (p) => itemOps.insertFreezeFrame(p, videoItemId, t, still)),
    addMarker: (marker) => mutate('Add marker', (p) => projectOps.addMarker(p, marker)),
    removeMarker: (markerId) => mutate('Remove marker', (p) => projectOps.removeMarker(p, markerId)),
    cutRangesFromItem: (itemId, ranges, label = 'Remove silences') =>
      mutate(label, (p) => itemOps.cutRangesFromItem(p, itemId, ranges)) ?? { removed: 0, seconds: 0 },
    replaceAsset: (itemId, assetId, name) => mutate('Replace media', (p) => itemOps.updateItem(p, itemId, { assetId, name })),
    setMotion: (itemId, motion) =>
      mutate('Change motion', (p) => itemOps.updateItem(p, itemId, { motion }), { coalesceKey: `motion:${itemId}` }),
    setEffects: (itemId, effects, key) =>
      mutate('Change effects', (p) => itemOps.updateItem(p, itemId, { effects }), { coalesceKey: key ?? `effects:${itemId}` }),
    setTransform: (itemId, transform, key) =>
      mutate('Transform clip', (p) => itemOps.updateItem(p, itemId, { transform }), { coalesceKey: key ?? `transform:${itemId}` }),

    // ----- text & captions -----
    addTextItem: (options) => mutate('Add text', (p) => textOps.addTextItem(p, options)),
    setTextContent: (itemId, text) =>
      mutate('Edit text', (p) => itemOps.updateItem(p, itemId, { text, name: text.slice(0, 24) || 'Text' }), { coalesceKey: `text:${itemId}` }),
    setTextStyle: (itemId, patch, key) =>
      mutate('Change text style', (p) => {
        const loc = p.tracks.flatMap((t) => t.items).find((i) => i.id === itemId)
        if (!loc) return false
        loc.style = { ...loc.style, ...patch }
        return true
      }, { coalesceKey: key ?? `style:${itemId}` }),
    setTextAnimation: (itemId, patch) =>
      mutate('Change text animation', (p) => {
        const item = p.tracks.flatMap((t) => t.items).find((i) => i.id === itemId)
        if (!item) return false
        item.animation = { in: { ...item.animation.in, ...(patch.in ?? {}) }, out: { ...item.animation.out, ...(patch.out ?? {}) } }
        return true
      }),
    setCaptionText: (itemId, text, words) => mutate('Edit caption', (p) => textOps.setCaptionText(p, itemId, text, words), { coalesceKey: `caption:${itemId}` }),
    mergeCaptionWithNext: (itemId) => mutate('Merge captions', (p) => textOps.mergeCaptionWithNext(p, itemId)),
    splitCaptionAtWord: (itemId, wordIndex) => mutate('Split caption', (p) => textOps.splitCaptionAtWord(p, itemId, wordIndex)),
    saveTextPreset: (preset) =>
      mutate('Save text preset', (p) => {
        p.savedTextStyles = [...(p.savedTextStyles ?? []).filter((x) => x.id !== preset.id), preset]
      }, { history: false }),

    addTrack: (kind) => mutate('Add track', (p) => itemOps.addTrack(p, kind).id),
    updateTrack: (trackId, patch) => mutate('Change track', (p) => projectOps.updateTrack(p, trackId, patch)),
    moveTrack: (trackId, direction) => mutate('Reorder tracks', (p) => projectOps.moveTrack(p, trackId, direction)),
    removeTrack: (trackId) => mutate('Delete track', (p) => projectOps.removeTrack(p, trackId)),
  }

  return {
    project,
    past,
    future,
    saveStatus,
    saveError,
    lastSavedAt,
    autosave,
    revision,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    duration,
    hasUnsavedChanges,
    open,
    close,
    mutate,
    undo,
    redo,
    save,
    setAutosave,
    ...actions,
  }
})
