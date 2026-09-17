<script setup>
import { Plus, Type } from 'lucide-vue-next'
import { DEFAULT_TEXT_DURATION, TEXT_PRESETS } from '~/core/model/defaults'
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
      <button
        v-for="preset in presets"
        :key="preset.id"
        type="button"
        class="flex w-full items-center gap-3 rounded-xl border border-line bg-panel-2 p-3 text-left transition-colors hover:border-accent"
        @click="addText(preset)"
      >
        <span
          class="grid size-10 shrink-0 place-items-center rounded-lg"
          :style="{
            background: preset.style.background.opacity > 0 ? preset.style.background.color : 'transparent',
            color: preset.style.color,
            fontWeight: preset.style.fontWeight,
            border: preset.style.stroke.width > 0 ? `1px solid ${preset.style.stroke.color}` : '1px solid transparent',
          }"
        >
          Aa
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium">{{ preset.label }}</span>
          <span class="block truncate text-[11px] text-muted">
            {{ preset.animation.in.kind === 'none' ? 'no animation' : `${preset.animation.in.kind} in` }}
          </span>
        </span>
        <Type class="size-4 shrink-0 text-muted" />
      </button>
    </div>
  </div>
</template>
