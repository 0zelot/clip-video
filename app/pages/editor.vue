<script setup>
import { Film, Info, Loader2, SlidersHorizontal, Upload } from 'lucide-vue-next'
import { purgeRemovedAssets } from '~/core/operations/project'
import { session, takePendingImport } from '~/services/session'
import { projectRepository } from '~/services/storage/projectRepository'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const editor = useEditorStore()
const media = useMediaStore()
const ui = useUiStore()

const loading = ref(true)
const loadError = ref(null)
const isDesktop = useMediaQuery('(min-width: 1024px)')
const isLandscapePhone = useMediaQuery('(max-height: 520px) and (orientation: landscape)')

useKeyboardShortcuts()

async function load(id) {
  loading.value = true
  loadError.value = null
  try {
    const stored = await projectRepository.get(id)
    if (!stored) throw new Error('This project does not exist on this device any more.')
    const { project, purged } = purgeRemovedAssets(stored)
    if (purged.length) {
      await projectRepository.save(project)
      void projectRepository.collectGarbage(purged)
    }
    editor.reset()
    projectStore.open(project)
    editor.createEngine()
    session.setLastOpen(project.id)
    await media.loadProjectMedia(project)
    const pending = takePendingImport()
    if (pending.length) await media.importFiles(pending, { addToTimeline: true })
    editor.engine?.refresh()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const id = typeof route.query.id === 'string' ? route.query.id : null
  if (!id) {
    void router.replace('/')
    return
  }
  void load(id)
})

// Keep media elements and the preview in sync with every project change.
watch(
  () => projectStore.project,
  () => editor.engine?.refresh(),
)

// ----- unsaved changes protection --------------------------------------------

function onBeforeUnload(e) {
  if (!projectStore.project || !projectStore.hasUnsavedChanges) return
  void projectStore.save()
  e.preventDefault()
  e.returnValue = ''
}

function onVisibility() {
  // Mobile browsers / Android may kill a backgrounded app without unload events.
  if (document.visibilityState === 'hidden' && projectStore.hasUnsavedChanges) void projectStore.save()
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeRouteLeave(async () => {
  if (!projectStore.project) return true
  editor.engine?.pause()
  if (projectStore.hasUnsavedChanges) {
    const ok = await projectStore.save()
    if (!ok) {
      return ui.confirm({
        title: 'Leave without saving?',
        message: `The latest changes could not be saved (${projectStore.saveError ?? 'unknown error'}). They will be lost.`,
        confirmLabel: 'Leave anyway',
        danger: true,
      })
    }
  }
  await captureThumbnail(true)
  return true
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibility)
  editor.destroyEngine()
  media.unloadAll()
  projectStore.close()
})

// ----- project thumbnail ------------------------------------------------------

let lastThumbAt = 0
async function captureThumbnail(force = false) {
  const project = projectStore.project
  const source = document.querySelector('canvas[data-preview-canvas]')
  if (!project || !source || source.width === 0) return
  if (!force && Date.now() - lastThumbAt < 20000) return
  lastThumbAt = Date.now()
  const width = 320
  const height = Math.round((width * source.height) / source.width)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(source, 0, 0, width, height)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75))
  if (blob) await projectRepository.saveThumbnail(project.id, blob).catch(() => {})
}
watch(() => projectStore.lastSavedAt, () => void captureThumbnail())

// ----- drag & drop from the OS -----------------------------------------------

const { dragging } = useFileDrop((files) => {
  if (projectStore.project) void media.importFiles(files, { addToTimeline: true })
})

// ----- layout ---------------------------------------------------------------------

function resizeTimeline(e) {
  const startY = e.clientY
  const startHeight = editor.timelineHeight
  const target = e.currentTarget
  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // pointer capture is optional (synthetic events, some touch stacks)
  }
  const move = (ev) => {
    const max = window.innerHeight - 260
    editor.setTimelineHeight(Math.min(max, Math.max(160, startHeight - (ev.clientY - startY))))
  }
  const up = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
}

const mobileTabs = [
  { id: 'media', label: 'Media', icon: Film },
  { id: 'properties', label: 'Edit', icon: SlidersHorizontal },
  { id: 'project', label: 'Project', icon: Info },
]

watch(isDesktop, (desktop) => {
  if (desktop) editor.mobilePanel = null
})
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-bg safe-top">
    <EditorTopBar />

    <div v-if="loading" class="grid flex-1 place-items-center">
      <div class="flex flex-col items-center gap-3 text-muted">
        <Loader2 class="size-8 animate-spin text-accent" />
        <p class="text-sm">Opening project…</p>
      </div>
    </div>

    <div v-else-if="loadError" class="grid flex-1 place-items-center p-6">
      <div class="max-w-sm text-center">
        <p class="text-lg font-semibold">Could not open the project</p>
        <p class="mt-2 text-sm text-muted">{{ loadError }}</p>
        <UiButton class="mt-5" variant="primary" @click="session.clearLastOpen(); router.replace('/')">Back to projects</UiButton>
      </div>
    </div>

    <template v-else-if="projectStore.project">
      <EditorMissingMedia />

      <div class="flex min-h-0 flex-1" :class="isLandscapePhone ? 'flex-row' : 'flex-col'">
        <div class="flex min-h-0 flex-1">
          <aside v-if="isDesktop" class="flex w-72 shrink-0 flex-col border-r border-line bg-panel xl:w-80">
            <EditorSidebar />
          </aside>

          <section class="flex min-w-0 flex-1 flex-col">
            <CanvasPreview class="min-h-0 flex-1" />
          </section>

          <aside v-if="isDesktop" class="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
            <PropertiesPanel />
          </aside>
        </div>

        <div
          v-if="isDesktop"
          class="h-1.5 shrink-0 cursor-row-resize border-t border-line bg-panel hover:bg-accent/40"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize timeline"
          @pointerdown="resizeTimeline"
        />

        <TimelinePanel
          class="shrink-0"
          :class="isLandscapePhone ? 'w-[55%] border-l border-line' : ''"
          :style="isDesktop ? { height: `${editor.timelineHeight}px` } : isLandscapePhone ? {} : { height: '42%' }"
        />
      </div>

      <nav v-if="!isDesktop" class="flex shrink-0 border-t border-line bg-panel safe-bottom" aria-label="Editor panels">
        <button
          v-for="tab in mobileTabs"
          :key="tab.id"
          type="button"
          class="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
          :class="editor.mobilePanel === tab.id ? 'text-accent' : 'text-muted'"
          @click="editor.mobilePanel = editor.mobilePanel === tab.id ? null : tab.id"
        >
          <component :is="tab.icon" class="size-5" />
          {{ tab.label }}
        </button>
      </nav>

      <EditorMobileSheet v-if="!isDesktop" />
      <ExportDialog />
    </template>

    <EditorShortcutsDialog />

    <div v-if="dragging && projectStore.project" class="pointer-events-none fixed inset-0 z-[150] grid place-items-center bg-bg/75 backdrop-blur-sm">
      <div class="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent px-12 py-10 text-center">
        <Upload class="size-10 text-accent" />
        <p class="text-lg font-semibold">Drop files to import</p>
        <p class="text-sm text-muted">Drop on a track to place them at that position</p>
      </div>
    </div>
  </div>
</template>
