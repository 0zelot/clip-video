<script setup>
import { FlipHorizontal, FlipVertical, Move, RotateCcw } from 'lucide-vue-next'
import { isTextual } from '~/core/model/types'
import { defaultTransform } from '~/core/model/defaults'
import { useProjectStore } from '~/stores/project'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()

const t = computed(() => props.item.transform)

function patch(values, key) {
  projectStore.setTransform(props.item.id, { ...t.value, ...values }, key)
}

function setFit(fit) {
  projectStore.updateItem(props.item.id, { fit, transform: { ...t.value, scale: 1, scaleX: 1, scaleY: 1 } }, undefined, 'Change fit')
}

function reset() {
  projectStore.updateItem(props.item.id, { transform: defaultTransform(), crop: { top: 0, right: 0, bottom: 0, left: 0 } }, undefined, 'Reset transform')
}

function setCrop(values, key) {
  projectStore.updateItem(props.item.id, { crop: { ...props.item.crop, ...values } }, key ?? `crop:${props.item.id}`, 'Crop')
}

const cropPresets = [
  { id: 'original', label: 'Original', ratio: null },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
]

/** Crops the source to the given aspect ratio, centred. */
function applyCropPreset(preset) {
  if (!preset.ratio) {
    setCrop({ top: 0, right: 0, bottom: 0, left: 0 }, undefined)
    return
  }
  const project = projectStore.project
  const asset = project?.assets[props.item.assetId]
  const sourceRatio = (asset?.width ?? 16) / (asset?.height ?? 9)
  if (sourceRatio > preset.ratio) {
    const keep = preset.ratio / sourceRatio
    const inset = (1 - keep) / 2
    setCrop({ top: 0, bottom: 0, left: inset, right: inset }, undefined)
  } else {
    const keep = sourceRatio / preset.ratio
    const inset = (1 - keep) / 2
    setCrop({ left: 0, right: 0, top: inset, bottom: inset }, undefined)
  }
}
</script>

<template>
  <PropertiesSection title="Transform" :icon="Move">
    <div class="grid grid-cols-2 gap-2">
      <UiNumberField
        :model-value="t.x"
        label="Position X"
        :step="0.5"
        :precision="1"
        :factor="100"
        suffix="%"
        @update:model-value="(v) => patch({ x: v }, `x:${item.id}`)"
      />
      <UiNumberField
        :model-value="t.y"
        label="Position Y"
        :step="0.5"
        :precision="1"
        :factor="100"
        suffix="%"
        @update:model-value="(v) => patch({ y: v }, `y:${item.id}`)"
      />
    </div>
    <div class="grid grid-cols-2 gap-2">
      <UiNumberField
        :model-value="t.scale"
        label="Scale"
        :min="0.05"
        :max="12"
        :step="1"
        :precision="0"
        :factor="100"
        suffix="%"
        @update:model-value="(v) => patch({ scale: v }, `scale:${item.id}`)"
      />
      <UiNumberField
        :model-value="t.rotation"
        label="Rotation"
        :min="-360"
        :max="360"
        :step="1"
        :precision="1"
        suffix="°"
        @update:model-value="(v) => patch({ rotation: v }, `rot:${item.id}`)"
      />
    </div>
    <UiSlider
      :model-value="item.opacity"
      label="Opacity"
      :min="0"
      :max="1"
      :step="0.01"
      :format="(v) => `${Math.round(v * 100)}%`"
      @update:model-value="(v) => projectStore.updateItem(item.id, { opacity: v }, `opacity:${item.id}`, 'Change opacity')"
    />

    <div class="flex flex-wrap gap-1.5">
      <UiButton size="sm" :icon="FlipHorizontal" @click="patch({ flipH: !t.flipH })">Flip H</UiButton>
      <UiButton size="sm" :icon="FlipVertical" @click="patch({ flipV: !t.flipV })">Flip V</UiButton>
      <UiButton size="sm" :icon="RotateCcw" @click="reset">Reset</UiButton>
    </div>

    <template v-if="!isTextual(item)">
      <div>
        <span class="label">Fit to canvas</span>
        <div class="flex gap-1">
          <button
            v-for="mode in [
              { id: 'contain', label: 'Fit' },
              { id: 'cover', label: 'Fill' },
              { id: 'stretch', label: 'Stretch' },
            ]"
            :key="mode.id"
            type="button"
            class="h-8 flex-1 rounded-lg border text-xs coarse:h-10"
            :class="item.fit === mode.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
            @click="setFit(mode.id)"
          >
            {{ mode.label }}
          </button>
        </div>
      </div>

      <div>
        <span class="label">Crop</span>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="preset in cropPresets"
            :key="preset.id"
            type="button"
            class="h-8 flex-1 rounded-lg border px-1 text-[11px] text-muted hover:border-subtle coarse:h-10"
            @click="applyCropPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>
        <div class="mt-2 grid grid-cols-4 gap-1.5">
          <UiNumberField
            v-for="side in ['top', 'right', 'bottom', 'left']"
            :key="side"
            :model-value="item.crop[side]"
            :label="side.slice(0, 1).toUpperCase()"
            :min="0"
            :max="0.9"
            :step="1"
            :precision="0"
            :factor="100"
            @update:model-value="(v) => setCrop({ [side]: v })"
          />
        </div>
      </div>
    </template>
  </PropertiesSection>
</template>
