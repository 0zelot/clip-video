<script setup>
import { formatTimecode } from '~/core/time'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const editor = useEditorStore()
const projectStore = useProjectStore()
const { viewport } = useTimeline()

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]

/** Chooses a tick interval that keeps labels at least ~80px apart. */
const step = computed(() => STEPS.find((s) => s * editor.zoom >= 80) ?? STEPS[STEPS.length - 1])

const ticks = computed(() => {
  const { scrollLeft, width } = viewport.value
  const from = Math.max(0, Math.floor(scrollLeft / editor.zoom / step.value) * step.value)
  const to = (scrollLeft + width) / editor.zoom + step.value
  const result = []
  const fps = projectStore.project?.settings.fps ?? 30
  for (let t = from; t <= to; t += step.value) {
    result.push({ t, label: step.value >= 1 ? formatTimecode(t, fps).replace(/\.\d+$/, '') : `${t.toFixed(1)}s` })
  }
  return result
})
</script>

<template>
  <div class="relative cursor-ew-resize border-b border-line bg-panel-2 select-none">
    <div
      v-for="tick in ticks"
      :key="tick.t"
      class="pointer-events-none absolute top-0 bottom-0 border-l border-line pl-1 text-[10px] leading-7 text-muted"
      :style="{ left: `${tick.t * editor.zoom}px` }"
    >
      {{ tick.label }}
    </div>
    <div
      v-if="editor.markIn !== null"
      class="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent"
      :style="{ left: `${editor.markIn * editor.zoom}px` }"
    />
    <div
      v-if="editor.markOut !== null"
      class="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent"
      :style="{ left: `${editor.markOut * editor.zoom}px` }"
    />
  </div>
</template>
