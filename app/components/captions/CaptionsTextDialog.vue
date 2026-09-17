<script setup>
import { ClipboardType } from 'lucide-vue-next'
import { useCaptionsStore } from '~/stores/captions'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const captions = useCaptionsStore()
const editor = useEditorStore()
const projectStore = useProjectStore()

const text = ref('')
const fitToProject = ref(true)
const replace = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open) text.value = ''
  },
)

function submit() {
  if (!text.value.trim()) return
  captions.importText(text.value, {
    start: editor.currentTime(),
    replace: replace.value,
    totalDuration: fitToProject.value ? Math.max(1, projectStore.duration - editor.currentTime()) : undefined,
  })
  emit('close')
}
</script>

<template>
  <UiDialog :open="open" title="Captions from text" width="max-w-lg" @close="emit('close')">
    <div class="space-y-3">
      <p class="text-xs text-muted">
        Paste your script - it is split into short phrases (like on TikTok). Line breaks start a new phrase.
        Timings are estimated and can be adjusted phrase by phrase afterwards.
      </p>
      <textarea v-model="text" rows="8" class="field h-auto py-2 leading-snug" placeholder="Paste your script here…" />
      <UiSwitch v-model="fitToProject" label="Spread over the rest of the project" />
      <UiSwitch v-model="replace" label="Replace existing captions" />
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" :icon="ClipboardType" :disabled="!text.trim()" @click="submit">Add captions</UiButton>
    </template>
  </UiDialog>
</template>
