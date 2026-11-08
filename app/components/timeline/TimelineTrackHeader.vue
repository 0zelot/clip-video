<script setup>
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, LockOpen, MoreVertical, Music, Trash2, Video, Volume2, VolumeX } from 'lucide-vue-next'
import { useProjectStore } from '~/stores/project'

const props = defineProps({
  /** @type {import('vue').PropType<import('~/core/model/types').Track>} */
  track: { type: Object, required: true },
  height: { type: Number, required: true },
  canMoveUp: Boolean,
  canMoveDown: Boolean,
  /** Narrow screens: only the most used toggle plus a menu. */
  compact: Boolean,
})

const projectStore = useProjectStore()
const commands = useEditorCommands()

const menu = ref({ open: false, x: 0, y: 0 })
function openMenu(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  menu.value = { open: true, x: rect.left, y: rect.bottom + 4 }
}

const menuItems = computed(() => [
  ...(props.track.kind === 'visual'
    ? [{ label: props.track.hidden ? 'Show track' : 'Hide track', icon: props.track.hidden ? Eye : EyeOff, run: () => projectStore.updateTrack(props.track.id, { hidden: !props.track.hidden }) }]
    : []),
  { label: props.track.muted ? 'Unmute track' : 'Mute track', icon: props.track.muted ? Volume2 : VolumeX, run: () => projectStore.updateTrack(props.track.id, { muted: !props.track.muted }) },
  { label: props.track.locked ? 'Unlock track' : 'Lock track', icon: props.track.locked ? LockOpen : Lock, run: () => projectStore.updateTrack(props.track.id, { locked: !props.track.locked }) },
  { separator: true },
  { label: 'Move up', icon: ChevronUp, disabled: !props.canMoveUp, run: () => projectStore.moveTrack(props.track.id, -1) },
  { label: 'Move down', icon: ChevronDown, disabled: !props.canMoveDown, run: () => projectStore.moveTrack(props.track.id, 1) },
  { separator: true },
  { label: 'Delete track', icon: Trash2, danger: true, run: () => commands.removeTrack(props.track.id) },
])
</script>

<template>
  <div class="mb-1 flex flex-col justify-between gap-1 border-b border-line/60 px-1.5 py-1" :style="{ height: `${props.height}px` }">
    <div class="flex min-w-0 items-center gap-1">
      <component
        :is="track.kind === 'audio' ? Music : Video"
        class="size-3.5 shrink-0"
        :class="track.kind === 'audio' ? 'text-clip-audio' : 'text-accent'"
      />
      <span class="min-w-0 flex-1 truncate text-[11px] font-medium" :title="track.name">{{ track.name }}</span>
      <template v-if="!compact">
        <UiIconButton
          :icon="ChevronUp"
          label="Move track up"
          size="sm"
          :disabled="!canMoveUp"
          class="hidden sm:inline-flex"
          @click="projectStore.moveTrack(track.id, -1)"
        />
        <UiIconButton
          :icon="ChevronDown"
          label="Move track down"
          size="sm"
          :disabled="!canMoveDown"
          class="hidden sm:inline-flex"
          @click="projectStore.moveTrack(track.id, 1)"
        />
      </template>
    </div>

    <div v-if="compact" class="flex items-center justify-between gap-0.5">
      <UiIconButton
        v-if="track.kind === 'visual'"
        :icon="track.hidden ? EyeOff : Eye"
        :label="track.hidden ? 'Show track' : 'Hide track'"
        size="sm"
        :active="track.hidden"
        @click="projectStore.updateTrack(track.id, { hidden: !track.hidden })"
      />
      <UiIconButton
        v-else
        :icon="track.muted ? VolumeX : Volume2"
        :label="track.muted ? 'Unmute track' : 'Mute track'"
        size="sm"
        :active="track.muted"
        @click="projectStore.updateTrack(track.id, { muted: !track.muted })"
      />
      <Lock v-if="track.locked" class="size-3.5 text-warn" />
      <UiIconButton :icon="MoreVertical" label="Track options" size="sm" @click="openMenu" />
    </div>
    <div v-else class="flex items-center gap-0.5">
      <UiIconButton
        v-if="track.kind === 'visual'"
        :icon="track.hidden ? EyeOff : Eye"
        :label="track.hidden ? 'Show track' : 'Hide track'"
        size="sm"
        :active="track.hidden"
        @click="projectStore.updateTrack(track.id, { hidden: !track.hidden })"
      />
      <UiIconButton
        :icon="track.muted ? VolumeX : Volume2"
        :label="track.muted ? 'Unmute track' : 'Mute track'"
        size="sm"
        :active="track.muted"
        @click="projectStore.updateTrack(track.id, { muted: !track.muted })"
      />
      <UiIconButton
        :icon="track.locked ? Lock : LockOpen"
        :label="track.locked ? 'Unlock track' : 'Lock track'"
        size="sm"
        :active="track.locked"
        @click="projectStore.updateTrack(track.id, { locked: !track.locked })"
      />
      <UiIconButton :icon="Trash2" label="Delete track" size="sm" @click="commands.removeTrack(track.id)" />
    </div>
    <UiMenu :open="menu.open" :x="menu.x" :y="menu.y" :items="menuItems" @close="menu.open = false" />
  </div>
</template>
