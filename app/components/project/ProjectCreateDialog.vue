<script setup>
import { FORMAT_PRESETS, FPS_OPTIONS } from '~/core/model/defaults'

const props = defineProps({
  open: Boolean,
  /** Files dropped on the home screen, imported into the new project. */
  files: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'create'])

const name = ref('')
const presetId = ref('9:16')
const width = ref(1080)
const height = ref(1920)
const fps = ref(30)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const first = props.files?.[0]?.name.replace(/\.[^.]+$/, '')
    name.value = first || `Project ${new Date().toLocaleDateString()}`
  },
)

function choose(id) {
  presetId.value = id
  const preset = FORMAT_PRESETS.find((p) => p.id === id)
  if (preset) {
    width.value = preset.width
    height.value = preset.height
  }
}

function submit() {
  emit('create', {
    name: name.value.trim() || 'Untitled project',
    width: Math.max(16, Math.round(width.value / 2) * 2),
    height: Math.max(16, Math.round(height.value / 2) * 2),
    fps: fps.value,
  })
}
</script>

<template>
  <UiDialog :open="open" title="New project" width="max-w-lg" @close="emit('close')">
    <form id="create-project" class="space-y-5" @submit.prevent="submit">
      <p v-if="files?.length" class="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
        {{ files.length }} file{{ files.length === 1 ? '' : 's' }} will be imported into the new project.
      </p>
      <div>
        <label class="label" for="project-name">Name</label>
        <input id="project-name" v-model="name" class="field" maxlength="120" />
      </div>

      <div>
        <span class="label">Format</span>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <button
            v-for="preset in FORMAT_PRESETS"
            :key="preset.id"
            type="button"
            class="flex flex-col items-center gap-2 rounded-xl border p-3 transition-colors"
            :class="presetId === preset.id ? 'border-accent bg-accent/10' : 'border-line hover:border-subtle'"
            @click="choose(preset.id)"
          >
            <span class="grid h-10 place-items-center">
              <span
                class="block rounded-sm border-2"
                :class="presetId === preset.id ? 'border-accent' : 'border-muted'"
                :style="{
                  width: `${(preset.width / Math.max(preset.width, preset.height)) * 36}px`,
                  height: `${(preset.height / Math.max(preset.width, preset.height)) * 36}px`,
                }"
              />
            </span>
            <span class="text-sm font-semibold">{{ preset.label }}</span>
            <span class="text-center text-[10px] leading-tight text-muted">{{ preset.description }}</span>
          </button>
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-2 rounded-xl border p-3 transition-colors"
            :class="presetId === 'custom' ? 'border-accent bg-accent/10' : 'border-line hover:border-subtle'"
            @click="presetId = 'custom'"
          >
            <span class="text-sm font-semibold">Custom</span>
            <span class="text-[10px] text-muted">Any size</span>
          </button>
        </div>
      </div>

      <div v-if="presetId === 'custom'" class="grid grid-cols-2 gap-3">
        <UiNumberField v-model="width" label="Width" :min="16" :max="7680" :precision="0" suffix="px" />
        <UiNumberField v-model="height" label="Height" :min="16" :max="7680" :precision="0" suffix="px" />
      </div>

      <div>
        <span class="label">Frame rate</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="rate in FPS_OPTIONS"
            :key="rate"
            type="button"
            class="h-9 min-w-14 rounded-lg border px-3 text-sm font-medium coarse:h-11"
            :class="fps === rate ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-subtle'"
            @click="fps = rate"
          >
            {{ rate }} fps
          </button>
        </div>
      </div>
    </form>
    <template #footer>
      <UiButton variant="ghost" @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" type="submit" form="create-project">Create project</UiButton>
    </template>
  </UiDialog>
</template>
