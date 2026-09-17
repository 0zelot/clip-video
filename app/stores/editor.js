import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import { PlaybackEngine } from '~/services/playback/PlaybackEngine'
import { useProjectStore } from './project'

/** @typedef {'media' | 'properties' | 'project' | null} MobilePanel */

export const MIN_ZOOM = 2
export const MAX_ZOOM = 600

const TIMELINE_HEIGHT_KEY = 'clip:timeline-height'

function readNumber(key, fallback) {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

/** Transient editor UI state. Nothing here is part of the saved project. */
export const useEditorStore = defineStore('editor', () => {
  /** @type {import('vue').Ref<string[]>} */
  const selection = ref([])
  /** Timeline zoom, pixels per second. */
  const zoom = ref(60)
  const snapping = ref(true)
  const markIn = ref(null)
  const markOut = ref(null)
  const playing = ref(false)
  const timelineHeight = ref(readNumber(TIMELINE_HEIGHT_KEY, 300))
  /** @type {import('vue').Ref<MobilePanel>} */
  const mobilePanel = ref(null)
  /** Active tab of the left sidebar: 'media' | 'text' | 'captions'. */
  const sidebarTab = ref('media')
  const exportOpen = ref(false)
  /** @type {import('vue').ShallowRef<PlaybackEngine | null>} */
  const engine = shallowRef(null)

  let unsubscribeState = null

  function createEngine() {
    destroyEngine()
    const projectStore = useProjectStore()
    const e = markRaw(new PlaybackEngine(() => projectStore.project))
    unsubscribeState = e.onStateChange((p) => (playing.value = p))
    engine.value = e
    return e
  }

  function destroyEngine() {
    unsubscribeState?.()
    unsubscribeState = null
    engine.value?.destroy()
    engine.value = null
    playing.value = false
  }

  /** Brings the properties of the selected clip into view on any screen size. */
  function focusProperties() {
    mobilePanel.value = 'properties'
    if (typeof document === 'undefined') return
    requestAnimationFrame(() => {
      const panel = document.querySelector('[data-properties-panel]')
      panel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      panel?.animate?.([{ outline: '2px solid var(--color-accent)' }, { outline: '2px solid transparent' }], { duration: 900 })
    })
  }

  function reset() {
    selection.value = []
    markIn.value = null
    markOut.value = null
    mobilePanel.value = null
    exportOpen.value = false
  }

  function select(ids) {
    selection.value = ids
  }

  function toggleSelect(id) {
    selection.value = selection.value.includes(id) ? selection.value.filter((i) => i !== id) : [...selection.value, id]
  }

  function setZoom(value) {
    zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
  }

  function setTimelineHeight(px) {
    timelineHeight.value = Math.round(px)
    try {
      localStorage.setItem(TIMELINE_HEIGHT_KEY, String(timelineHeight.value))
    } catch {
      // optional
    }
  }

  /** Current playhead time (not reactive - read on demand). */
  function currentTime() {
    return engine.value?.time ?? 0
  }

  return {
    selection,
    zoom,
    snapping,
    markIn,
    markOut,
    playing,
    timelineHeight,
    mobilePanel,
    sidebarTab,
    exportOpen,
    engine,
    focusProperties,
    createEngine,
    destroyEngine,
    reset,
    select,
    toggleSelect,
    setZoom,
    setTimelineHeight,
    currentTime,
  }
})
