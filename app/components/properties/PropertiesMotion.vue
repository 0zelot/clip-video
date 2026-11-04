<script setup>
import { Move } from 'lucide-vue-next'
import { MOTIONS, defaultMotion } from '~/core/model/defaults'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const editor = useEditorStore()

const motion = computed(() => props.item.motion ?? defaultMotion())

function set(patch) {
  projectStore.setMotion(props.item.id, { ...motion.value, ...patch })
  editor.engine?.refresh()
}
</script>

<template>
  <PropertiesSection title="Motion (Ken Burns)" :icon="Move" :default-open="item.type === 'image'">
    <div class="grid grid-cols-3 gap-1">
      <button
        v-for="option in MOTIONS"
        :key="option.id"
        type="button"
        class="h-8 rounded-lg border px-1 text-[10px] font-medium coarse:h-10"
        :class="motion.kind === option.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
        @click="set({ kind: option.id })"
      >
        {{ option.label }}
      </button>
    </div>
    <UiSlider
      v-if="motion.kind !== 'none'"
      :model-value="motion.amount"
      label="Strength"
      :min="0.05"
      :max="1"
      :step="0.01"
      :format="(v) => `${Math.round(v * 100)}%`"
      @update:model-value="(v) => set({ amount: v })"
    />
    <p class="text-[11px] text-muted">Slow camera moves bring photos and static shots to life.</p>
  </PropertiesSection>
</template>
