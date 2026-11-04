<script setup>
import { Bookmark, Captions, Copy, Crosshair, Magnet, Snowflake, Maximize, Scissors, SquareDashedBottom, Trash2, Type, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { formatTimecode } from '~/core/time'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

defineProps({ zoomFitDisabled: Boolean })
const emit = defineEmits(['zoom', 'zoomFit'])

const editor = useEditorStore()
const projectStore = useProjectStore()
const commands = useEditorCommands()

function openCaptions() {
  editor.sidebarTab = 'captions'
  editor.mobilePanel = 'media'
}

const hasSelection = computed(() => editor.selection.length > 0)
const fps = computed(() => projectStore.project?.settings.fps ?? 30)
const rangeLabel = computed(() => {
  if (editor.markIn === null || editor.markOut === null) return null
  return `${formatTimecode(editor.markIn, fps.value)} → ${formatTimecode(editor.markOut, fps.value)}`
})
</script>

<template>
  <div class="flex items-center gap-1 overflow-x-auto border-b border-line px-1.5 py-1.5">
    <UiIconButton :icon="Scissors" label="Split at playhead (S)" size="sm" @click="commands.split()" />
    <UiIconButton :icon="Type" label="Add text at playhead (T)" size="sm" @click="commands.addText()" />
    <UiIconButton :icon="Captions" label="Captions" size="sm" @click="openCaptions()" />
    <UiIconButton :icon="Snowflake" label="Freeze frame (F)" size="sm" @click="commands.freezeFrame()" />
    <UiIconButton :icon="Bookmark" label="Marker (M) · jump with [ ]" size="sm" @click="commands.toggleMarker()" />
    <UiIconButton :icon="Copy" label="Duplicate (Ctrl+D)" size="sm" :disabled="!hasSelection" @click="commands.duplicateSelection()" />
    <UiIconButton :icon="Trash2" label="Delete (Del)" size="sm" :disabled="!hasSelection" @click="commands.deleteSelection()" />

    <div class="mx-1 h-5 w-px shrink-0 bg-line" />

    <button
      v-tooltip="'Set In point (I)'"
      type="button"
      class="h-7 shrink-0 rounded-md px-2 font-mono text-xs hover:bg-panel-3 coarse:h-10"
      :class="editor.markIn !== null ? 'text-accent' : 'text-muted'"
      @click="commands.markIn()"
    >
      In
    </button>
    <button
      v-tooltip="'Set Out point (O)'"
      type="button"
      class="h-7 shrink-0 rounded-md px-2 font-mono text-xs hover:bg-panel-3 coarse:h-10"
      :class="editor.markOut !== null ? 'text-accent' : 'text-muted'"
      @click="commands.markOut()"
    >
      Out
    </button>
    <UiIconButton
      :icon="SquareDashedBottom"
      label="Ripple-delete the In→Out range (Shift+Del)"
      size="sm"
      :disabled="editor.markIn === null || editor.markOut === null"
      @click="commands.deleteRange(true)"
    />
    <span v-if="rangeLabel" class="shrink-0 font-mono text-[11px] text-accent">{{ rangeLabel }}</span>
    <button v-if="rangeLabel" type="button" class="shrink-0 text-[11px] text-muted hover:text-fg" @click="commands.clearMarks()">clear</button>

    <div class="flex-1" />

    <UiIconButton
      :icon="Crosshair"
      label="Fixed centre playhead (scroll to scrub)"
      size="sm"
      :active="editor.centerPlayhead"
      @click="editor.setCenterPlayhead(!editor.centerPlayhead)"
    />
    <UiIconButton :icon="Magnet" label="Snapping (N)" size="sm" :active="editor.snapping" @click="editor.snapping = !editor.snapping" />
    <UiIconButton :icon="ZoomOut" label="Zoom out (−)" size="sm" @click="emit('zoom', 0.8)" />
    <UiIconButton :icon="ZoomIn" label="Zoom in (+)" size="sm" @click="emit('zoom', 1.25)" />
    <UiIconButton :icon="Maximize" label="Fit project to width" size="sm" :disabled="zoomFitDisabled" @click="emit('zoomFit')" />
  </div>
</template>
