<script setup>
import { Maximize2, Minus, Plus, RotateCcw, RotateCw } from 'lucide-vue-next'
import { collectVisualLayers, renderFrame } from '~/core/render/compositor'
import { hitTest } from '~/core/render/bounds'
import { previewInteraction } from '~/composables/usePreviewInteraction'
import { isTextual } from '~/core/model/types'
import { formatTimecode } from '~/core/time'
import { mediaLibrary } from '~/services/media/mediaLibrary'
import { createPreviewFrameProvider } from '~/services/playback/previewFrameProvider'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const editor = useEditorStore()
const commands = useEditorCommands()

const wrapper = ref(null)
const canvas = ref(null)
const box = ref({ width: 0, height: 0 })

const MIN_VIEW_ZOOM = 0.25
const MAX_VIEW_ZOOM = 8

/** Preview magnification (1 = fit) and pan offset in CSS pixels. Not saved. */
const viewZoom = ref(1)
const pan = ref({ x: 0, y: 0 })

const aspect = computed(() => {
  const s = projectStore.project?.settings
  return s ? s.width / s.height : 9 / 16
})

/** Size of the preview surface in CSS pixels: fitted into the available area, then zoomed. */
const fitted = computed(() => {
  const pad = box.value.width >= 640 ? 32 : 16
  const width = box.value.width - pad
  const height = box.value.height - pad
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const w = Math.min(width, height * aspect.value)
  return { width: w, height: w / aspect.value }
})
const surface = computed(() => ({
  width: Math.floor(fitted.value.width * viewZoom.value),
  height: Math.floor(fitted.value.height * viewZoom.value),
}))
const surfacePosition = computed(() => ({
  left: `${(box.value.width - surface.value.width) / 2 + pan.value.x}px`,
  top: `${(box.value.height - surface.value.height) / 2 + pan.value.y}px`,
  width: `${surface.value.width}px`,
  height: `${surface.value.height}px`,
}))

function clampPan(p) {
  const maxX = Math.max(0, (surface.value.width - box.value.width) / 2 + 48)
  const maxY = Math.max(0, (surface.value.height - box.value.height) / 2 + 48)
  return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) }
}

/** Zooms around a point given in wrapper-relative CSS pixels (defaults to the centre). */
function setViewZoom(next, anchor) {
  const previous = viewZoom.value
  const z = Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, next))
  if (Math.abs(z - previous) < 1e-4) return
  const ax = (anchor?.x ?? box.value.width / 2) - box.value.width / 2
  const ay = (anchor?.y ?? box.value.height / 2) - box.value.height / 2
  const ratio = z / previous
  viewZoom.value = z
  pan.value = clampPan({ x: ax - (ax - pan.value.x) * ratio, y: ay - (ay - pan.value.y) * ratio })
  if (Math.abs(z - 1) < 0.02) resetView()
}

function resetView() {
  viewZoom.value = 1
  pan.value = { x: 0, y: 0 }
}

const zoomLabel = computed(() => `${Math.round(viewZoom.value * 100)}%`)
defineExpose({ setViewZoom, resetView })

// ----- rendering -------------------------------------------------------------

let ctx = null
let rafId = 0
let lastGoodDraw = 0
let retryId = 0
let retries = 0

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

function scheduleRetry(delay) {
  if (retryId) return
  retryId = window.setTimeout(() => {
    retryId = 0
    requestRender()
  }, delay)
}

function draw() {
  rafId = 0
  const project = projectStore.project
  const engine = editor.engine
  if (!project || !engine || !ensureCanvasSize() || !ctx || !canvas.value) return
  const provider = createPreviewFrameProvider(engine.media, { playing: engine.playing })
  const time = engine.time

  // Avoid flashing an incomplete frame: keep the previous one while media
  // loads (clips without any snapshot yet, e.g. right after import).
  const pending = collectVisualLayers(project, time)
    .flatMap((l) => (l.transition ? [l, l.transition.previous] : [l]))
    .filter((l) => !isTextual(l.item) && l.item.type !== 'blur')
    .some((l) => provider.getFrame(l.item, l.sourceTime) === null)
  if (pending && performance.now() - lastGoodDraw < (engine.playing ? 1500 : 600)) {
    scheduleRetry(40)
    return
  }

  renderFrame(ctx, project, time, provider, { scale: canvas.value.width / project.settings.width, showMissing: true })
  if (!pending) lastGoodDraw = performance.now()
  // A snapshot stood in for a seeking video: redraw shortly with the real frame.
  if ((pending || provider.usedSnapshot) && !engine.playing) {
    if (retries++ < 40) scheduleRetry(60)
  } else {
    retries = 0
  }
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
    unsubscribeTime = engine
      ? engine.onTime(() => {
          retries = 0
          requestRender()
        })
      : null
  },
  { immediate: true },
)
watch(() => projectStore.project, requestRender)
watch(surface, requestRender)
watch(aspect, resetView)

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    const rect = entry.contentRect
    box.value = { width: rect.width, height: rect.height }
    pan.value = clampPan(pan.value)
  })
  if (wrapper.value) observer.observe(wrapper.value)
  unsubscribeMedia = mediaLibrary.onChange(() => requestRender())
  wrapper.value?.addEventListener('wheel', onWheel, { passive: false })
  requestRender()
})

