<script setup>
import { ArrowDown, ArrowUp, Copy, Scissors, SlidersHorizontal, Trash2, Volume2, VolumeX } from 'lucide-vue-next'
import { locateItem } from '~/core/model/queries'
import { hasAudio } from '~/core/model/types'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const props = defineProps({
  open: Boolean,
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  itemId: { type: String, default: null },
})
const emit = defineEmits(['close'])

const projectStore = useProjectStore()
const editor = useEditorStore()
const commands = useEditorCommands()

const location = computed(() => (props.itemId && projectStore.project ? locateItem(projectStore.project, props.itemId) : null))

/** @param {-1 | 1} direction */
function moveToNeighbourTrack(direction) {
  const loc = location.value
  const project = projectStore.project
  if (!loc || !project) return
  const kind = loc.track.kind
  const candidates = project.tracks.map((t, index) => ({ t, index })).filter(({ t }) => t.kind === kind && !t.locked)
  const position = candidates.findIndex(({ t }) => t.id === loc.track.id)
  const target = candidates[position + direction]
  if (target) {
    projectStore.moveItem(loc.item.id, target.t.id, loc.item.start)
  } else {
    // No track in that direction - create one.
    const index = direction === -1 ? loc.trackIndex : loc.trackIndex + 1
    projectStore.moveItemToNewTrack(loc.item.id, loc.item.start, kind, index)
  }
}

const entries = computed(() => {
  const loc = location.value
  const item = loc?.item
  const audio = item && hasAudio(item) ? item.audio : null
  return [
    { label: 'Split at playhead', icon: Scissors, shortcut: 'S', run: () => commands.split() },
    { label: 'Duplicate', icon: Copy, shortcut: 'Ctrl+D', run: () => commands.duplicateSelection() },
    ...(audio
      ? [
          {
            label: audio.muted ? 'Unmute clip' : 'Mute clip',
            icon: audio.muted ? Volume2 : VolumeX,
            run: () =>
              item && projectStore.updateItem(item.id, { audio: { muted: !audio.muted } }, undefined, audio.muted ? 'Unmute clip' : 'Mute clip'),
          },
        ]
      : []),
    { separator: true },
    { label: 'Move to track above', icon: ArrowUp, run: () => moveToNeighbourTrack(-1) },
    { label: 'Move to track below', icon: ArrowDown, run: () => moveToNeighbourTrack(1) },
    { label: 'Open properties', icon: SlidersHorizontal, run: () => editor.focusProperties() },
    { separator: true },
    { label: 'Delete', icon: Trash2, shortcut: 'Del', danger: true, run: () => commands.deleteSelection() },
  ]
})
</script>

<template>
  <UiMenu :open="open && !!location" :x="x" :y="y" :items="entries" @close="emit('close')" />
</template>
