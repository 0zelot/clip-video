import { useEditorStore } from '~/stores/editor'

export function useOnline() {
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const update = () => (online.value = navigator.onLine)
  onMounted(() => {
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  })
  return online
}

export function useMediaQuery(query) {
  const matches = ref(false)
  let mql = null
  const update = () => (matches.value = mql?.matches ?? false)
  onMounted(() => {
    mql = window.matchMedia(query)
    update()
    mql.addEventListener('change', update)
  })
  onBeforeUnmount(() => mql?.removeEventListener('change', update))
  return matches
}

/**
 * Subscribes to the playback clock outside of Vue reactivity. The callback
 * receives every time update (use it to write to the DOM directly).
 *
 * @param {(time: number) => void} callback
 */
export function usePlaybackTime(callback) {
  const editor = useEditorStore()
  let unsubscribe = null
  const stop = watch(
    () => editor.engine,
    (engine) => {
      unsubscribe?.()
      unsubscribe = engine ? engine.onTime(callback) : null
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    stop()
    unsubscribe?.()
  })
}