onBeforeUnmount(() => {
  observer?.disconnect()
  unsubscribeTime?.()
  unsubscribeMedia?.()
  wrapper.value?.removeEventListener('wheel', onWheel)
  if (rafId) cancelAnimationFrame(rafId)
  if (retryId) clearTimeout(retryId)
  if (tapTimer) clearTimeout(tapTimer)
})

// ----- gestures ----------------------------------------------------------------
//  • pinch / Ctrl+wheel: zoom the preview      • drag when zoomed: pan
//  • horizontal drag at 100%: scrub the video  • tap: play / pause
//  • double tap on the left / right edge: jump 5 s back / forward

function localPoint(e) {
  const rect = wrapper.value?.getBoundingClientRect()
  return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    setViewZoom(viewZoom.value * (e.deltaY < 0 ? 1.12 : 0.89), localPoint(e))
  } else if (viewZoom.value > 1) {
    e.preventDefault()
    pan.value = clampPan({ x: pan.value.x - e.deltaX, y: pan.value.y - e.deltaY })
  }
}

/** @type {Map<number, { x: number, y: number }>} */
const pointers = new Map()
let gesture = null
const scrubLabel = ref(null)
const skipHint = ref(null)
let tapTimer = 0
let lastTap = { at: 0, x: 0 }

function onPointerDown(e) {
  if (e.button !== undefined && e.button > 0) return
  // Moving / scaling the selected clip is handled by the overlay.
  if (e.target instanceof Element && e.target.closest('[data-preview-handle]')) return
  if (previewInteraction.itemPointers > 0) return
  pointers.set(e.pointerId, localPoint(e))
  try {
    wrapper.value?.setPointerCapture(e.pointerId)
  } catch {
    // optional
  }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    gesture = {
      kind: 'pinch',
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      zoom: viewZoom.value,
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      pan: { ...pan.value },
    }
    scrubLabel.value = null
  } else if (pointers.size === 1) {
    gesture = {
      kind: 'pending',
      start: localPoint(e),
      pan: { ...pan.value },
      time: editor.currentTime(),
      wasPlaying: editor.playing,
      at: performance.now(),
    }
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId) || !gesture) return
  const point = localPoint(e)
  pointers.set(e.pointerId, point)

  if (gesture.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    const distance = Math.hypot(a.x - b.x, a.y - b.y)
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const z = Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, gesture.zoom * (distance / gesture.distance)))
    const ax = gesture.center.x - box.value.width / 2
    const ay = gesture.center.y - box.value.height / 2
    const ratio = z / gesture.zoom
    viewZoom.value = z
    pan.value = clampPan({
      x: ax - (ax - gesture.pan.x) * ratio + (center.x - gesture.center.x),
      y: ay - (ay - gesture.pan.y) * ratio + (center.y - gesture.center.y),
    })
    return
  }

  const dx = point.x - gesture.start.x
  const dy = point.y - gesture.start.y
  if (gesture.kind === 'pending') {
    if (Math.hypot(dx, dy) < 8) return
    if (viewZoom.value > 1.01) gesture.kind = 'pan'
    else if (Math.abs(dx) > Math.abs(dy) && projectStore.duration > 0) {
      gesture.kind = 'scrub'
      editor.engine?.pause()
    } else {
      gesture.kind = 'none'
    }
  }
  if (gesture.kind === 'pan') {
    pan.value = clampPan({ x: gesture.pan.x + dx, y: gesture.pan.y + dy })
  } else if (gesture.kind === 'scrub') {
    // One full preview width ≈ 10 seconds (or the whole video if shorter).
    const span = Math.min(10, Math.max(1, projectStore.duration))
    const t = Math.min(projectStore.duration, Math.max(0, gesture.time + (dx / Math.max(160, fitted.value.width)) * span))
    commands.seek(t)
    scrubLabel.value = formatTimecode(t, projectStore.project?.settings.fps ?? 30)
  }
}

function onPointerUp(e) {
  if (!pointers.has(e.pointerId)) return
  pointers.delete(e.pointerId)
  const g = gesture
  if (pointers.size > 0) {
    // Pinch ended with one finger left: continue as a pan from here.
    const [rest] = [...pointers.values()]
    gesture = { kind: viewZoom.value > 1.01 ? 'pan' : 'none', start: rest, pan: { ...pan.value }, time: editor.currentTime() }
    return
  }
  gesture = null
  scrubLabel.value = null
  if (!g || g.kind !== 'pending' || e.type === 'pointercancel') return
  if (performance.now() - g.at > 450) return
  handleTap(g.start)
}

