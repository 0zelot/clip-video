<script setup>
import { Download, RotateCcw, Share2, TriangleAlert } from 'lucide-vue-next'
import { formatDuration } from '~/core/time'
import { projectHasAudio } from '~/services/export/audioMix'
import { getExportSupport, startExport } from '~/services/export/exportClient'
import { ExportCancelledError } from '~/services/export/types'
import { canShareFiles, sanitizeFileName, saveFile, shareFile } from '~/services/platform/fileExport'
import { isNativeApp } from '~/services/platform/platform'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const projectStore = useProjectStore()
const editor = useEditorStore()
const ui = useUiStore()

const QUALITY_PRESETS = [
  { id: 'low', label: 'Low', mbpsPerMegapixel: 2.5 },
  { id: 'medium', label: 'Medium', mbpsPerMegapixel: 5 },
  { id: 'high', label: 'High', mbpsPerMegapixel: 9 },
  { id: 'custom', label: 'Custom', mbpsPerMegapixel: 0 },
]

const container = ref('mp4')
const resolutionScale = ref(1)
const fps = ref(30)
const quality = ref('high')
const customMbps = ref(10)
const audioKbps = ref(192)
const includeAudio = ref(true)

const running = ref(false)
const progress = ref(null)
const result = ref(null)
const resultUrl = ref(null)
const error = ref(null)
const startedAt = ref(0)
const saving = ref(false)
let handle = null

const support = computed(() => getExportSupport())
const hasAudio = computed(() => (projectStore.project ? projectHasAudio(projectStore.project) : false))

const resolutions = computed(() => {
  const s = projectStore.project?.settings
  if (!s) return []
  const options = [{ scale: 1, label: `Project (${s.width}×${s.height})` }]
  for (const target of [1080, 720, 480]) {
    const short = Math.min(s.width, s.height)
    if (target < short) options.push({ scale: target / short, label: `${target}p` })
  }
  return options
})

const output = computed(() => {
  const s = projectStore.project?.settings
  if (!s) return { width: 0, height: 0 }
  const even = (n) => Math.max(2, Math.round((n * resolutionScale.value) / 2) * 2)
  return { width: even(s.width), height: even(s.height) }
})

const videoBitrate = computed(() => {
  if (quality.value === 'custom') return Math.round(customMbps.value * 1_000_000)
  const preset = QUALITY_PRESETS.find((p) => p.id === quality.value)
  const megapixels = (output.value.width * output.value.height) / 1_000_000
  const fpsFactor = fps.value / 30
  return Math.round(Math.max(1, megapixels) * preset.mbpsPerMegapixel * fpsFactor * 1_000_000)
})

const estimatedSize = computed(() => {
  const seconds = projectStore.duration
  const bits = seconds * (videoBitrate.value + (includeAudio.value && hasAudio.value ? audioKbps.value * 1000 : 0))
  return bits / 8 / 1024 / 1024
})

const eta = computed(() => {
  const p = progress.value
  if (!p || !running.value || p.progress <= 0.02) return null
  const elapsed = (performance.now() - startedAt.value) / 1000
  return (elapsed / p.progress) * (1 - p.progress)
})

const fileName = computed(() => `${sanitizeFileName(projectStore.project?.name ?? 'clip')}.${result.value?.extension ?? container.value}`)

watch(
  () => editor.exportOpen,
  (open) => {
    if (!open) return
    const s = projectStore.project?.settings
    if (s) fps.value = s.fps
    resolutionScale.value = 1
    includeAudio.value = hasAudio.value
    error.value = null
  },
)

function reset() {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  resultUrl.value = null
  result.value = null
  progress.value = null
  error.value = null
}

