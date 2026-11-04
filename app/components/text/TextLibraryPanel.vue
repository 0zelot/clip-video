<script setup>
import { Plus } from 'lucide-vue-next'
import { DEFAULT_TEXT_DURATION, TEXT_PRESETS } from '~/core/model/defaults'
import { textPreviewStyle } from '~/composables/useTextPreview'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const editor = useEditorStore()

const savedPresets = computed(() => projectStore.project?.savedTextStyles ?? [])
const presets = computed(() => [...TEXT_PRESETS, ...savedPresets.value])

function addText(preset) {
  const id = projectStore.addTextItem({
    start: editor.currentTime(),
    duration: DEFAULT_TEXT_DURATION,
    text: preset?.sample ?? 'Your text',
    style: preset?.style,
    animation: preset?.animation,
  })
  if (id) {
    editor.select([id])
    editor.focusProperties()
    editor.engine?.refresh()
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between gap-2 px-3 py-2.5">
      <h2 class="panel-title">Text</h2>
      <UiButton size="sm" variant="primary" :icon="Plus" @click="addText(null)">Add text</UiButton>
    </div>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
      <p class="text-xs text-muted">Text is added at the playhead. Drag it straight on the preview to place it.</p>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-2">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="flex flex-col gap-1.5 rounded-xl border border-line bg-panel-2 p-2 text-left transition-colors hover:border-accent"
          @click="addText(preset)"
        >
          <span class="grid h-14 w-full place-items-center overflow-hidden rounded-lg bg-[#2a2a36] px-1 text-xl" :style="textPreviewStyle(preset.style)">
            <span :style="preset.style.background.opacity > 0 ? { padding: '2px 8px', borderRadius: '6px' } : {}">{{ preset.style.uppercase ? 'TEXT' : 'Text' }}</span>
          </span>
          <span class="flex items-center gap-1 px-0.5">
            <span class="min-w-0 flex-1 truncate text-xs font-medium">{{ preset.label }}</span>
            <span class="shrink-0 text-[10px] text-muted">{{ preset.animation.in.kind === 'none' ? '' : preset.animation.in.kind }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
