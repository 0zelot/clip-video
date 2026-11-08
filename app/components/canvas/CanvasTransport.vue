<script setup>
import { ChevronFirst, ChevronLast, Pause, Play, RotateCcw, RotateCw, StepBack, StepForward, Volume2, VolumeX } from 'lucide-vue-next'
import { formatTimecode } from '~/core/time'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const editor = useEditorStore()
const commands = useEditorCommands()

const timeEl = ref(null)
const fillEl = ref(null)
const knobEl = ref(null)
const bar = ref(null)
const muted = ref(false)
const volume = ref(1)
const scrubbing = ref(false)

const fps = computed(() => projectStore.project?.settings.fps ?? 30)
const totalLabel = computed(() => formatTimecode(projectStore.duration, fps.value))

// The playhead time is written straight into the DOM - no reactive updates.
function paint(time) {
  if (timeEl.value) timeEl.value.textContent = formatTimecode(time, fps.value)
  const d = projectStore.duration
  const p = d > 0 ? Math.min(1, Math.max(0, time / d)) : 0
  if (fillEl.value) fillEl.value.style.transform = `scaleX(${p})`
  if (knobEl.value) knobEl.value.style.left = `${p * 100}%`
}
usePlaybackTime(paint)
watch([fps, () => projectStore.duration], () => paint(editor.engine?.time ?? 0))

function applyVolume() {
  if (editor.engine) editor.engine.masterVolume = muted.value ? 0 : volume.value
  editor.engine?.refresh()
}
watch([muted, volume], applyVolume)

// ----- scrub bar -------------------------------------------------------------

function timeFromEvent(e) {
  const rect = bar.value?.getBoundingClientRect()
  if (!rect || rect.width === 0) return 0
  return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * projectStore.duration
}

function startScrub(e) {
  if (projectStore.duration <= 0) return
  const target = e.currentTarget
  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // optional
  }
  scrubbing.value = true
  const resume = editor.playing
  editor.engine?.pause()
  commands.seek(timeFromEvent(e))
  const move = (ev) => commands.seek(timeFromEvent(ev))
  const up = () => {
    scrubbing.value = false
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', up)
    if (resume) editor.engine?.play()
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
}
</script>

<template>
  <div class="shrink-0 border-t border-line bg-panel">
    <!-- scrub bar: large touch target, thin visual -->
    <div
      ref="bar"
      class="group relative h-5 cursor-pointer touch-none px-3 coarse:h-7"
      role="slider"
      aria-label="Playback position"
      :aria-valuemax="projectStore.duration"
      @pointerdown="startScrub"
    >
      <div class="absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-line transition-[height] group-hover:h-1.5" :class="scrubbing ? 'h-1.5' : ''">
        <div ref="fillEl" class="h-full w-full origin-left bg-accent" style="transform: scaleX(0)" />
      </div>
      <div class="pointer-events-none absolute inset-x-3 top-1/2">
        <div
          ref="knobEl"
          class="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-transform coarse:size-4"
          :class="scrubbing ? 'scale-125' : ''"
          style="left: 0"
        />
      </div>
    </div>

    <div class="flex items-center gap-1 px-2 pb-1.5 coarse:pb-2">
      <p class="flex min-w-0 shrink-0 flex-col font-mono text-[11px] leading-tight tabular-nums sm:flex-row sm:gap-1 sm:text-sm">
        <span ref="timeEl" class="whitespace-nowrap">00:00.00</span>
        <span class="whitespace-nowrap text-muted"><span class="max-sm:hidden">/ </span>{{ totalLabel }}</span>
      </p>

      <div class="flex flex-1 items-center justify-center gap-0.5 sm:gap-1">
        <UiIconButton class="max-sm:!hidden" :icon="ChevronFirst" label="Go to start (Home)" size="sm" @click="commands.goToStart()" />
        <UiIconButton :icon="RotateCcw" label="Back 5 seconds (J)" size="sm" @click="commands.seekBy(-5)" />
        <UiIconButton :icon="StepBack" label="Previous frame (←)" size="sm" @click="commands.stepFrames(-1)" />
        <UiIconButton
          :icon="editor.playing ? Pause : Play"
          :label="editor.playing ? 'Pause (Space)' : 'Play (Space)'"
          variant="accent"
          size="lg"
          class="rounded-full"
          @click="commands.togglePlay()"
        />
        <UiIconButton :icon="StepForward" label="Next frame (→)" size="sm" @click="commands.stepFrames(1)" />
        <UiIconButton :icon="RotateCw" label="Forward 5 seconds (L)" size="sm" @click="commands.seekBy(5)" />
        <UiIconButton class="max-sm:!hidden" :icon="ChevronLast" label="Go to end (End)" size="sm" @click="commands.goToEnd()" />
      </div>

      <div class="flex items-center gap-1">
        <UiIconButton :icon="muted ? VolumeX : Volume2" :label="muted ? 'Unmute preview' : 'Mute preview'" size="sm" @click="muted = !muted" />
        <input
          v-model.number="volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          class="hidden h-1 w-20 accent-[var(--color-accent)] sm:block"
          aria-label="Preview volume"
        />
        <p v-if="projectStore.project" class="ml-1 hidden font-mono text-[11px] text-muted xl:block">
          {{ projectStore.project.settings.width }}×{{ projectStore.project.settings.height }} · {{ fps }}fps
        </p>
      </div>
    </div>
  </div>
</template>
