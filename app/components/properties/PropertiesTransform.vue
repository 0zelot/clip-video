<script setup>
import { ChevronLeft, ChevronRight, Diamond, FlipHorizontal, FlipVertical, Move, RotateCcw, Trash2 } from 'lucide-vue-next'
import { isMediaVisual, isTextual } from '~/core/model/types'
import { BLEND_MODES, defaultTransform } from '~/core/model/defaults'
import { hasKeyframes, keyframeTimes, resolveItemAt, snapshotValues } from '~/core/render/animate'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const editor = useEditorStore()

// Playhead time (rounded to ~frames so the panel does not re-render constantly).
const playhead = ref(0)
let lastUpdate = 0
usePlaybackTime((time) => {
  const r = Math.round(time * 30) / 30
  if (r === playhead.value) return
  if (editor.playing) {
    // While playing only animated clips need live values, ~10 times a second.
    const now = performance.now()
    if (!hasKeyframes(props.item) || now - lastUpdate < 100) return
    lastUpdate = now
  }
  playhead.value = r
})
const local = computed(() => Math.min(props.item.duration, Math.max(0, playhead.value - props.item.start)))
const insideClip = computed(() => playhead.value >= props.item.start - 1e-6 && playhead.value <= props.item.start + props.item.duration + 1e-6)

const animated = computed(() => hasKeyframes(props.item))
const shown = computed(() => resolveItemAt(props.item, local.value))
const t = computed(() => shown.value.transform)
const times = computed(() => keyframeTimes(props.item))
const keyHere = computed(() => times.value.some((k) => Math.abs(k - local.value) < 1 / 60))

/** Writes values - as keyframes at the playhead once the clip is animated. */
function patch(values, key) {
  if (animated.value) {
    const kfValues = {}
    for (const k of ['x', 'y', 'scale', 'rotation']) if (k in values) kfValues[k] = values[k]
    if (Object.keys(kfValues).length) projectStore.setKeyframes(props.item.id, local.value, kfValues, key)
    const rest = { ...values }
    for (const k of Object.keys(kfValues)) delete rest[k]
    if (Object.keys(rest).length) projectStore.setTransform(props.item.id, { ...props.item.transform, ...rest }, key)
  } else {
    projectStore.setTransform(props.item.id, { ...props.item.transform, ...values }, key)
  }
  editor.engine?.refresh()
}

function setOpacity(v) {
  if (animated.value) projectStore.setKeyframes(props.item.id, local.value, { opacity: v }, `kfop:${props.item.id}`)
  else projectStore.updateItem(props.item.id, { opacity: v }, `opacity:${props.item.id}`, 'Change opacity')
  editor.engine?.refresh()
}

function addKeyframe() {
  if (!insideClip.value) editor.engine?.seek(props.item.start)
  projectStore.setKeyframes(props.item.id, local.value, snapshotValues(props.item, local.value))
  editor.engine?.refresh()
}
function removeKeyframe() {
  projectStore.removeKeyframesAt(props.item.id, local.value)
  editor.engine?.refresh()
}
function jumpKey(direction) {
  const list = times.value
  const target = direction < 0 ? [...list].reverse().find((k) => k < local.value - 1e-3) : list.find((k) => k > local.value + 1e-3)
  if (target !== undefined) editor.engine?.seek(props.item.start + target)
}

const MASKS = [
  { id: 'none', label: 'None' },
  { id: 'circle', label: '●' },
  { id: 'oval', label: '⬭' },
  { id: 'square', label: '■' },
  { id: 'rounded', label: '▢' },
  { id: 'heart', label: '♥' },
]

/** Picture-in-picture positions for overlays. */
const PIP = [
  { id: 'tl', label: '↖', x: 0.27, y: 0.18 },
  { id: 'tr', label: '↗', x: 0.73, y: 0.18 },
  { id: 'c', label: '•', x: 0.5, y: 0.5 },
  { id: 'bl', label: '↙', x: 0.27, y: 0.82 },
  { id: 'br', label: '↘', x: 0.73, y: 0.82 },
]
function pip(position) {
  patch({ x: position.x, y: position.y, ...(position.id === 'c' ? {} : { scale: Math.min(t.value.scale, 0.42) }) }, undefined)
}

