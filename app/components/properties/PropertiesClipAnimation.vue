<script setup>
import { Clapperboard } from 'lucide-vue-next'
import { CLIP_ANIMATIONS } from '~/core/model/defaults'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const editor = useEditorStore()

const animation = computed(() => props.item.animation ?? { in: { kind: 'none', duration: 0.4 }, out: { kind: 'none', duration: 0.4 } })

function set(which, patch) {
  const next = { in: { ...animation.value.in }, out: { ...animation.value.out } }
  next[which] = { ...next[which], ...patch }
  if (patch.kind && patch.kind !== 'none' && !(next[which].duration > 0)) next[which].duration = 0.4
  projectStore.updateItem(props.item.id, { animation: next }, `clipanim:${props.item.id}`, 'Clip animation')
  editor.engine?.refresh()
}
</script>

<template>
  <PropertiesSection title="Animation in / out" :icon="Clapperboard" :default-open="false">
    <div v-for="which in ['in', 'out']" :key="which" class="grid grid-cols-[1fr_6rem] gap-2">
      <label class="block">
        <span class="label">{{ which === 'in' ? 'Enter' : 'Exit' }}</span>
        <select class="field" :value="animation[which].kind" @change="set(which, { kind: $event.target.value })">
          <option v-for="a in CLIP_ANIMATIONS" :key="a.id" :value="a.id">{{ a.label }}</option>
        </select>
      </label>
      <UiNumberField
        :model-value="animation[which].duration"
        label="Time"
        :min="0.05"
        :max="Math.max(0.1, item.duration / 2)"
        :step="0.05"
        :precision="2"
        suffix="s"
        :disabled="animation[which].kind === 'none'"
        @commit="(v) => set(which, { duration: v })"
      />
    </div>
    <p class="text-[11px] text-muted">Great for photos, stickers and picture-in-picture clips.</p>
  </PropertiesSection>
</template>
