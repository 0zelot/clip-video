<script setup>
import { Copy, EllipsisVertical, Film, Pencil, Trash2, TriangleAlert } from 'lucide-vue-next'
import { findFormatPreset } from '~/core/model/defaults'
import { formatDuration } from '~/core/time'
import { projectRepository } from '~/services/storage/projectRepository'

const props = defineProps({
  /** @type {import('vue').PropType<import('~/services/storage/projectRepository').ProjectSummary>} */
  project: { type: Object, required: true },
})
const emit = defineEmits(['open', 'rename', 'duplicate', 'delete'])

const thumbUrl = ref(null)
const menu = ref({ open: false, x: 0, y: 0 })

onMounted(async () => {
  const blob = await projectRepository.getThumbnail(props.project.id).catch(() => null)
  if (blob) thumbUrl.value = URL.createObjectURL(blob)
})
onBeforeUnmount(() => {
  if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value)
})

const format = computed(
  () => findFormatPreset(props.project.width, props.project.height)?.label ?? `${props.project.width}×${props.project.height}`,
)

const updated = computed(() => {
  const diff = Date.now() - props.project.updatedAt
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  return new Date(props.project.updatedAt).toLocaleDateString()
})

const entries = [
  { label: 'Rename', icon: Pencil, run: () => emit('rename') },
  { label: 'Duplicate', icon: Copy, run: () => emit('duplicate') },
  { separator: true },
  { label: 'Delete', icon: Trash2, danger: true, run: () => emit('delete') },
]

function openMenu(e) {
  menu.value = { open: true, x: e.clientX, y: e.clientY }
}
</script>

<template>
  <article
    class="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-subtle"
    @contextmenu.prevent="openMenu"
  >
    <button type="button" class="relative block aspect-video w-full overflow-hidden bg-panel-2" :aria-label="`Open ${project.name}`" @click="emit('open')">
      <img v-if="thumbUrl" :src="thumbUrl" alt="" class="size-full object-contain" />
      <div v-else class="grid size-full place-items-center">
        <Film class="size-8 text-subtle" />
      </div>
      <span class="absolute right-2 bottom-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px]">
        {{ formatDuration(project.duration) }}
      </span>
      <span class="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold">{{ format }}</span>
    </button>
    <div class="flex items-start gap-1 p-3">
      <button type="button" class="min-w-0 flex-1 text-left" @click="emit('open')">
        <h3 class="truncate text-sm font-semibold">{{ project.name }}</h3>
        <p class="mt-0.5 flex items-center gap-1 text-xs text-muted">
          {{ updated }} · {{ project.assetCount }} file{{ project.assetCount === 1 ? '' : 's' }}
          <TriangleAlert v-if="project.missingStorage" v-tooltip="'Some media is not stored on this device'" class="size-3.5 text-warn" />
        </p>
      </button>
      <UiIconButton :icon="EllipsisVertical" label="Project actions" size="sm" @click="openMenu" />
    </div>
    <UiMenu :open="menu.open" :x="menu.x" :y="menu.y" :items="entries" @close="menu.open = false" />
  </article>
</template>
