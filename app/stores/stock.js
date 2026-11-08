import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  CATALOG_MAX_AGE_MS,
  STOCK_CATEGORIES,
  creditFor,
  downloadClip,
  fetchCategory,
  readCatalogCache,
  writeCatalogCache,
} from '~/services/stock/stockLibrary'
import { useMediaStore } from '~/stores/media'
import { useUiStore } from '~/stores/ui'

const CONCURRENCY = 3

/**
 * Stock video catalogue: shown from the local cache at once, refreshed in the
 * background at start-up. Categories whose source is unreachable keep their
 * cached clips, or are simply not shown.
 */
export const useStockStore = defineStore('stock', () => {
  /** @type {import('vue').ShallowRef<Record<string, { clips: import('~/services/stock/stockLibrary').StockClip[], fetchedAt: number }>>} */
  const catalog = shallowRef({})
  const refreshing = ref(false)
  const loaded = ref(false)
  /** clip id -> download progress 0..1 */
  const downloads = ref({})
  let refreshPromise = null

  const categories = computed(() =>
    STOCK_CATEGORIES.map((c) => ({ id: c.id, label: c.label, clips: catalog.value[c.id]?.clips ?? [] })).filter((c) => c.clips.length > 0),
  )

  function loadCache() {
    if (loaded.value) return
    catalog.value = readCatalogCache()
    loaded.value = true
  }

  /**
   * Shows the cached catalogue and refreshes stale categories in the
   * background. Safe to call often - work is shared and nothing throws.
   * @param {{ force?: boolean }} [options]
   */
  function prefetch(options = {}) {
    loadCache()
    if (refreshPromise) return refreshPromise
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve()
    const now = Date.now()
    const stale = STOCK_CATEGORIES.filter((c) => options.force || !(now - (catalog.value[c.id]?.fetchedAt ?? 0) < CATALOG_MAX_AGE_MS))
    if (!stale.length) return Promise.resolve()
    refreshing.value = true
    refreshPromise = (async () => {
      const queue = [...stale]
      const worker = async () => {
        for (let category = queue.shift(); category; category = queue.shift()) {
          try {
            const clips = await fetchCategory(category)
            if (clips.length) {
              catalog.value = { ...catalog.value, [category.id]: { clips, fetchedAt: Date.now() } }
              writeCatalogCache(catalog.value)
            }
          } catch {
            // Source down or offline: keep what we had (or show nothing).
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    })().finally(() => {
      refreshing.value = false
      refreshPromise = null
    })
    return refreshPromise
  }

  /**
   * Downloads a clip into the project's media library.
   * @param {import('~/services/stock/stockLibrary').StockClip} clip
   * @param {{ addToTimeline?: boolean }} [options]
   */
  async function importClip(clip, options = {}) {
    if (clip.id in downloads.value) return null
    const media = useMediaStore()
    const ui = useUiStore()
    downloads.value = { ...downloads.value, [clip.id]: 0 }
    try {
      const file = await downloadClip(clip, {
        onProgress: (ratio) => (downloads.value = { ...downloads.value, [clip.id]: ratio }),
      })
      const [asset] = await media.importFiles([file], { addToTimeline: options.addToTimeline, credit: creditFor(clip) })
      if (asset) {
        ui.toast(
          clip.license === 'Public domain' ? `Added "${clip.title}"` : `Added "${clip.title}" - ${clip.license}: credit ${clip.author} when you publish`,
          'success',
        )
      }
      return asset ?? null
    } catch (error) {
      ui.toast(`Could not download "${clip.title}": ${error instanceof Error ? error.message : String(error)}`, 'error')
      return null
    } finally {
      const { [clip.id]: _, ...rest } = downloads.value
      downloads.value = rest
    }
  }

  return { catalog, categories, refreshing, loaded, downloads, prefetch, importClip }
})
