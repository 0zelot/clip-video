<script setup>
import { CopyCheck, Shuffle } from 'lucide-vue-next'
import { DEFAULT_TRANSITION_DURATION, TRANSITIONS } from '~/core/model/defaults'
import { hasPreviousNeighbour } from '~/core/operations/items'
import { useUiStore } from '~/stores/ui'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const editor = useEditorStore()
const ui = useUiStore()

const joined = computed(() => (projectStore.project ? hasPreviousNeighbour(projectStore.project, props.item.id) : false))
const transition = computed(() => props.item.transitionIn ?? { kind: 'none', duration: DEFAULT_TRANSITION_DURATION })
const needsDirection = computed(() => TRANSITIONS.find((t) => t.id === transition.value.kind)?.needsDirection)

function setKind(kind) {
  projectStore.setTransition(props.item.id, {
    kind,
    duration: transition.value.duration ?? DEFAULT_TRANSITION_DURATION,
    direction: transition.value.direction ?? 'left',
  })
  editor.engine?.refresh()
}

function setDuration(duration) {
  projectStore.setTransition(props.item.id, { ...transition.value, duration })
  editor.engine?.refresh()
}

function setDirection(direction) {
  projectStore.setTransition(props.item.id, { ...transition.value, direction })
  editor.engine?.refresh()
}

/** Uses this transition between every pair of touching clips on the track. */
function applyToTrack() {
  const count = projectStore.applyTransitionToTrack(props.item.id, transition.value)
  ui.toast(count ? `Transition applied to ${count} cut${count === 1 ? '' : 's'}` : 'No touching clips on this track', count ? 'success' : 'info')
  editor.engine?.refresh()
}

/** Seeks just before the cut and plays it. */
function previewTransition() {
  const start = Math.max(0, props.item.start - 0.6)
  editor.engine?.pause()
  editor.engine?.seek(start)
  editor.engine?.play()
}
</script>

<template>
  <PropertiesSection title="Transition in" :icon="Shuffle">
    <p v-if="!joined" class="text-[11px] text-muted">
      Put this clip directly after another one on the same track to blend them.
    </p>
    <template v-else>
      <div class="grid grid-cols-4 gap-1 sm:grid-cols-4">
        <button
          v-for="option in TRANSITIONS"
          :key="option.id"
          type="button"
          class="h-8 rounded-lg border px-1 text-[10px] font-medium coarse:h-10"
          :class="transition.kind === option.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
          @click="setKind(option.id)"
        >
          {{ option.label }}
        </button>
      </div>
      <div v-if="transition.kind !== 'none'" class="grid grid-cols-2 gap-2">
        <UiNumberField
          :model-value="transition.duration"
          label="Duration"
          :min="0.1"
          :max="Math.max(0.2, item.duration)"
          :step="0.1"
          :precision="2"
          suffix="s"
          @update:model-value="setDuration"
        />
        <label v-if="needsDirection" class="block">
          <span class="label">Direction</span>
          <select class="field" :value="transition.direction ?? 'left'" @change="setDirection($event.target.value)">
            <option value="left">From the right</option>
            <option value="right">From the left</option>
            <option value="up">From the bottom</option>
            <option value="down">From the top</option>
          </select>
        </label>
      </div>
      <div class="flex gap-1.5">
        <UiButton size="sm" class="flex-1" :disabled="transition.kind === 'none'" @click="previewTransition">Preview</UiButton>
        <UiButton size="sm" class="flex-1" :icon="CopyCheck" @click="applyToTrack">Apply to all cuts</UiButton>
      </div>
    </template>
  </PropertiesSection>
</template>
