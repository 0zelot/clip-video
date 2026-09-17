<script setup>
import { Volume2 } from 'lucide-vue-next'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const editor = useEditorStore()
const ui = useUiStore()

const audio = computed(() => props.item.audio)
const maxFade = computed(() => props.item.duration / 2)

function set(patch, key) {
  projectStore.updateItem(props.item.id, { audio: patch }, key, 'Change audio')
  editor.engine?.refresh()
}

const hasRange = computed(() => editor.markIn !== null && editor.markOut !== null && editor.markOut > editor.markIn)

/** Lowers (or raises) the volume of just the marked range. */
function applyVolumeToRange() {
  if (!hasRange.value) {
    ui.toast('Set an In point (I) and an Out point (O) first', 'info')
    return
  }
  const volume = audio.value.volume
  const ids = projectStore.applyToRange(
    editor.markIn,
    editor.markOut,
    [props.item.id],
    (draft, id) => {
      const item = draft.tracks.flatMap((t) => t.items).find((i) => i.id === id)
      if (item?.audio) item.audio = { ...item.audio, volume }
    },
    'Volume on range',
  )
  if (ids.length) {
    editor.select(ids)
    ui.toast(`Set ${Math.round(volume * 100)}% volume on the marked range`, 'success')
  }
}
</script>

<template>
  <PropertiesSection title="Audio" :icon="Volume2">
    <UiSlider
      :model-value="audio.volume"
      label="Volume"
      :min="0"
      :max="2"
      :step="0.01"
      :disabled="audio.muted"
      :format="(v) => `${Math.round(v * 100)}%`"
      @update:model-value="(v) => set({ volume: v }, `volume:${item.id}`)"
    />
    <UiSwitch :model-value="audio.muted" label="Mute clip" @update:model-value="(v) => set({ muted: v })" />

    <div class="grid grid-cols-2 gap-2">
      <UiNumberField
        :model-value="audio.fadeIn"
        label="Fade in"
        :min="0"
        :max="maxFade"
        :step="0.1"
        :precision="2"
        suffix="s"
        @update:model-value="(v) => set({ fadeIn: v }, `fadein:${item.id}`)"
      />
      <UiNumberField
        :model-value="audio.fadeOut"
        label="Fade out"
        :min="0"
        :max="maxFade"
        :step="0.1"
        :precision="2"
        suffix="s"
        @update:model-value="(v) => set({ fadeOut: v }, `fadeout:${item.id}`)"
      />
    </div>

    <UiSlider
      :model-value="audio.pitch ?? 0"
      label="Pitch"
      :min="-12"
      :max="12"
      :step="1"
      :format="(v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`"
      @update:model-value="(v) => set({ pitch: v }, `pitch:${item.id}`)"
    />
    <p v-if="(audio.pitch ?? 0) !== 0" class="text-[11px] text-muted">Pitch shifting is applied when the video is exported.</p>

    <UiSwitch v-if="item.type === 'audio'" :model-value="item.loop" label="Loop to fill the clip" @update:model-value="(v) => projectStore.updateItem(item.id, { loop: v }, undefined, 'Loop audio')" />

    <UiButton size="sm" block :disabled="!hasRange" @click="applyVolumeToRange">Apply volume to In→Out range</UiButton>
  </PropertiesSection>
</template>
