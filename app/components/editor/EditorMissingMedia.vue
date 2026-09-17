<script setup>
import { Link2, TriangleAlert, X } from 'lucide-vue-next'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const media = useMediaStore()
const projectStore = useProjectStore()
const ui = useUiStore()
const dismissed = ref(false)

const missing = computed(() => {
  const project = projectStore.project
  if (!project) return []
  return Object.values(project.assets).filter((a) => !a.removed && media.status[a.id] === 'missing')
})

async function relinkAll() {
  const files = await pickFiles({ multiple: true })
  if (!files.length) return
  const count = await media.relinkMany(files)
  if (count === 0) {
    ui.toast('None of the selected files match the missing media names. Use "Re-link" on a single file in the Media panel.', 'warning')
  }
}
</script>

<template>
  <div v-if="missing.length && !dismissed" class="flex items-center gap-3 border-b border-warn/30 bg-warn/10 px-3 py-2 text-sm" role="alert">
    <TriangleAlert class="size-4 shrink-0 text-warn" />
    <p class="min-w-0 flex-1">
      <strong>{{ missing.length }} media file{{ missing.length === 1 ? ' is' : 's are' }} offline.</strong>
      <span class="text-muted"> They could not be kept in this device's storage. Select the original files to re-link them.</span>
    </p>
    <UiButton size="sm" :icon="Link2" @click="relinkAll">Re-link files</UiButton>
    <UiIconButton :icon="X" label="Dismiss" size="sm" @click="dismissed = true" />
  </div>
</template>
