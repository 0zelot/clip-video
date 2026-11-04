<script setup>
import { Captions, Film, Mic, Shapes, Sparkles, Type } from 'lucide-vue-next'
import { locateItem } from '~/core/model/queries'
import { useProjectStore } from '~/stores/project'
import { useEditorStore } from '~/stores/editor'

const editor = useEditorStore()
const projectStore = useProjectStore()

const selectedItem = computed(() => {
  const project = projectStore.project
  const id = editor.selection.length === 1 ? editor.selection[0] : null
  return project && id ? (locateItem(project, id)?.item ?? null) : null
})

const tabs = [
  { id: 'media', label: 'Media', icon: Film },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'elements', label: 'Elements', icon: Shapes },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'captions', label: 'Captions', icon: Captions },
  { id: 'ai', label: 'AI', icon: Sparkles },
]
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex gap-0.5 overflow-x-auto border-b border-line px-1.5 pt-2 [scrollbar-width:none]">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="flex min-w-12 flex-1 shrink-0 flex-col items-center justify-center gap-0.5 rounded-t-lg px-1.5 py-1.5 text-[10.5px] font-medium transition-colors"
        :class="editor.sidebarTab === tab.id ? 'bg-panel-2 text-accent' : 'text-muted hover:text-fg'"
        @click="editor.sidebarTab = tab.id"
      >
        <component :is="tab.icon" class="size-4" />
        {{ tab.label }}
      </button>
    </div>
    <MediaLibraryPanel v-if="editor.sidebarTab === 'media'" />
    <TextLibraryPanel v-else-if="editor.sidebarTab === 'text'" />
    <CaptionsPanel v-else-if="editor.sidebarTab === 'captions'" />
    <ElementsPanel v-else-if="editor.sidebarTab === 'elements'" />
    <VoicePanel v-else-if="editor.sidebarTab === 'voice'" />
    <div v-else class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <AiTools :item="selectedItem" standalone />
    </div>
  </div>
</template>
