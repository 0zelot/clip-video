<script setup>
import { FORMAT_PRESETS, FPS_OPTIONS, findFormatPreset } from '~/core/model/defaults'
import { formatDuration } from '~/core/time'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()

const settings = computed(() => projectStore.project?.settings)
const presetId = computed(() => (settings.value ? (findFormatPreset(settings.value.width, settings.value.height)?.id ?? 'custom') : 'custom'))

function applyPreset(id) {
  const preset = FORMAT_PRESETS.find((p) => p.id === id)
  if (preset) projectStore.updateSettings({ width: preset.width, height: preset.height })
}

/** @param {import('~/core/model/types').Background} background */
function setBackground(background) {
  projectStore.updateSettings({ background }, 'background')
}

const backgroundKind = computed(() => settings.value?.background.kind ?? 'color')

function changeKind(kind) {
  if (kind === 'color') setBackground({ kind: 'color', color: '#000000' })
  else if (kind === 'gradient') setBackground({ kind: 'gradient', from: '#1c1c3a', to: '#2ee6d6', angle: 180 })
  else if (kind === 'blur') setBackground({ kind: 'blur', amount: 40 })
}
</script>

<template>
  <div v-if="settings" class="space-y-5">
    <section>
      <h3 class="panel-title mb-2">Canvas</h3>
      <div class="grid grid-cols-5 gap-1">
        <button
          v-for="preset in FORMAT_PRESETS"
          :key="preset.id"
          v-tooltip="preset.description"
          type="button"
          class="h-9 rounded-lg border text-[11px] font-semibold coarse:h-11"
          :class="presetId === preset.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
          @click="applyPreset(preset.id)"
        >
          {{ preset.label }}
        </button>
        <span
          class="grid h-9 place-items-center rounded-lg border text-[11px] font-semibold coarse:h-11"
          :class="presetId === 'custom' ? 'border-accent bg-accent/10 text-accent' : 'border-line text-subtle'"
        >
          custom
        </span>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <UiNumberField
          :model-value="settings.width"
          label="Width"
          :min="16"
          :max="7680"
          :precision="0"
          suffix="px"
          @commit="(v) => projectStore.updateSettings({ width: v }, 'size')"
        />
        <UiNumberField
          :model-value="settings.height"
          label="Height"
          :min="16"
          :max="7680"
          :precision="0"
          suffix="px"
          @commit="(v) => projectStore.updateSettings({ height: v }, 'size')"
        />
      </div>
      <div class="mt-2">
        <span class="label">Frame rate</span>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="rate in FPS_OPTIONS"
            :key="rate"
            type="button"
            class="h-8 flex-1 rounded-lg border text-xs font-medium coarse:h-10"
            :class="settings.fps === rate ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
            @click="projectStore.updateSettings({ fps: rate })"
          >
            {{ rate }}
          </button>
        </div>
      </div>
    </section>

    <section>
      <h3 class="panel-title mb-2">Background</h3>
      <div class="flex gap-1">
        <button
          v-for="kind in ['color', 'gradient', 'blur']"
          :key="kind"
          type="button"
          class="h-8 flex-1 rounded-lg border text-xs capitalize coarse:h-10"
          :class="backgroundKind === kind ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
          @click="changeKind(kind)"
        >
          {{ kind }}
        </button>
      </div>
      <div v-if="settings.background.kind === 'color'" class="mt-2">
        <input
          type="color"
          class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2"
          :value="settings.background.color"
          aria-label="Background colour"
          @input="setBackground({ kind: 'color', color: $event.target.value })"
        />
      </div>
      <div v-else-if="settings.background.kind === 'gradient'" class="mt-2 grid grid-cols-2 gap-2">
        <input
          type="color"
          class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2"
          :value="settings.background.from"
          aria-label="Gradient start"
          @input="setBackground({ ...settings.background, from: $event.target.value })"
        />
        <input
          type="color"
          class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2"
          :value="settings.background.to"
          aria-label="Gradient end"
          @input="setBackground({ ...settings.background, to: $event.target.value })"
        />
        <div class="col-span-2">
          <UiSlider
            :model-value="settings.background.angle"
            label="Angle"
            :min="0"
            :max="360"
            :step="1"
            :format="(v) => `${Math.round(v)}°`"
            @update:model-value="(v) => setBackground({ ...settings.background, angle: v })"
          />
        </div>
      </div>
      <div v-else-if="settings.background.kind === 'blur'" class="mt-2">
        <UiSlider
          :model-value="settings.background.amount"
          label="Blur"
          :min="4"
          :max="120"
          :step="1"
          :format="(v) => `${Math.round(v)}px`"
          @update:model-value="(v) => setBackground({ kind: 'blur', amount: v })"
        />
        <p class="text-[11px] text-muted">Fills empty space with a blurred copy of the bottom video layer.</p>
      </div>
    </section>

    <section>
      <h3 class="panel-title mb-2">Saving</h3>
      <UiSwitch :model-value="projectStore.autosave" label="Autosave" @update:model-value="projectStore.setAutosave" />
      <p class="text-[11px] text-muted">
        {{ projectStore.autosave ? 'Changes are saved locally a moment after you stop editing.' : 'Autosave is off - press Ctrl+S to save.' }}
      </p>
      <div class="mt-3">
        <ProjectStorageInfo />
      </div>
    </section>

    <section>
      <h3 class="panel-title mb-2">Project</h3>
      <dl class="space-y-1 text-xs text-muted">
        <div class="flex justify-between">
          <dt>Duration</dt>
          <dd class="text-fg/80">{{ formatDuration(projectStore.duration) }}</dd>
        </div>
        <div class="flex justify-between">
          <dt>Clips</dt>
          <dd class="text-fg/80">{{ projectStore.project?.tracks.reduce((n, t) => n + t.items.length, 0) }}</dd>
        </div>
        <div class="flex justify-between">
          <dt>History</dt>
          <dd class="text-fg/80">{{ projectStore.past.length }} undo steps</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
