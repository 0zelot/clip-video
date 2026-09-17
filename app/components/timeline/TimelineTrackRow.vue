<script setup>
import { useEditorStore } from '~/stores/editor'

defineProps({
  /** @type {import('vue').PropType<import('~/core/model/types').Track>} */
  track: { type: Object, required: true },
  top: { type: Number, required: true },
  height: { type: Number, required: true },
  /** Time of the pending drop on this track, or null. */
  dropHint: { type: Number, default: null },
})
defineEmits(['menu'])

const editor = useEditorStore()
</script>

<template>
  <div
    class="absolute right-0 left-0 rounded-md"
    :class="track.locked ? 'bg-panel-2/40' : 'bg-panel-2/70'"
    :style="{ top: `${top}px`, height: `${height}px` }"
    :data-track-id="track.id"
  >
    <div
      v-if="dropHint !== null"
      class="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent"
      :style="{ left: `${dropHint * editor.zoom}px` }"
    />
    <TimelineItem
      v-for="item in track.items"
      :key="item.id"
      :item="item"
      :track="track"
      :height="height"
      @menu="$emit('menu', $event)"
    />
  </div>
</template>
