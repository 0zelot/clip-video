<script setup>
import { X } from 'lucide-vue-next'
import { useEditorStore } from '~/stores/editor'

const editor = useEditorStore()
const titles = { media: 'Library', properties: 'Edit', project: 'Project' }

function close() {
  editor.mobilePanel = null
  editor.propertiesFocus = null
}

// Swipe the handle down to close.
let startY = null
function onHandleDown(e) {
  startY = e.clientY
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {
    // optional
  }
}
function onHandleUp(e) {
  if (startY !== null && e.clientY - startY > 50) close()
  startY = null
}
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
      class="fixed inset-x-0 z-[120] flex flex-col rounded-t-2xl border-t border-line bg-panel shadow-[0_-12px_40px_rgba(0,0,0,.5)]"
      :class="editor.mobilePanel === 'properties' && editor.propertiesFocus ? 'h-[min(48vh,460px)]' : 'h-[min(62vh,560px)]'"
      style="bottom: calc(4rem + env(safe-area-inset-bottom))"
      role="dialog"
      :aria-label="titles[editor.mobilePanel]"
    >
      <header
        class="flex cursor-grab touch-none items-center justify-between px-3 py-2"
        @pointerdown="onHandleDown"
        @pointerup="onHandleUp"
        @pointercancel="startY = null"
      >
        <span class="mx-auto h-1 w-10 rounded-full bg-line" aria-hidden="true" />
      </header>
      <div class="flex items-center justify-between px-4 pt-2">
        <h2 class="text-sm font-semibold">{{ titles[editor.mobilePanel] }}</h2>
        <UiIconButton :icon="X" label="Close panel" size="sm" @click="close" />
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
