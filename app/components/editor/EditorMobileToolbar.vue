<script setup>
/**
 * Phone toolbar (CapCut style): a horizontally scrolling row of big tools that
 * changes with the selection. Each tool runs a command or opens just the
 * matching settings in the bottom sheet.
 */
import {
  ArrowLeft,
  AudioLines,
  Captions,
  Copy,
  Crop,
  Film,
  Gauge,
  Info,
  Move,
  Music,
  Plus,
  Scissors,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2,
  Type,
  Wand2,
  Mic,
  Shapes,
  Droplets,
  Snowflake,
  Bookmark,
  Clapperboard,
  Blend,
  Diamond,
} from 'lucide-vue-next'
import { locateItem } from '~/core/model/queries'
import { hasAudio } from '~/core/model/types'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const editor = useEditorStore()
const media = useMediaStore()
const commands = useEditorCommands()

const item = computed(() => {
  const project = projectStore.project
  const id = editor.selection.length === 1 ? editor.selection[0] : null
  return project && id ? (locateItem(project, id)?.item ?? null) : null
})

function open(section) {
  editor.focusProperties(section)
}

function library(tab) {
  editor.sidebarTab = tab
  editor.mobilePanel = editor.mobilePanel === 'media' && editor.sidebarTab === tab ? null : 'media'
}

async function importMedia(accept) {
  const files = await pickFiles({ accept, multiple: true })
  if (files.length) await media.importFiles(files, { addToTimeline: true })
}

const tools = computed(() => {
  const it = item.value
  if (editor.selection.length > 1) {
    return [
      { id: 'back', label: 'Done', icon: ArrowLeft, run: () => commands.clearSelection() },
      { id: 'dup', label: 'Duplicate', icon: Copy, run: () => commands.duplicateSelection() },
      { id: 'del', label: 'Delete', icon: Trash2, danger: true, run: () => commands.deleteSelection() },
    ]
  }
  if (!it) {
    return [
      { id: 'add', label: 'Add media', icon: Plus, accent: true, run: () => importMedia(MEDIA_ACCEPT) },
      { id: 'library', label: 'Library', icon: Film, run: () => library('media') },
      { id: 'audio', label: 'Audio', icon: Music, run: () => importMedia('audio/*,.mp3,.m4a,.wav,.aac,.ogg,.opus,.flac') },
      { id: 'text', label: 'Text', icon: Type, run: () => library('text') },
      { id: 'elements', label: 'Stickers', icon: Shapes, run: () => library('elements') },
      { id: 'voice', label: 'Voice AI', icon: Mic, run: () => library('voice') },
      { id: 'captions', label: 'Captions', icon: Captions, run: () => library('captions') },
      { id: 'blur', label: 'Blur', icon: Droplets, run: () => commands.addBlur({ mode: 'blur' }) },
      { id: 'ai', label: 'Smart AI', icon: Sparkles, run: () => library('ai') },
      { id: 'split', label: 'Split', icon: Scissors, run: () => commands.split() },
      { id: 'freeze', label: 'Freeze', icon: Snowflake, run: () => commands.freezeFrame() },
      { id: 'marker', label: 'Marker', icon: Bookmark, run: () => commands.toggleMarker() },
      { id: 'project', label: 'Format', icon: Info, run: () => (editor.mobilePanel = editor.mobilePanel === 'project' ? null : 'project') },
    ]
  }
  const back = { id: 'back', label: 'Done', icon: ArrowLeft, run: () => commands.clearSelection() }
  const common = [
    { id: 'split', label: 'Split', icon: Scissors, run: () => commands.split() },
    { id: 'dup', label: 'Duplicate', icon: Copy, run: () => commands.duplicateSelection() },
    { id: 'del', label: 'Delete', icon: Trash2, danger: true, run: () => commands.deleteSelection() },
    { id: 'all', label: 'All settings', icon: SlidersHorizontal, run: () => open(null) },
  ]
  if (it.type === 'text' || it.type === 'caption') {
    return [
      back,
      { id: 'text', label: it.type === 'caption' ? 'Caption' : 'Edit text', icon: Type, run: () => open('text') },
      { id: 'opacity', label: 'Opacity', icon: Blend, run: () => open('transform') },
      { id: 'keys', label: 'Keyframes', icon: Diamond, run: () => open('transform') },
      { id: 'timing', label: 'Duration', icon: Timer, run: () => open('timing') },
      ...common,
    ]
  }
  if (it.type === 'blur') {
    return [
      back,
      { id: 'blur', label: 'Blur', icon: Droplets, run: () => open('blur') },
      { id: 'keys', label: 'Track it', icon: Diamond, run: () => open('transform') },
      { id: 'timing', label: 'Duration', icon: Timer, run: () => open('timing') },
      ...common,
    ]
  }
  if (it.type === 'audio') {
    return [back, { id: 'speed', label: 'Speed', icon: Gauge, run: () => open('speed') }, { id: 'volume', label: 'Volume', icon: AudioLines, run: () => open('audio') }, { id: 'ai', label: 'Smart AI', icon: Sparkles, run: () => open('ai') }, { id: 'timing', label: 'Duration', icon: Timer, run: () => open('timing') }, ...common]
  }
  return [
    back,
    ...(it.type === 'video' ? [{ id: 'speed', label: 'Speed', icon: Gauge, run: () => open('speed') }] : []),
    ...(hasAudio(it) ? [{ id: 'volume', label: 'Volume', icon: AudioLines, run: () => open('audio') }] : []),
    { id: 'effects', label: 'Filters', icon: Wand2, run: () => open('effects') },
    { id: 'opacity', label: 'Opacity', icon: Blend, run: () => open('transform') },
    { id: 'anim', label: 'Animate', icon: Clapperboard, run: () => open('animation') },
    { id: 'motion', label: 'Motion', icon: Move, run: () => open('motion') },
    { id: 'keys', label: 'Keyframes', icon: Diamond, run: () => open('transform') },
    { id: 'transition', label: 'Transition', icon: Shuffle, run: () => open('transition') },
    { id: 'crop', label: 'Crop & fit', icon: Crop, run: () => open('transform') },
    { id: 'ai', label: 'Smart AI', icon: Sparkles, run: () => open('ai') },
    ...(it.type === 'video' ? [{ id: 'freeze', label: 'Freeze', icon: Snowflake, run: () => commands.freezeFrame() }] : []),
    { id: 'timing', label: 'Duration', icon: Timer, run: () => open('timing') },
    ...common,
  ]
})
</script>

<template>
  <nav class="shrink-0 border-t border-line bg-panel safe-bottom" aria-label="Editing tools">
    <div class="flex h-16 items-stretch gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]">
      <button
        v-for="tool in tools"
        :key="tool.id"
        type="button"
        class="flex w-[4.25rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[10.5px] leading-tight font-medium transition-colors active:bg-panel-3"
        :class="tool.danger ? 'text-danger' : tool.accent ? 'text-accent' : 'text-fg/85'"
        @click="tool.run()"
      >
        <span class="grid size-8 place-items-center rounded-full" :class="tool.accent ? 'bg-accent text-accent-fg' : ''">
          <component :is="tool.icon" class="size-5" />
        </span>
        <span class="max-w-full truncate px-0.5">{{ tool.label }}</span>
      </button>
    </div>
  </nav>
</template>
