<script setup>
import { FilePlus2, Loader2, Upload } from 'lucide-vue-next'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const media = useMediaStore()
const editor = useEditorStore()

const assets = computed(() =>
  Object.values(projectStore.project?.assets ?? {})
    .filter((a) => !a.removed)
    .sort((a, b) => b.importedAt - a.importedAt),
)

async function importFromDevice(addToTimeline) {
  const files = await pickFiles({ accept: MEDIA_ACCEPT, multiple: true })
  if (files.length) {
    await media.importFiles(files, { addToTimeline })
    if (addToTimeline) editor.mobilePanel = null
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between gap-2 px-3 py-2.5">
      <h2 class="panel-title">Media</h2>
      <UiButton size="sm" variant="primary" :icon="FilePlus2" @click="importFromDevice(false)">Import</UiButton>
    </div>

    <ul v-if="media.imports.length" class="space-y-1 px-3 pb-2" aria-live="polite">
      <li v-for="task in media.imports" :key="task.id" class="flex items-center gap-2 rounded-lg bg-panel-2 px-2.5 py-2 text-xs">
        <Loader2 v-if="task.state === 'probing' || task.state === 'storing'" class="size-3.5 animate-spin text-accent" />
        <span class="min-w-0 flex-1 truncate">{{ task.name }}</span>
        <span class="text-muted">
          {{ task.state === 'probing' ? 'Reading…' : task.state === 'storing' ? 'Saving to device…' : task.state === 'done' ? 'Imported' : 'Failed' }}
        </span>
      </li>
    </ul>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <button
        v-if="assets.length === 0"
        type="button"
        class="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-10 text-center transition-colors hover:border-accent hover:bg-accent/5"
        @click="importFromDevice(true)"
      >
        <Upload class="size-7 text-muted" />
        <span class="text-sm font-semibold">Add videos, photos or music</span>
        <span class="text-xs text-muted">Tap to choose files or drag them here.<br />MP4 · WebM · MOV · MP3 · WAV · M4A · PNG · JPG · WebP</span>
      </button>

      <div v-else class="grid grid-cols-2 gap-2">
        <MediaAssetCard v-for="asset in assets" :key="asset.id" :asset="asset" />
      </div>
    </div>
  </div>
</template>
