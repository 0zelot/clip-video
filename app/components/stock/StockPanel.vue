<script setup>
/**
 * Free stock videos (Wikimedia Commons, NASA). The catalogue is loaded in the
 * background at start-up; categories whose source is unreachable are hidden.
 */
import { Copy, ExternalLink, Library, Loader2, Plus, RefreshCw } from 'lucide-vue-next'
import { formatDuration } from '~/core/time'
import { creditsText } from '~/services/stock/stockLibrary'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'
import { useStockStore } from '~/stores/stock'
import { useUiStore } from '~/stores/ui'

const stock = useStockStore()
const editor = useEditorStore()
const projectStore = useProjectStore()
const ui = useUiStore()
const online = useOnline()

onMounted(() => void stock.prefetch())

const activeId = ref('')
const category = computed(() => stock.categories.find((c) => c.id === activeId.value) ?? stock.categories[0] ?? null)
/** Clip whose small preview video is playing (hover / tap on the picture). */
const previewing = ref(null)

const credited = computed(() => Object.values(projectStore.project?.assets ?? {}).filter((a) => a.credit && !a.removed))

async function add(clip, addToTimeline) {
  const asset = await stock.importClip(clip, { addToTimeline })
  if (asset && addToTimeline) editor.mobilePanel = null
}

async function copyCredits() {
  try {
    await navigator.clipboard.writeText(creditsText(credited.value))
    ui.toast('Credits copied - paste them into the video description', 'success')
  } catch {
    ui.toast('The browser did not allow copying to the clipboard', 'error')
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between gap-2 px-3 py-2.5">
      <h2 class="panel-title">Stock videos</h2>
      <UiIconButton :icon="stock.refreshing ? Loader2 : RefreshCw" label="Refresh" size="sm" :class="stock.refreshing ? 'animate-spin' : ''" :disabled="stock.refreshing || !online" @click="stock.prefetch({ force: true })" />
    </div>

    <div v-if="stock.categories.length" class="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
      <button
        v-for="c in stock.categories"
        :key="c.id"
        type="button"
        class="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium coarse:py-1.5"
        :class="category?.id === c.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
        @click="activeId = c.id"
      >
        {{ c.label }}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <div v-if="!category" class="rounded-xl bg-panel-2 p-4 text-center text-xs text-muted">
        <template v-if="stock.refreshing || !stock.loaded">
          <Loader2 class="mx-auto mb-2 size-5 animate-spin text-accent" />
          Loading free stock videos…
        </template>
        <template v-else>
          <p>{{ online ? 'Stock videos are not available right now.' : 'Stock videos need an internet connection.' }}</p>
          <UiButton size="sm" class="mt-2" :icon="RefreshCw" :disabled="!online" @click="stock.prefetch({ force: true })">Try again</UiButton>
        </template>
      </div>

      <div v-else class="grid grid-cols-2 gap-2">
        <div v-for="clip in category.clips" :key="clip.id" class="group overflow-hidden rounded-xl border border-line bg-panel-2">
          <div
            class="relative aspect-video bg-black"
            @pointerenter="clip.previewUrl && (previewing = clip.id)"
            @pointerleave="previewing === clip.id && (previewing = null)"
            @click="clip.previewUrl && (previewing = previewing === clip.id ? null : clip.id)"
          >
            <video
              v-if="previewing === clip.id"
              :src="clip.previewUrl"
              class="size-full object-cover"
              muted
              autoplay
              loop
              playsinline
              disablepictureinpicture
            />
            <img v-else :src="clip.thumb" alt="" loading="lazy" decoding="async" class="size-full object-cover" draggable="false" referrerpolicy="no-referrer" />
            <span v-if="clip.duration" class="absolute right-1 bottom-1 rounded bg-black/75 px-1 font-mono text-[10px]">{{ formatDuration(clip.duration) }}</span>
            <div v-if="clip.id in stock.downloads" class="absolute inset-0 grid place-items-center bg-black/60">
              <div class="w-3/4">
                <div class="h-1.5 overflow-hidden rounded-full bg-white/20">
                  <div class="h-full rounded-full bg-accent transition-[width]" :style="{ width: `${Math.round(stock.downloads[clip.id] * 100)}%` }" />
                </div>
                <p class="mt-1 text-center text-[10px]">Downloading…</p>
              </div>
            </div>
          </div>
          <div class="space-y-1 px-2 py-1.5">
            <p class="truncate text-xs" :title="clip.title">{{ clip.title }}</p>
            <p class="truncate text-[10px] text-muted" :title="`${clip.author} · ${clip.license}`">{{ clip.author }} · {{ clip.license }}</p>
            <div class="flex items-center gap-1">
              <UiButton size="sm" variant="primary" class="flex-1" :icon="Plus" :disabled="clip.id in stock.downloads" @click="add(clip, true)">Add</UiButton>
              <UiIconButton :icon="Library" label="Download to media library only" size="sm" :disabled="clip.id in stock.downloads" @click="add(clip, false)" />
              <a :href="clip.pageUrl" target="_blank" rel="noopener noreferrer" class="grid size-7 place-items-center rounded-md text-muted hover:text-fg coarse:size-10" :aria-label="`Source and licence of ${clip.title}`">
                <ExternalLink class="size-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-1.5 border-t border-line px-3 py-2 text-[11px] text-muted">
      <p>Free clips from Wikimedia Commons and NASA. <span class="text-fg">CC BY</span> clips must credit their author when you publish.</p>
      <UiButton v-if="credited.length" size="sm" block :icon="Copy" @click="copyCredits">Copy credits ({{ credited.length }})</UiButton>
    </div>
  </div>
</template>
