<script setup>
import { Captions, Film, Type } from 'lucide-vue-next'
import { useEditorStore } from '~/stores/editor'

const editor = useEditorStore()

const tabs = [
  { id: 'media', label: 'Media', icon: Film },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'captions', label: 'Captions', icon: Captions },
]
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex gap-1 border-b border-line px-2 pt-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-t-lg px-2 py-2 text-xs font-medium transition-colors"
        :class="editor.sidebarTab === tab.id ? 'bg-panel-2 text-accent' : 'text-muted hover:text-fg'"
        @click="editor.sidebarTab = tab.id"
      >
        <component :is="tab.icon" class="size-4" />
        {{ tab.label }}
      </button>
    </div>
    <MediaLibraryPanel v-if="editor.sidebarTab === 'media'" />
    <TextLibraryPanel v-else-if="editor.sidebarTab === 'text'" />
    <CaptionsPanel v-else />
  </div>
</template>