function setFit(fit) {
  projectStore.updateItem(props.item.id, { fit, transform: { ...t.value, scale: 1, scaleX: 1, scaleY: 1 } }, undefined, 'Change fit')
}

function reset() {
  if (animated.value) projectStore.clearKeyframes(props.item.id)
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
    <div class="grid grid-cols-[1fr_6.5rem] items-end gap-2">
      <UiSlider
        :model-value="shown.opacity"
        label="Opacity"
        :min="0"
        :max="1"
        :step="0.01"
        :format="(v) => `${Math.round(v * 100)}%`"
        @update:model-value="setOpacity"
      />
      <UiNumberField
        :model-value="1 - shown.opacity"
        label="Transparency"
        :min="0"
        :max="1"
        :step="1"
        :precision="0"
        :factor="100"
        suffix="%"
        @update:model-value="(v) => setOpacity(1 - v)"
      />
    </div>

    <label v-if="item.type !== 'blur'" class="block">
      <span class="label">Blend mode</span>
      <select class="field" :value="item.blendMode ?? 'normal'" @change="projectStore.updateItem(item.id, { blendMode: $event.target.value }, undefined, 'Blend mode')">
        <option v-for="mode in BLEND_MODES" :key="mode.id" :value="mode.id">{{ mode.label }}</option>
      </select>
    </label>

    <div v-if="isMediaVisual(item)">
      <span class="label">Mask shape</span>
      <div class="grid grid-cols-6 gap-1">
        <button
          v-for="m in MASKS"
          :key="m.id"
          type="button"
          class="h-8 rounded-lg border text-[10px] coarse:h-10"
          :class="(item.mask ?? 'none') === m.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
          @click="projectStore.updateItem(item.id, { mask: m.id }, undefined, 'Mask'); editor.engine?.refresh()"
        >
          {{ m.label }}
        </button>
      </div>
    </div>

    <div v-if="isMediaVisual(item) || isTextual(item)">
      <span class="label">Quick position</span>
      <div class="grid grid-cols-5 gap-1">
        <button
          v-for="position in PIP"
          :key="position.id"
          type="button"
          class="h-8 rounded-lg border border-line text-sm text-muted hover:border-accent hover:text-accent coarse:h-10"
          :aria-label="`Move to ${position.id}`"
          @click="pip(position)"
        >
          {{ position.label }}
        </button>
      </div>
    </div>

    <!-- keyframes -->
    <div class="rounded-xl border border-line bg-panel-2/60 p-2">
      <div class="flex items-center gap-1">
        <Diamond class="size-3.5" :class="animated ? 'text-accent' : 'text-muted'" />
        <span class="flex-1 text-xs font-medium">Keyframes</span>
        <UiIconButton :icon="ChevronLeft" label="Previous keyframe" size="sm" :disabled="!animated" @click="jumpKey(-1)" />
        <UiButton size="sm" :variant="keyHere ? 'primary' : 'secondary'" @click="keyHere ? removeKeyframe() : addKeyframe()">
          {{ keyHere ? 'Remove' : 'Add' }} ◆
        </UiButton>
        <UiIconButton :icon="ChevronRight" label="Next keyframe" size="sm" :disabled="!animated" @click="jumpKey(1)" />
        <UiIconButton v-if="animated" :icon="Trash2" label="Remove all keyframes" size="sm" @click="projectStore.clearKeyframes(item.id); editor.engine?.refresh()" />
      </div>
      <p class="mt-1 text-[11px] text-muted">
        {{ animated ? `${times.length} key${times.length === 1 ? '' : 's'} · moving, scaling or fading now records a key at the playhead.` : 'Add a key, move the playhead, change position/size/opacity - it animates between keys.' }}
      </p>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <UiButton size="sm" :icon="FlipHorizontal" @click="patch({ flipH: !t.flipH })">Flip H</UiButton>
      <UiButton size="sm" :icon="FlipVertical" @click="patch({ flipV: !t.flipV })">Flip V</UiButton>
      <UiButton size="sm" :icon="RotateCcw" @click="reset">Reset</UiButton>
    </div>

    <template v-if="isMediaVisual(item)">
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
