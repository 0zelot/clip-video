<script setup>
import { Droplets } from 'lucide-vue-next'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const editor = useEditorStore()

function set(patch, key) {
  projectStore.updateItem(props.item.id, patch, key, 'Edit blur')
  editor.engine?.refresh()
}

const choice = (value, current) => (value === current ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle')
</script>

<template>
  <PropertiesSection title="Blur region" :icon="Droplets">
    <div class="grid grid-cols-2 gap-1">
      <button type="button" class="h-8 rounded-lg border text-xs coarse:h-10" :class="choice('blur', item.mode)" @click="set({ mode: 'blur' })">Blur</button>
      <button type="button" class="h-8 rounded-lg border text-xs coarse:h-10" :class="choice('pixelate', item.mode)" @click="set({ mode: 'pixelate' })">Pixelate</button>
    </div>
    <div class="grid grid-cols-2 gap-1">
      <button type="button" class="h-8 rounded-lg border text-xs coarse:h-10" :class="choice('ellipse', item.shape)" @click="set({ shape: 'ellipse' })">Oval</button>
      <button type="button" class="h-8 rounded-lg border text-xs coarse:h-10" :class="choice('rect', item.shape)" @click="set({ shape: 'rect' })">Rectangle</button>
    </div>
    <UiSlider
      :model-value="item.amount"
      label="Strength"
      :min="0.02"
      :max="1"
      :step="0.01"
      :format="(v) => `${Math.round(v * 100)}%`"
      @update:model-value="(v) => set({ amount: v }, `blur-amount:${item.id}`)"
    />
    <div class="grid grid-cols-2 gap-2">
      <UiNumberField :model-value="item.size.w" label="Width" :min="0.02" :max="2" :step="1" :precision="0" :factor="100" suffix="%" @update:model-value="(v) => set({ size: { w: v } }, `blur-w:${item.id}`)" />
      <UiNumberField :model-value="item.size.h" label="Height" :min="0.02" :max="2" :step="1" :precision="0" :factor="100" suffix="%" @update:model-value="(v) => set({ size: { h: v } }, `blur-h:${item.id}`)" />
    </div>
    <UiSwitch :model-value="item.invert" label="Blur the background (keep the region sharp)" @update:model-value="(v) => set({ invert: v })" />
    <p class="text-[11px] text-muted">Drag the dashed box on the preview to place it; use the side handles to stretch it. Add keyframes in Transform to follow a moving face or object.</p>
  </PropertiesSection>
</template>