async function run() {
  const project = projectStore.project
  if (!project || running.value) return
  reset()
  running.value = true
  startedAt.value = performance.now()
  const options = {
    container: container.value,
    width: output.value.width,
    height: output.value.height,
    fps: fps.value,
    videoBitrate: videoBitrate.value,
    audioBitrate: audioKbps.value * 1000,
    includeAudio: includeAudio.value && hasAudio.value,
  }
  handle = startExport(project, options, (p) => (progress.value = p))
  try {
    const value = await handle.promise
    result.value = value
    resultUrl.value = URL.createObjectURL(new Blob([value.buffer], { type: value.mimeType }))
    for (const warning of value.warnings) ui.toast(warning, 'warning', { timeout: 8000 })
  } catch (e) {
    if (e instanceof ExportCancelledError) ui.toast('Export cancelled', 'info')
    else error.value = e instanceof Error ? e.message : String(e)
  } finally {
    running.value = false
    handle = null
  }
}

function cancel() {
  handle?.cancel()
}

async function download() {
  if (!resultUrl.value || !result.value) return
  saving.value = true
  try {
    const blob = new Blob([result.value.buffer], { type: result.value.mimeType })
    const { location } = await saveFile(blob, fileName.value)
    ui.toast(`Saved to ${location}`, 'success')
  } catch (e) {
    ui.toast(`Could not save the file: ${e instanceof Error ? e.message : String(e)}`, 'error')
  } finally {
    saving.value = false
  }
}

async function share() {
  if (!result.value) return
  saving.value = true
  try {
    await shareFile(new Blob([result.value.buffer], { type: result.value.mimeType }), fileName.value)
  } catch (e) {
    if (e?.name !== 'AbortError') ui.toast(`Sharing failed: ${e instanceof Error ? e.message : String(e)}`, 'error')
  } finally {
    saving.value = false
  }
}

function close() {
  if (running.value) return
  reset()
  editor.exportOpen = false
}

onBeforeUnmount(() => {
  handle?.cancel()
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
})

const phaseLabel = computed(() => {
  switch (progress.value?.phase) {
    case 'audio':
      return 'Mixing audio…'
    case 'video':
      return `Rendering frame ${progress.value.framesDone} of ${progress.value.framesTotal}`
    case 'finalizing':
      return 'Writing file…'
    default:
      return 'Preparing…'
  }
})
</script>

