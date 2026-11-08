<script setup>
import { Clapperboard, FolderOpen, Plus, RotateCcw, Upload } from 'lucide-vue-next'
import { createProject } from '~/core/model/defaults'
import { formatDuration } from '~/core/time'
import { session, setPendingImport } from '~/services/session'
import { projectRepository } from '~/services/storage/projectRepository'
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()
const router = useRouter()

const projects = ref([])
const loading = ref(true)
const loadError = ref(null)
const createOpen = ref(false)
const lastOpen = ref(null)
const pendingFiles = ref([])

async function refresh() {
  try {
    projects.value = await projectRepository.list()
    const lastId = session.getLastOpen()
    lastOpen.value = projects.value.find((p) => p.id === lastId) ?? null
    loadError.value = null
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const fresh = session.isFreshStart()
  await refresh()
  // App (re)launch while a project was open: continue where the user left off.
  if (fresh && lastOpen.value) {
    await router.replace({ path: '/editor', query: { id: lastOpen.value.id } })
  }
})

function openProject(id) {
  void router.push({ path: '/editor', query: { id } })
}

async function onCreate(options) {
  createOpen.value = false
  try {
    const project = await projectRepository.create(
      createProject(options.name, { width: options.width, height: options.height, fps: options.fps }),
    )
    if (project.name !== options.name) ui.toast(`"${options.name}" already exists - named it "${project.name}"`, 'info')
    if (pendingFiles.value.length) setPendingImport(pendingFiles.value)
    pendingFiles.value = []
    openProject(project.id)
  } catch (error) {
    ui.toast(`Could not create the project: ${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

async function rename(p) {
  const name = await ui.prompt({ title: 'Rename project', label: 'Name', value: p.name, confirmLabel: 'Rename' })
  if (!name?.trim()) return
  const used = await projectRepository.rename(p.id, name.trim())
  if (used && used !== name.trim()) ui.toast(`That name is taken - renamed to "${used}"`, 'info')
  await refresh()
}

async function duplicate(p) {
  const copy = await projectRepository.duplicate(p.id)
  if (copy) ui.toast(`Duplicated as "${copy.name}"`, 'success')
  await refresh()
}

async function remove(p) {
  const ok = await ui.confirm({
    title: `Delete "${p.name}"?`,
    message: 'The project and its imported media stored on this device will be permanently deleted. This cannot be undone.',
    confirmLabel: 'Delete project',
    danger: true,
  })
  if (!ok) return
  await projectRepository.remove(p.id)
  if (session.getLastOpen() === p.id) session.clearLastOpen()
  ui.toast(`Deleted "${p.name}"`, 'success')
  await refresh()
}

const { dragging } = useFileDrop((files) => {
  pendingFiles.value = files
  createOpen.value = true
})
</script>

<template>
  <div class="min-h-full safe-top">
    <header class="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div class="flex items-center gap-2.5">
          <div class="grid size-9 place-items-center rounded-xl bg-accent text-accent-fg">
            <Clapperboard class="size-5" />
          </div>
          <div>
            <h1 class="text-lg leading-tight font-bold">Clip</h1>
            <p class="text-xs text-muted">Private video editor · your files never leave this device</p>
          </div>
        </div>
        <UiButton variant="primary" :icon="Plus" @click="createOpen = true">New project</UiButton>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6">
      <button
        v-if="lastOpen"
        type="button"
        class="mb-6 flex w-full items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4 text-left transition-colors hover:bg-accent/15"
        @click="openProject(lastOpen.id)"
      >
        <RotateCcw class="size-5 shrink-0 text-accent" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold">Continue editing</p>
          <p class="truncate text-sm text-muted">{{ lastOpen.name }} · {{ formatDuration(lastOpen.duration) }}</p>
        </div>
        <span class="text-sm font-semibold text-accent">Open</span>
      </button>

      <div class="mb-4 flex items-end justify-between gap-3">
        <h2 class="panel-title">Recent projects</h2>
        <ProjectStorageInfo />
      </div>

      <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div v-for="i in 4" :key="i" class="aspect-[4/5] animate-pulse rounded-2xl bg-panel" />
      </div>

      <div v-else-if="loadError" class="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-sm">
        <p class="font-semibold text-danger">Local storage is not available</p>
        <p class="mt-1 text-muted">{{ loadError }}</p>
        <p class="mt-2 text-muted">Private browsing modes may block IndexedDB. Projects cannot be saved in this mode.</p>
      </div>

      <div
        v-else-if="projects.length === 0"
        class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-16 text-center"
      >
        <div class="mb-4 grid size-14 place-items-center rounded-2xl bg-panel-2">
          <FolderOpen class="size-7 text-muted" />
        </div>
        <p class="text-base font-semibold">No projects yet</p>
        <p class="mt-1 max-w-sm text-sm text-muted">
          Create a project for TikTok, Shorts, Reels or YouTube - or drop video files anywhere on this page to start.
        </p>
        <UiButton class="mt-5" variant="primary" :icon="Plus" @click="createOpen = true">Create your first project</UiButton>
      </div>

      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <ProjectCard
          v-for="p in projects"
          :key="p.id"
          :project="p"
          @open="openProject(p.id)"
          @rename="rename(p)"
          @duplicate="duplicate(p)"
          @delete="remove(p)"
        />
      </div>
    </main>

    <ProjectCreateDialog :open="createOpen" :files="pendingFiles" @close="createOpen = false; pendingFiles = []" @create="onCreate" />

    <div v-if="dragging" class="pointer-events-none fixed inset-0 z-[150] grid place-items-center bg-bg/80 backdrop-blur-sm">
      <div class="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent px-12 py-10 text-center">
        <Upload class="size-10 text-accent" />
        <p class="text-lg font-semibold">Drop to start a new project</p>
      </div>
    </div>
  </div>
</template>