let hitCtx = null
/** Tapping a clip on the preview selects it (like in mobile editors). */
function selectAt(point) {
  const project = projectStore.project
  if (!project || surface.value.width === 0) return false
  const left = (box.value.width - surface.value.width) / 2 + pan.value.x
  const top = (box.value.height - surface.value.height) / 2 + pan.value.y
  const scale = project.settings.width / surface.value.width
  const x = (point.x - left) * scale
  const y = (point.y - top) * scale
  if (!hitCtx) hitCtx = document.createElement('canvas').getContext('2d')
  const hit = hitTest(project, editor.currentTime(), x, y, hitCtx)
  if (!hit) return false
  if (editor.selection.length === 1 && editor.selection[0] === hit.id) return false
  editor.select([hit.id])
  return true
}

function handleTap(point) {
  if (!editor.playing && selectAt(point)) return
  const width = box.value.width || 1
  const side = point.x < width * 0.3 ? -1 : point.x > width * 0.7 ? 1 : 0
  const now = performance.now()
  const isDouble = now - lastTap.at < 300 && Math.abs(point.x - lastTap.x) < 60
  lastTap = { at: now, x: point.x }
  if (isDouble && side !== 0) {
    if (tapTimer) clearTimeout(tapTimer)
    tapTimer = 0
    skip(side * 5)
    return
  }
  if (tapTimer) clearTimeout(tapTimer)
  // Wait briefly on the edges so a double tap does not also toggle playback.
  tapTimer = window.setTimeout(
    () => {
      tapTimer = 0
      if (projectStore.duration > 0) commands.togglePlay()
    },
    side === 0 ? 0 : 260,
  )
}

let skipTimer = 0
function skip(seconds) {
  commands.seekBy(seconds)
  skipHint.value = seconds
  if (skipTimer) clearTimeout(skipTimer)
  skipTimer = window.setTimeout(() => (skipHint.value = null), 600)
}
</script>

<template>
  <div class="flex min-h-0 flex-col bg-bg">
    <div
      ref="wrapper"
      class="relative min-h-0 flex-1 touch-none overflow-hidden select-none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick.prevent
    >
      <canvas
        ref="canvas"
        data-preview-canvas
        class="checker absolute rounded-lg shadow-[0_8px_40px_rgba(0,0,0,.45)]"
        :style="surfacePosition"
      />
      <CanvasOverlay :surface="surface" class="pointer-events-none" :style="surfacePosition" />

      <div
        v-if="projectStore.duration === 0"
        class="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted"
      >
        <p>Import media and add it to the timeline<br />to see your video here.</p>
      </div>

      <!-- scrub / skip feedback -->
      <div
        v-if="scrubLabel"
        class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 font-mono text-sm text-white"
      >
        {{ scrubLabel }}
      </div>
      <Transition
        enter-active-class="transition duration-150"
        enter-from-class="opacity-0 scale-75"
        leave-active-class="transition duration-200"
        leave-to-class="opacity-0"
      >
        <div
          v-if="skipHint !== null"
          class="pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white"
          :class="skipHint < 0 ? 'left-6' : 'right-6'"
        >
          <component :is="skipHint < 0 ? RotateCcw : RotateCw" class="size-4" />
          {{ skipHint > 0 ? '+' : '' }}{{ skipHint }}s
        </div>
      </Transition>

      <!-- preview zoom -->
      <div
        v-if="projectStore.duration > 0 || viewZoom !== 1"
        class="absolute top-2 right-2 flex items-center gap-0.5 rounded-full border border-line bg-panel/80 p-0.5 shadow-lg backdrop-blur"
        @pointerdown.stop
      >
        <UiIconButton class="coarse:!size-8" :icon="Minus" label="Zoom preview out" size="sm" @click="setViewZoom(viewZoom / 1.25)" />
        <button
          v-tooltip="'Fit preview'"
          type="button"
          class="min-w-11 px-1 font-mono text-[11px] tabular-nums text-muted hover:text-fg"
          @click="resetView"
        >
          {{ zoomLabel }}
        </button>
        <UiIconButton class="coarse:!size-8" :icon="Plus" label="Zoom preview in" size="sm" @click="setViewZoom(viewZoom * 1.25)" />
        <UiIconButton v-if="viewZoom !== 1 || pan.x || pan.y" :icon="Maximize2" label="Fit preview" size="sm" @click="resetView" />
      </div>
    </div>
    <CanvasTransport />
  </div>
</template>
