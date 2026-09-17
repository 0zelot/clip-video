<script setup>
import { X } from 'lucide-vue-next'
import { useEditorStore } from '~/stores/editor'

const editor = useEditorStore()
const titles = { media: 'Library', properties: 'Edit', project: 'Project' }
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-full"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-full"
  >
    <div
      v-if="editor.mobilePanel"
      class="fixed inset-x-0 bottom-14 z-[120] flex h-[min(62vh,560px)] flex-col rounded-t-2xl border-t border-line bg-panel shadow-[0_-12px_40px_rgba(0,0,0,.5)] safe-bottom"
      role="dialog"
      :aria-label="titles[editor.mobilePanel]"
    >
      <header class="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span class="mx-auto h-1 w-10 rounded-full bg-line" aria-hidden="true" />
      </header>
      <div class="flex items-center justify-between px-4 pt-2">
        <h2 class="text-sm font-semibold">{{ titles[editor.mobilePanel] }}</h2>
        <UiIconButton :icon="X" label="Close panel" size="sm" @click="editor.mobilePanel = null" />
      </div>
      <div class="flex min-h-0 flex-1 flex-col">
        <EditorSidebar v-if="editor.mobilePanel === 'media'" />
        <PropertiesPanel v-else-if="editor.mobilePanel === 'properties'" />
        <div v-else class="min-h-0 flex-1 overflow-y-auto p-4">
          <ProjectSettingsPanel />
        </div>
      </div>
    </div>
  </Transition>
</template>
