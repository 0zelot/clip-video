<script setup>
import { collectVisualLayers, renderFrame } from '~/core/render/compositor'
import { isTextual } from '~/core/model/types'
import { mediaLibrary } from '~/services/media/mediaLibrary'
import { createPreviewFrameProvider } from '~/services/playback/previewFrameProvider'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const editor = useEditorStore()

const wrapper = ref(null)
const canvas = ref(null)
const box = ref({ width: 0, height: 0 })

const aspect = computed(() => {
  const s = projectStore.project?.settings
  return s ? s.width / s.height : 9 / 16
})

/** Size of the preview surface in CSS pixels, fitted into the available area. */
const surface = computed(() => {
  const { width, height } = box.value
  if (!width || !height) return { width: 0, height: 0 }
  const w = Math.min(width, height * aspect.value)
  return { width: Math.floor(w), height: Math.floor(w / aspect.value) }
})

let ctx = null
let rafId = 0
let lastGoodDraw = 0
let retryId = 0

function ensureCanvasSize() {
  const c = canvas.value
  const settings = projectStore.project?.settings
  if (!c || !settings || surface.value.width === 0) return false
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  // Never render more pixels than the project resolution.
  const targetWidth = Math.max(2, Math.min(settings.width, Math.round(surface.value.width * dpr)))
  const targetHeight = Math.max(2, Math.round((targetWidth * settings.height) / settings.width))
  if (c.width !== targetWidth || c.height !== targetHeight) {
    c.width = targetWidth
    c.height = targetHeight
    ctx = null
  }
  if (!ctx) ctx = c.getContext('2d', { alpha: false })
  return !!ctx
}

function draw() {
  rafId = 0
  const project = projectStore.project
  const engine = editor.engine
  if (!project || !engine || !ensureCanvasSize() || !ctx || !canvas.value) return
  const provider = createPreviewFrameProvider(engine.media)
  const time = engine.time

  // Avoid flashing an incomplete frame: keep the previous one while media seeks.
  const pending = collectVisualLayers(project, time)
    .filter((l) => !isTextual(l.item))
    .some((l) => provider.getFrame(l.item, l.sourceTime) === null)
  if (pending && performance.now() - lastGoodDraw < 400) {
    if (!retryId) {
      retryId = window.setTimeout(() => {
        retryId = 0
        requestRender()
      }, 40)
    }
    return
  }

  renderFrame(ctx, project, time, provider, { scale: canvas.value.width / project.settings.width, showMissing: true })
  if (!pending) lastGoodDraw = performance.now()
}

function requestRender() {
  if (!rafId) rafId = requestAnimationFrame(draw)
}

let unsubscribeTime = null
let unsubscribeMedia = null
let observer = null

watch(
  () => editor.engine,
  (engine) => {
    unsubscribeTime?.()
    unsubscribeTime = engine ? engine.onTime(() => requestRender()) : null
  },
  { immediate: true },
)
watch(() => projectStore.project, requestRender)
watch(surface, requestRender)

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const rect = entry.contentRect
    box.value = { width: rect.width, height: rect.height }
  })
  if (wrapper.value) observer.observe(wrapper.value)
  unsubscribeMedia = mediaLibrary.onChange(() => requestRender())
  requestRender()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  unsubscribeTime?.()
  unsubscribeMedia?.()
  if (rafId) cancelAnimationFrame(rafId)
  if (retryId) clearTimeout(retryId)
})
</script>

<template>
  <div class="flex min-h-0 flex-col bg-bg">
    <div ref="wrapper" class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-4">
      <canvas
        ref="canvas"
        data-preview-canvas
        class="checker rounded-lg shadow-[0_8px_40px_rgba(0,0,0,.45)]"
        :style="{ width: `${surface.width}px`, height: `${surface.height}px` }"
      />
      <CanvasOverlay :surface="surface" class="pointer-events-none" :style="{ left: `calc(50% - ${surface.width / 2}px)`, top: `calc(50% - ${surface.height / 2}px)`, width: `${surface.width}px`, height: `${surface.height}px` }" />
      <div
        v-if="projectStore.duration === 0"
        class="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted"
      >
        <p>Import media and add it to the timeline<br />to see your video here.</p>
      </div>
    </div>
    <CanvasTransport />
  </div>
</template>
