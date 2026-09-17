<script setup>
import { Gauge } from 'lucide-vue-next'
import { SPEED_PRESETS } from '~/core/model/defaults'
import { formatDuration } from '~/core/time'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const editor = useEditorStore()
const ui = useUiStore()

const speed = computed(() => props.item.speed)
const sourceRange = computed(() => props.item.duration * props.item.speed)

function setSpeed(value) {
  projectStore.setItemSpeed(props.item.id, value)
  editor.engine?.refresh()
}

const hasRange = computed(() => editor.markIn !== null && editor.markOut !== null && editor.markOut > editor.markIn)

/** Splits the clip at the In/Out marks and speeds up only that part. */
function applyToRange(value) {
  if (!hasRange.value) {
    ui.toast('Set an In point (I) and an Out point (O) on the timeline first', 'info')
    return
  }
  const ids = projectStore.applyToRange(
    editor.markIn,
    editor.markOut,
    [props.item.id],
    (draft, id) => {
      const item = draft.tracks.flatMap((t) => t.items).find((i) => i.id === id)
      if (!item || (item.type !== 'video' && item.type !== 'audio')) return
      const range = item.duration * item.speed
      item.speed = value
      item.duration = Math.max(1 / 30, range / value)
    },
    `Speed ${value}×`,
  )
  if (ids.length) {
    editor.select(ids)
    ui.toast(`Applied ${value}× to the selected range`, 'success')
    editor.engine?.refresh()
  }
}
</script>

<template>
  <PropertiesSection title="Speed" :icon="Gauge">
    <div class="grid grid-cols-4 gap-1">
      <button
        v-for="preset in SPEED_PRESETS"
        :key="preset"
        type="button"
        class="h-8 rounded-lg border text-[11px] font-medium coarse:h-10"
        :class="Math.abs(speed - preset) < 0.001 ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
        @click="setSpeed(preset)"
      >
        {{ preset }}×
      </button>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <UiNumberField
        :model-value="speed"
        label="Custom"
        :min="0.1"
        :max="16"
        :step="0.05"
        :precision="2"
        suffix="×"
        @commit="setSpeed"
      />
      <label class="block min-w-0">
        <span class="label">New length</span>
        <p class="field flex items-center font-mono text-xs">{{ formatDuration(sourceRange / speed) }}</p>
      </label>
    </div>
    <UiButton size="sm" block :disabled="!hasRange" @click="applyToRange(speed === 1 ? 2 : speed)">
      Apply {{ speed === 1 ? '2×' : `${speed}×` }} to In→Out range
    </UiButton>
    <p class="text-[11px] text-muted">
      {{ hasRange ? 'The clip is split at the marks and only that part changes speed.' : 'Mark a range with I and O to speed up just a part of the clip.' }}
      Pitch stays natural.
    </p>
  </PropertiesSection>
</template>
