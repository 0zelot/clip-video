<script setup>
import { ChevronFirst, ChevronLast, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-vue-next'
import { formatTimecode } from '~/core/time'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const editor = useEditorStore()
const commands = useEditorCommands()

const timeEl = ref(null)
const muted = ref(false)
const volume = ref(1)

const fps = computed(() => projectStore.project?.settings.fps ?? 30)
const totalLabel = computed(() => formatTimecode(projectStore.duration, fps.value))

// The playhead time is written straight into the DOM - no reactive updates.
usePlaybackTime((time) => {
  if (timeEl.value) timeEl.value.textContent = formatTimecode(time, fps.value)
})
watch(fps, () => {
  if (timeEl.value && editor.engine) timeEl.value.textContent = formatTimecode(editor.engine.time, fps.value)
})

function applyVolume() {
  if (editor.engine) editor.engine.masterVolume = muted.value ? 0 : volume.value
  editor.engine?.refresh()
}
watch([muted, volume], applyVolume)
</script>

<template>
  <div class="flex shrink-0 items-center gap-1 border-t border-line bg-panel px-2 py-1.5 coarse:py-2">
    <div class="flex items-center gap-1">
      <UiIconButton :icon="ChevronFirst" label="Go to start (Home)" size="sm" @click="commands.goToStart()" />
      <UiIconButton :icon="SkipBack" label="Previous frame (←)" size="sm" @click="commands.stepFrames(-1)" />
      <UiIconButton
        :icon="editor.playing ? Pause : Play"
        :label="editor.playing ? 'Pause (Space)' : 'Play (Space)'"
        variant="accent"
        size="lg"
        @click="commands.togglePlay()"
      />
      <UiIconButton :icon="SkipForward" label="Next frame (→)" size="sm" @click="commands.stepFrames(1)" />
      <UiIconButton :icon="ChevronLast" label="Go to end (End)" size="sm" @click="commands.goToEnd()" />
    </div>

    <p class="ml-2 font-mono text-xs tabular-nums sm:text-sm">
      <span ref="timeEl">00:00.00</span>
      <span class="text-muted"> / {{ totalLabel }}</span>
    </p>

    <div class="flex-1" />

    <div class="hidden items-center gap-1 sm:flex">
      <UiIconButton :icon="muted ? VolumeX : Volume2" :label="muted ? 'Unmute preview' : 'Mute preview'" size="sm" @click="muted = !muted" />
      <input
        v-model.number="volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        class="h-1 w-20 accent-[var(--color-accent)]"
        aria-label="Preview volume"
      />
    </div>
    <p v-if="projectStore.project" class="ml-2 hidden font-mono text-[11px] text-muted md:block">
      {{ projectStore.project.settings.width }}×{{ projectStore.project.settings.height }} · {{ fps }}fps
    </p>
  </div>
</template>
