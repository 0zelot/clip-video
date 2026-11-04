<script setup>
import { Sparkles } from 'lucide-vue-next'
import { FILTER_PRESETS, applyFilterPreset, neutralEffects } from '~/core/model/defaults'
import { buildFilter } from '~/core/render/layout'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const editor = useEditorStore()
const ui = useUiStore()

const effects = computed(() => props.item.effects)

function set(patch, key) {
  projectStore.setEffects(props.item.id, { ...effects.value, ...patch }, key ?? `effects:${props.item.id}`)
}

function usePreset(preset) {
  projectStore.setEffects(props.item.id, applyFilterPreset(preset.id), `filter:${props.item.id}`)
}

const activePreset = computed(() => {
  const current = effects.value
  return FILTER_PRESETS.find((preset) => {
    const target = applyFilterPreset(preset.id)
    return Object.keys(target).every((k) => Math.abs(target[k] - (current[k] ?? 0)) < 0.001)
  })?.id
})

/** CSS approximation of a filter for its thumbnail. */
function previewFilter(preset) {
  const fx = applyFilterPreset(preset.id)
  const css = buildFilter(fx)
  const warm = fx.temperature > 0 ? ` sepia(${fx.temperature * 0.5})` : fx.temperature < 0 ? ` hue-rotate(${fx.temperature * -25}deg)` : ''
  return (css === 'none' ? '' : css) + warm || 'none'
}

const hasRange = computed(() => editor.markIn !== null && editor.markOut !== null && editor.markOut > editor.markIn)

/** Applies the current look to the In→Out range only (splitting the clip). */
function applyToRange() {
  if (!hasRange.value) {
    ui.toast('Set an In point (I) and an Out point (O) first', 'info')
    return
  }
  const snapshot = { ...effects.value }
  const ids = projectStore.applyToRange(
    editor.markIn,
    editor.markOut,
    [props.item.id],
    (draft, id) => {
      const item = draft.tracks.flatMap((t) => t.items).find((i) => i.id === id)
      if (item && item.effects) item.effects = { ...snapshot }
    },
    'Effects on range',
  )
  if (ids.length) {
    editor.select(ids)
    ui.toast('Applied the effects to the selected range', 'success')
  }
}

const sliders = [
  { key: 'brightness', label: 'Brightness', min: 0.2, max: 2, step: 0.01, neutral: 1 },
  { key: 'contrast', label: 'Contrast', min: 0.2, max: 2.5, step: 0.01, neutral: 1 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 3, step: 0.01, neutral: 1 },
  { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, neutral: 0, unit: '°' },
  { key: 'blur', label: 'Blur', min: 0, max: 40, step: 0.5, neutral: 0, unit: 'px' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 1, step: 0.01, neutral: 0, percent: true },
  { key: 'sepia', label: 'Sepia', min: 0, max: 1, step: 0.01, neutral: 0, percent: true },
  { key: 'invert', label: 'Invert', min: 0, max: 1, step: 0.01, neutral: 0, percent: true },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, neutral: 0, percent: true },
  { key: 'temperature', label: 'Temperature', min: -1, max: 1, step: 0.01, neutral: 0, signed: true },
  { key: 'grain', label: 'Film grain', min: 0, max: 1, step: 0.01, neutral: 0, percent: true },
]

function formatValue(slider, value) {
  if (slider.signed) return `${value > 0 ? '+' : ''}${Math.round(value * 100)}`
  if (slider.percent) return `${Math.round(value * 100)}%`
  if (slider.unit) return `${Math.round(value)}${slider.unit}`
  return `${Math.round(value * 100)}%`
}
</script>

<template>
  <PropertiesSection title="Effects & filters" :icon="Sparkles">
    <span class="label">Filters</span>
    <div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      <button
        v-for="preset in FILTER_PRESETS"
        :key="preset.id"
        type="button"
        class="flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg border p-1 text-[10px] font-medium"
        :class="activePreset === preset.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
        @click="usePreset(preset)"
      >
        <span class="block h-9 w-full rounded-md bg-gradient-to-br from-[#e9a46a] via-[#5f8fb4] to-[#2b3a4f]" :style="{ filter: previewFilter(preset) }" />
        <span class="w-full truncate text-center">{{ preset.label }}</span>
      </button>
    </div>

    <UiSlider
      v-for="slider in sliders"
      :key="slider.key"
      :model-value="effects[slider.key] ?? slider.neutral"
      :label="slider.label"
      :min="slider.min"
      :max="slider.max"
      :step="slider.step"
      :format="(v) => formatValue(slider, v)"
      @update:model-value="(v) => set({ [slider.key]: v }, `fx:${slider.key}:${item.id}`)"
    />

    <div class="flex gap-1.5">
      <UiButton size="sm" class="flex-1" @click="projectStore.setEffects(item.id, neutralEffects(), `reset:${item.id}`)">Reset</UiButton>
      <UiButton size="sm" class="flex-1" :disabled="!hasRange" @click="applyToRange">Apply to In→Out</UiButton>
    </div>
  </PropertiesSection>
</template>
