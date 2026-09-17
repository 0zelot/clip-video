<script setup>
import { AudioLines, EllipsisVertical, HardDriveDownload, Image as ImageIcon, Link2, Plus, Trash2, TriangleAlert } from 'lucide-vue-next'
import { countAssetUsage } from '~/core/model/queries'
import { formatDuration } from '~/core/time'
import { mediaAnalysis } from '~/services/media/analysis'
import { mediaLibrary } from '~/services/media/mediaLibrary'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const props = defineProps({
  /** @type {import('vue').PropType<import('~/core/model/types').MediaAsset>} */
  asset: { type: Object, required: true },
})

const projectStore = useProjectStore()
const media = useMediaStore()
const editor = useEditorStore()
const ui = useUiStore()

const canvas = ref(null)
const menu = ref({ open: false, x: 0, y: 0 })
const status = computed(() => media.status[props.asset.id] ?? 'loading')
const imageUrl = computed(() => (props.asset.kind === 'image' && status.value === 'ready' ? mediaLibrary.getUrl(props.asset.id) : undefined))
const usage = computed(() => (projectStore.project ? countAssetUsage(projectStore.project, props.asset.id) : 0))

function drawThumb() {
  const strip = mediaAnalysis.getFilmstrip(props.asset.id)
  const bitmap = strip?.bitmaps.find((b) => b) ?? null
  const c = canvas.value
  if (!bitmap || !c) return
  c.width = bitmap.width
  c.height = bitmap.height
  c.getContext('2d')?.drawImage(bitmap, 0, 0)
}

let off = null
onMounted(() => {
  drawThumb()
  off = mediaAnalysis.onUpdate((id, kind) => {
    if (id === props.asset.id && kind === 'filmstrip') drawThumb()
  })
})
onBeforeUnmount(() => off?.())

function addToTimeline() {
  if (status.value !== 'ready') return
  const id = projectStore.addAssetToTimeline(props.asset, { playhead: editor.currentTime() })
  if (id) {
    editor.select([id])
    editor.mobilePanel = null
  }
}

async function relink() {
  const [file] = await pickFiles({ multiple: false, accept: MEDIA_ACCEPT })
  if (file) await media.relink(props.asset.id, file)
}

async function remove() {
  if (usage.value > 0) {
    const ok = await ui.confirm({
      title: `Remove "${props.asset.name}"?`,
      message: `It is used by ${usage.value} clip${usage.value === 1 ? '' : 's'} on the timeline, which will be removed too. You can undo this.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
  }
  projectStore.removeAsset(props.asset.id)
  editor.select(editor.selection.filter((id) => projectStore.project?.tracks.some((t) => t.items.some((i) => i.id === id))))
}

const entries = computed(() => [
  { label: 'Add to timeline', icon: Plus, disabled: status.value !== 'ready', run: addToTimeline },
  { label: status.value === 'missing' ? 'Re-link file…' : 'Replace file…', icon: Link2, run: relink },
  { separator: true },
  { label: 'Remove from project', icon: Trash2, danger: true, run: remove },
])

function onDragStart(e) {
  if (status.value !== 'ready' || !e.dataTransfer) {
    e.preventDefault()
    return
  }
  e.dataTransfer.setData('application/x-clip-asset', props.asset.id)
  e.dataTransfer.effectAllowed = 'copy'
}

function openMenu(e) {
  menu.value = { open: true, x: e.clientX, y: e.clientY }
}
</script>

<template>
  <div
    class="group relative overflow-hidden rounded-xl border border-line bg-panel-2"
    :draggable="status === 'ready'"
    @dragstart="onDragStart"
    @contextmenu.prevent="openMenu"
    @dblclick="addToTimeline"
  >
    <div class="relative aspect-video bg-black">
      <canvas v-if="asset.kind === 'video'" ref="canvas" class="size-full object-cover" />
      <img v-else-if="imageUrl" :src="imageUrl" alt="" class="size-full object-cover" draggable="false" />
      <div v-else class="grid size-full place-items-center bg-clip-audio/20">
        <AudioLines v-if="asset.kind === 'audio'" class="size-7 text-clip-audio" />
        <ImageIcon v-else class="size-7 text-muted" />
      </div>

      <div v-if="status === 'missing'" class="absolute inset-0 grid place-items-center bg-black/70">
        <button type="button" class="flex items-center gap-1 rounded-md bg-warn px-2 py-1 text-xs font-semibold text-black" @click="relink">
          <Link2 class="size-3.5" /> Re-link
        </button>
      </div>
      <div v-else-if="status === 'loading'" class="absolute inset-0 animate-pulse bg-panel-3/60" />

      <span v-if="asset.duration" class="absolute right-1 bottom-1 rounded bg-black/75 px-1 font-mono text-[10px]">
        {{ formatDuration(asset.duration) }}
      </span>
      <span
        v-if="asset.storage === 'memory' && status === 'ready'"
        v-tooltip="'Not stored on this device - will need re-linking after restart'"
        class="absolute top-1 left-1 grid size-5 place-items-center rounded bg-warn text-black"
      >
        <HardDriveDownload class="size-3" />
      </span>
      <span
        v-if="usage > 0"
        v-tooltip="`Used ${usage}× on the timeline`"
        class="absolute top-1 right-1 rounded bg-accent px-1 text-[10px] font-bold text-accent-fg"
      >
        {{ usage }}
      </span>

      <button
        v-if="status === 'ready'"
        type="button"
        class="absolute inset-0 m-auto grid size-9 place-items-center rounded-full bg-accent text-accent-fg opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus:opacity-100 coarse:opacity-90"
        :aria-label="`Add ${asset.name} to timeline`"
        @click="addToTimeline"
      >
        <Plus class="size-5" />
      </button>
    </div>
    <div class="flex items-center gap-1 py-1 pr-0.5 pl-2">
      <TriangleAlert v-if="status === 'missing'" class="size-3.5 shrink-0 text-warn" />
      <p class="min-w-0 flex-1 truncate text-xs" :title="asset.name">{{ asset.name }}</p>
      <UiIconButton :icon="EllipsisVertical" label="Media actions" size="sm" @click="openMenu" />
    </div>
    <UiMenu :open="menu.open" :x="menu.x" :y="menu.y" :items="entries" @close="menu.open = false" />
  </div>
</template>
