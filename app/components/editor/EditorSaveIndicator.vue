<script setup>
import { CircleAlert, CircleDot, Cloud, CloudOff, Loader2 } from 'lucide-vue-next'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const online = useOnline()

const state = computed(() => {
  switch (projectStore.saveStatus) {
    case 'saving':
      return { icon: Loader2, text: 'Saving…', class: 'text-muted', spin: true }
    case 'unsaved':
      return { icon: CircleDot, text: 'Unsaved changes', class: 'text-warn', spin: false }
    case 'error':
      return { icon: CircleAlert, text: 'Save failed', class: 'text-danger', spin: false }
    default:
      return { icon: Cloud, text: 'Saved', class: 'text-muted', spin: false }
  }
})

const tooltip = computed(() => {
  const parts = []
  if (projectStore.saveStatus === 'error') parts.push(`Error: ${projectStore.saveError}`)
  if (projectStore.lastSavedAt) parts.push(`Last saved ${new Date(projectStore.lastSavedAt).toLocaleTimeString()}`)
  parts.push(projectStore.autosave ? 'Autosave is on' : 'Autosave is off - press Ctrl+S to save')
  if (!online.value) parts.push('You are offline - editing and saving keep working locally')
  return parts.join('\n')
})
</script>

<template>
  <div class="flex items-center gap-2 text-xs">
    <span v-tooltip="tooltip" class="flex items-center gap-1.5 rounded-md px-1.5 py-1" :class="state.class" role="status">
      <component :is="state.icon" class="size-3.5" :class="state.spin ? 'animate-spin' : ''" />
      <span class="hidden sm:inline">{{ state.text }}</span>
    </span>
    <span
      v-if="!online"
      v-tooltip="'No network connection. Clip works fully offline.'"
      class="flex items-center gap-1 rounded-md bg-panel-3 px-1.5 py-1 text-muted"
    >
      <CloudOff class="size-3.5" /> <span class="hidden sm:inline">Offline</span>
    </span>
  </div>
</template>
