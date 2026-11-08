<script setup>
/**
 * One phrase in the captions list. A separate component so that editing one
 * caption (or any other change to the project) does not re-render hundreds of
 * rows - Vue skips rows whose props did not change.
 */
import { Merge, Scissors, Trash2 } from 'lucide-vue-next'
import { formatTimecode } from '~/core/time'

const props = defineProps({
  item: { type: Object, required: true },
  fps: { type: Number, required: true },
  selected: Boolean,
})
const emit = defineEmits(['seek', 'split', 'merge', 'remove', 'text', 'start', 'end', 'focus'])
</script>

<template>
  <li class="rounded-xl border p-2" :class="selected ? 'border-accent bg-accent/5' : 'border-line bg-panel-2'">
    <div class="flex items-center gap-1 text-[11px] text-muted">
      <button type="button" class="font-mono hover:text-accent" @click="emit('seek', props.item)">
        {{ formatTimecode(item.start, fps) }}
      </button>
      <span>→</span>
      <span class="font-mono">{{ formatTimecode(item.start + item.duration, fps) }}</span>
      <span class="flex-1" />
      <UiIconButton :icon="Scissors" label="Split phrase" size="sm" @click="emit('split', props.item)" />
      <UiIconButton :icon="Merge" label="Merge with next" size="sm" @click="emit('merge', props.item)" />
      <UiIconButton :icon="Trash2" label="Delete phrase" size="sm" @click="emit('remove', props.item)" />
    </div>
    <textarea
      :value="item.text"
      rows="2"
      class="field mt-1 h-auto py-1 text-xs leading-snug"
      @input="emit('text', props.item, $event.target.value)"
      @focus="emit('focus', props.item)"
    />
    <div class="mt-1 grid grid-cols-2 gap-1.5">
      <UiTimeField :model-value="item.start" :fps="fps" @commit="(v) => emit('start', props.item, v)" />
      <UiTimeField :model-value="item.start + item.duration" :fps="fps" :min="item.start + 0.1" @commit="(v) => emit('end', props.item, v)" />
    </div>
  </li>
</template>
