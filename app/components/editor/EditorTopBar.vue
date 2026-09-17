<script setup>
import { ChevronLeft, CircleHelp, Download, Redo2, Save, Undo2 } from 'lucide-vue-next'
import { isMac } from '~/services/platform/platform'
import { session } from '~/services/session'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const projectStore = useProjectStore()
const editor = useEditorStore()
const ui = useUiStore()
const router = useRouter()
const commands = useEditorCommands()

const mod = isMac() ? '⌘' : 'Ctrl+'
const editingName = ref(false)
const nameDraft = ref('')
const nameInput = ref(null)

async function startRename() {
  if (!projectStore.project) return
  nameDraft.value = projectStore.project.name
  editingName.value = true
  await nextTick()
  nameInput.value?.select()
}

function commitRename() {
  if (!editingName.value) return
  editingName.value = false
  if (nameDraft.value.trim() && nameDraft.value.trim() !== projectStore.project?.name) projectStore.rename(nameDraft.value)
}

function back() {
  session.clearLastOpen()
  void router.push('/')
}
</script>

<template>
  <header class="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-1.5 sm:gap-2 sm:px-2 coarse:h-14">
    <UiIconButton :icon="ChevronLeft" label="Back to projects" @click="back" />

    <div class="min-w-0 flex-1 sm:flex-none">
      <input
        v-if="editingName"
        ref="nameInput"
        v-model="nameDraft"
        class="field h-8 max-w-64"
        maxlength="120"
        aria-label="Project name"
        @blur="commitRename"
        @keydown.enter="commitRename"
        @keydown.esc="editingName = false"
      />
      <button
        v-else
        v-tooltip="'Rename project'"
        type="button"
        class="block max-w-full truncate rounded-md px-2 py-1 text-left text-sm font-semibold hover:bg-panel-3 sm:max-w-72"
        @click="startRename"
      >
        {{ projectStore.project?.name ?? 'Clip' }}
      </button>
    </div>

    <EditorSaveIndicator />

    <div class="flex-1" />

    <template v-if="projectStore.project">
      <UiIconButton
        :icon="Undo2"
        :label="projectStore.undoLabel ? `Undo ${projectStore.undoLabel} (${mod}Z)` : `Undo (${mod}Z)`"
        :disabled="!projectStore.canUndo"
        @click="commands.undo()"
      />
      <UiIconButton
        :icon="Redo2"
        :label="projectStore.redoLabel ? `Redo ${projectStore.redoLabel} (${mod}Shift+Z)` : `Redo (${mod}Shift+Z)`"
        :disabled="!projectStore.canRedo"
        @click="commands.redo()"
      />
      <UiIconButton
        class="hidden sm:inline-flex"
        :icon="Save"
        :label="`Save now (${mod}S)`"
        :disabled="projectStore.saveStatus === 'saving'"
        @click="commands.save()"
      />
      <UiIconButton class="hidden md:inline-flex" :icon="CircleHelp" label="Keyboard shortcuts (?)" @click="ui.shortcutsOpen = true" />
      <UiButton variant="primary" :icon="Download" class="ml-1" @click="commands.openExport()">
        <span class="hidden sm:inline">Export</span>
      </UiButton>
    </template>
    <span v-if="editor.playing" class="sr-only">Playing</span>
  </header>
</template>