<template>
  <UiDialog :open="editor.exportOpen" title="Export video" width="max-w-xl" :dismissible="!running" @close="close">
    <!-- unsupported -->
    <div v-if="!support.supported" class="flex gap-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
      <TriangleAlert class="size-5 shrink-0 text-danger" />
      <p>{{ support.reason }}</p>
    </div>

    <!-- result -->
    <div v-else-if="result && resultUrl" class="space-y-4">
      <video :src="resultUrl" controls playsinline class="max-h-[46vh] w-full rounded-xl bg-black" />
      <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
        <div class="flex justify-between"><dt>File</dt><dd class="truncate text-fg/80">{{ fileName }}</dd></div>
        <div class="flex justify-between"><dt>Size</dt><dd class="text-fg/80">{{ (result.buffer.byteLength / 1024 / 1024).toFixed(1) }} MB</dd></div>
        <div class="flex justify-between"><dt>Video</dt><dd class="text-fg/80 uppercase">{{ result.videoCodec }}</dd></div>
        <div class="flex justify-between"><dt>Audio</dt><dd class="text-fg/80 uppercase">{{ result.audioCodec ?? 'none' }}</dd></div>
      </dl>
    </div>

    <!-- progress -->
    <div v-else-if="running" class="space-y-4 py-4">
      <div class="h-2 overflow-hidden rounded-full bg-panel-3">
        <div class="h-full rounded-full bg-accent transition-[width] duration-150" :style="{ width: `${Math.round((progress?.progress ?? 0) * 100)}%` }" />
      </div>
      <div class="flex items-center justify-between text-sm">
        <p>{{ phaseLabel }}</p>
        <p class="font-mono tabular-nums">{{ Math.round((progress?.progress ?? 0) * 100) }}%</p>
      </div>
      <p v-if="eta" class="text-xs text-muted">About {{ formatDuration(eta) }} remaining</p>
      <p class="text-xs text-muted">You can keep the app open - rendering runs in a background worker.</p>
    </div>

    <!-- settings -->
    <div v-else class="space-y-5">
      <div v-if="error" class="flex gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
        <TriangleAlert class="size-5 shrink-0 text-danger" />
        <p>{{ error }}</p>
      </div>

      <div>
        <span class="label">Format</span>
        <div class="flex gap-2">
          <button
            v-for="c in ['mp4', 'webm']"
            :key="c"
            type="button"
            class="h-10 flex-1 rounded-lg border text-sm font-semibold uppercase coarse:h-12"
            :class="container === c ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
            @click="container = c"
          >
            {{ c }}
          </button>
        </div>
        <p class="mt-1 text-[11px] text-muted">
          MP4 uses H.264 + AAC when the browser provides those encoders, otherwise Clip falls back to the best available codec.
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="label">Resolution</span>
          <select v-model.number="resolutionScale" class="field">
            <option v-for="r in resolutions" :key="r.label" :value="r.scale">{{ r.label }}</option>
          </select>
        </label>
        <label class="block">
          <span class="label">Frame rate</span>
          <select v-model.number="fps" class="field">
            <option v-for="r in [24, 25, 30, 50, 60]" :key="r" :value="r">{{ r }} fps</option>
          </select>
        </label>
      </div>

      <div>
        <span class="label">Quality</span>
        <div class="flex gap-1.5">
          <button
            v-for="p in QUALITY_PRESETS"
            :key="p.id"
            type="button"
            class="h-9 flex-1 rounded-lg border text-xs font-medium coarse:h-11"
            :class="quality === p.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
            @click="quality = p.id"
          >
            {{ p.label }}
          </button>
        </div>
        <div v-if="quality === 'custom'" class="mt-2">
          <UiNumberField v-model="customMbps" label="Video bitrate" :min="0.5" :max="120" :step="0.5" :precision="1" suffix="Mb/s" />
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="label">Audio bitrate</span>
          <select v-model.number="audioKbps" class="field" :disabled="!includeAudio || !hasAudio">
            <option v-for="r in [96, 128, 192, 256]" :key="r" :value="r">{{ r }} kb/s</option>
          </select>
        </label>
        <div class="flex items-end pb-1">
          <UiSwitch v-model="includeAudio" label="Include audio" :disabled="!hasAudio" class="w-full" />
        </div>
      </div>

      <dl class="flex justify-between rounded-xl bg-panel-2 px-3 py-2 text-xs text-muted">
        <div><dt class="inline">Output: </dt><dd class="inline text-fg/80">{{ output.width }}×{{ output.height }} · {{ fps }} fps</dd></div>
        <div><dt class="inline">Length: </dt><dd class="inline text-fg/80">{{ formatDuration(projectStore.duration) }}</dd></div>
        <div><dt class="inline">~</dt><dd class="inline text-fg/80">{{ estimatedSize.toFixed(1) }} MB</dd></div>
      </dl>
    </div>

    <template #footer>
      <template v-if="running">
        <UiButton variant="danger" @click="cancel">Cancel export</UiButton>
      </template>
      <template v-else-if="result">
        <UiButton variant="ghost" :icon="RotateCcw" @click="reset">Export again</UiButton>
        <UiButton v-if="canShareFiles()" :icon="Share2" :loading="saving" @click="share">Share</UiButton>
        <UiButton variant="primary" :icon="Download" :loading="saving" @click="download">
          {{ isNativeApp() ? 'Save to device' : 'Download' }}
        </UiButton>
      </template>
      <template v-else>
        <UiButton variant="ghost" @click="close">Cancel</UiButton>
        <UiButton variant="primary" :disabled="!support.supported || projectStore.duration <= 0" @click="run">Start export</UiButton>
      </template>
    </template>
  </UiDialog>
</template>
