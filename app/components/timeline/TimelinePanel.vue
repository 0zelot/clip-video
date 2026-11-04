<script setup>
import { Music, Plus, Video } from 'lucide-vue-next'
import { collectSnapPoints, snapEdges } from '~/core/operations/snap'
import { MAX_ZOOM, MIN_ZOOM, useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'
import { TIMELINE_CONTEXT } from '~/composables/useTimelineContext'

const projectStore = useProjectStore()
const editor = useEditorStore()
const media = useMediaStore()
const commands = useEditorCommands()

const TRAILING_SECONDS = 4

const scroller = ref(null)
const content = ref(null)
const playhead = ref(null)
const headers = ref(null)
const snapIndicator = ref(null)

const coarse = useMediaQuery('(pointer: coarse)')
const narrow = useMediaQuery('(max-width: 639px)')
const viewport = shallowRef({ scrollLeft: 0, width: 0 })
const RULER_HEIGHT = computed(() => (coarse.value ? 34 : 28))
/** Width of the scroller, used for the side padding of the centred-playhead mode. */
const scrollerWidth = ref(0)
const centerMode = computed(() => editor.centerPlayhead)
const sidePad = computed(() => (centerMode.value ? Math.round(scrollerWidth.value / 2) : 0))

const tracks = computed(() => projectStore.project?.tracks ?? [])
const trackHeight = (kind) => (kind === 'audio' ? (coarse.value ? 60 : 52) : coarse.value ? 76 : 66)

/** @type {import('vue').ComputedRef<import('~/composables/useTimelineContext').TrackGeometry[]>} */
const trackGeometry = computed(() => {
  let top = 0
  return tracks.value.map((track, index) => {
    const height = trackHeight(track.kind)
    const geo = { track, index, top, height }
    top += height + 4
    return geo
  })
})

const tracksHeight = computed(() => trackGeometry.value.reduce((sum, g) => sum + g.height + 4, 0))
const contentWidth = computed(() => Math.max(600, (projectStore.duration + TRAILING_SECONDS) * editor.zoom + 160))

function timeAt(clientX) {
  const el = content.value
  if (!el) return 0
  return Math.max(0, (clientX - el.getBoundingClientRect().left) / editor.zoom)
}

function trackAt(clientY) {
  const el = content.value
  if (!el) return null
  const y = clientY - el.getBoundingClientRect().top - RULER_HEIGHT.value
  return trackGeometry.value.find((g) => y >= g.top - 2 && y <= g.top + g.height + 2) ?? null
}

function snap(edges, exclude) {
  if (!editor.snapping || !projectStore.project) return { delta: 0, point: null }
  const extra = [editor.currentTime()]
  if (editor.markIn !== null) extra.push(editor.markIn)
  if (editor.markOut !== null) extra.push(editor.markOut)
  const points = collectSnapPoints(projectStore.project, exclude, extra)
  return snapEdges(edges, points, 8 / editor.zoom)
}

let autoScrollRaf = 0
let autoScrollSpeed = 0
function autoScroll(clientX) {
  const el = scroller.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const margin = 48
  autoScrollSpeed =
    clientX < rect.left + margin
      ? -(rect.left + margin - clientX) / 6
      : clientX > rect.right - margin
        ? (clientX - rect.right + margin) / 6
        : 0
  if (autoScrollSpeed !== 0 && !autoScrollRaf) {
    const step = () => {
      if (autoScrollSpeed === 0 || !scroller.value) {
        autoScrollRaf = 0
        return
      }
      scroller.value.scrollLeft += autoScrollSpeed
      autoScrollRaf = requestAnimationFrame(step)
    }
    autoScrollRaf = requestAnimationFrame(step)
  }
}

provide(TIMELINE_CONTEXT, {
  pxPerSecond: computed(() => editor.zoom),
  viewport,
  trackGeometry,
  timeAt,
  trackAt,
  snap,
  setSnapIndicator: (time) => (snapIndicator.value = time),
  autoScroll,
  trackKindOf: (id) => tracks.value.find((t) => t.id === id)?.kind ?? null,
})

// ----- playhead (updated outside of Vue reactivity) --------------------------

/** What the current pointer gesture on the timeline is about ('item' drags must not scrub). */
let gesture = null
let followRaf = 0
usePlaybackTime((time) => {
  const el = playhead.value
  if (el) el.style.transform = `translateX(${time * editor.zoom}px)`
  if (centerMode.value) {
    // The timeline moves under the fixed playhead.
    if (gesture !== 'item' && scroller.value && Math.abs(scroller.value.scrollLeft - time * editor.zoom) >= 1) {
      scroller.value.scrollLeft = time * editor.zoom
    }
    return
  }
  if (editor.playing && !followRaf) {
    followRaf = requestAnimationFrame(() => {
      followRaf = 0
      followPlayhead(time)
    })
  }
})

function followPlayhead(time) {
  const el = scroller.value
  if (!el) return
  const x = time * editor.zoom
  const left = el.scrollLeft
  const right = left + el.clientWidth
  if (x < left + 40 || x > right - 80) el.scrollLeft = Math.max(0, x - el.clientWidth * 0.3)
}

watch(
  () => editor.zoom,
  () => {
    const el = playhead.value
    if (el && editor.engine) el.style.transform = `translateX(${editor.engine.time * editor.zoom}px)`
  },
)

watch(centerMode, () =>
  nextTick(() => {
    if (centerMode.value && scroller.value) scroller.value.scrollLeft = editor.currentTime() * editor.zoom
    onScroll()
  }),
)

function onPointerDownCapture(e) {
  const itemEl = e.target instanceof Element ? e.target.closest('[data-item-id]') : null
  // On touch, unselected clips let the timeline scroll (see TimelineItem), so that still scrubs.
  gesture = itemEl && (e.pointerType !== 'touch' || itemEl.getAttribute('aria-pressed') === 'true') ? 'item' : 'scroll'
  // Touching the timeline stops playback, like in mobile editors.
  if (centerMode.value && gesture === 'scroll' && editor.playing && e.pointerType === 'touch') editor.engine?.pause()
}
function onPointerUpCapture() {
  const wasItem = gesture === 'item'
  gesture = null
  if (wasItem && centerMode.value && scroller.value) scroller.value.scrollLeft = editor.currentTime() * editor.zoom
}

// ----- scrolling -------------------------------------------------------------

let scrollRaf = 0
function onScroll() {
  const el = scroller.value
  if (!el) return
  if (headers.value) headers.value.style.transform = `translateY(${-el.scrollTop}px)`
  // Centred playhead: scrolling the timeline scrubs the video.
  if (centerMode.value && gesture !== 'item' && !editor.playing && editor.engine) {
    const t = el.scrollLeft / editor.zoom
    if (Math.abs(t - editor.engine.time) * editor.zoom >= 1) editor.engine.seek(t)
  }
  if (!scrollRaf) {
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0
      viewport.value = { scrollLeft: el.scrollLeft, width: el.clientWidth }
    })
  }
}

function zoomAt(factor, clientX) {
  const el = scroller.value
  const previous = editor.zoom
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, previous * factor))
  if (!el || next === previous) {
    editor.setZoom(next)
    return
  }
  if (centerMode.value) {
    // Zoom around the playhead, which stays in the middle.
    editor.setZoom(next)
    nextTick(() => {
      el.scrollLeft = editor.currentTime() * next
      onScroll()
    })
    return
  }
  const anchorX = clientX !== undefined ? clientX - el.getBoundingClientRect().left : el.clientWidth / 2
  const time = (el.scrollLeft + anchorX) / previous
  editor.setZoom(next)
  nextTick(() => {
    el.scrollLeft = Math.max(0, time * next - anchorX)
    onScroll()
  })
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX)
  } else if (e.shiftKey && scroller.value) {
    e.preventDefault()
    scroller.value.scrollLeft += e.deltaY
  }
}

// Pinch to zoom (touch). Pointer events are unreliable once panning starts.
let pinchDistance = 0
let pinchCenter = 0
function onTouchStart(e) {
  if (e.touches.length !== 2) return
  const [a, b] = [e.touches[0], e.touches[1]]
  pinchDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  pinchCenter = (a.clientX + b.clientX) / 2
}
function onTouchMove(e) {
  if (e.touches.length !== 2 || !pinchDistance) return
  e.preventDefault()
  const [a, b] = [e.touches[0], e.touches[1]]
  const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  const factor = distance / pinchDistance
  if (Math.abs(factor - 1) < 0.02) return
  pinchDistance = distance
  zoomAt(factor, pinchCenter)
}
function onTouchEnd(e) {
  if (e.touches.length < 2) pinchDistance = 0
}

// ----- scrubbing & selection -------------------------------------------------

function scrub(e) {
  const target = e.currentTarget
  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // pointer capture is optional (synthetic events, some touch stacks)
  }
  editor.engine?.pause()
  editor.engine?.seek(timeAt(e.clientX))
  const move = (ev) => {
    editor.engine?.seek(timeAt(ev.clientX))
    autoScroll(ev.clientX)
  }
  const up = () => {
    autoScrollSpeed = 0
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', up)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
}

function onBackgroundClick(e) {
  if (e.target !== e.currentTarget) return
  editor.select([])
  editor.engine?.seek(timeAt(e.clientX))
}

// ----- drop targets ----------------------------------------------------------

const dropHint = ref(null)

function onDragOver(e) {
  const types = Array.from(e.dataTransfer?.types ?? [])
  if (!types.includes('Files') && !types.includes('application/x-clip-asset')) return
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  const geo = trackAt(e.clientY)
  dropHint.value = geo ? { trackId: geo.track.id, time: timeAt(e.clientX) } : null
}

async function onDrop(e) {
  const assetId = e.dataTransfer?.getData('application/x-clip-asset')
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (!assetId && files.length === 0) return
  e.preventDefault()
  e.stopPropagation()
  const geo = trackAt(e.clientY)
  const hint = { trackId: geo?.track.id, time: geo ? timeAt(e.clientX) : undefined, playhead: editor.currentTime() }
  dropHint.value = null
  if (assetId) {
    const asset = projectStore.project?.assets[assetId]
    if (asset) {
      const id = projectStore.addAssetToTimeline(asset, hint)
      if (id) editor.select([id])
    }
  } else {
    await media.importFiles(files, { addToTimeline: true, hint })
  }
}

// ----- context menu ----------------------------------------------------------

const itemMenu = ref({ open: false, x: 0, y: 0, itemId: null })

function openItemMenu(payload) {
  if (!editor.selection.includes(payload.itemId)) editor.select([payload.itemId])
  itemMenu.value = { open: true, x: payload.x, y: payload.y, itemId: payload.itemId }
}

const zoomFitDisabled = computed(() => projectStore.duration <= 0)
function zoomToFit() {
  const el = scroller.value
  if (!el || projectStore.duration <= 0) return
  editor.setZoom((el.clientWidth - 40) / projectStore.duration)
  nextTick(() => {
    el.scrollLeft = centerMode.value ? editor.currentTime() * editor.zoom : 0
    onScroll()
  })
}

onMounted(() => {
  onScroll()
  const el = scroller.value
  el?.addEventListener('wheel', onWheel, { passive: false })
  el?.addEventListener('touchstart', onTouchStart, { passive: true })
  el?.addEventListener('touchmove', onTouchMove, { passive: false })
  el?.addEventListener('touchend', onTouchEnd, { passive: true })
  const ro = new ResizeObserver(() => {
    scrollerWidth.value = el?.clientWidth ?? 0
    onScroll()
  })
  if (el) ro.observe(el)
  onBeforeUnmount(() => {
    ro.disconnect()
    el?.removeEventListener('wheel', onWheel)
    el?.removeEventListener('touchstart', onTouchStart)
    el?.removeEventListener('touchmove', onTouchMove)
    el?.removeEventListener('touchend', onTouchEnd)
    if (autoScrollRaf) cancelAnimationFrame(autoScrollRaf)
  })
})

const headerWidth = computed(() => (narrow.value ? 84 : coarse.value ? 120 : 136))
const markRange = computed(() => {
  const { markIn, markOut } = editor
  if (markIn === null || markOut === null) return null
  return { left: markIn * editor.zoom, width: (markOut - markIn) * editor.zoom }
})

function addTrack(kind) {
  commands.addTrack(kind)
  // New visual tracks appear at the top, audio tracks at the bottom: show them.
  nextTick(() => {
    const el = scroller.value
    if (el) el.scrollTop = kind === 'visual' ? 0 : el.scrollHeight
    onScroll()
  })
}
</script>

<template>
  <section class="flex min-h-0 flex-col border-t border-line bg-panel" aria-label="Timeline">
    <TimelineToolbar :zoom-fit-disabled="zoomFitDisabled" @zoom="zoomAt($event)" @zoom-fit="zoomToFit" />

    <div class="flex min-h-0 flex-1">
      <!-- track headers -->
      <div class="relative shrink-0 overflow-hidden border-r border-line bg-panel" :style="{ width: `${headerWidth}px` }">
        <!-- add-track buttons live in the sticky corner, so they never scroll away -->
        <div class="relative z-10 flex items-center gap-1 border-b border-line bg-panel px-1" :style="{ height: `${RULER_HEIGHT}px` }">
          <button
            v-tooltip="'Add video / overlay track'"
            type="button"
            class="flex h-[calc(100%-6px)] flex-1 items-center justify-center gap-0.5 rounded-md bg-accent/15 text-[11px] font-semibold text-accent hover:bg-accent/25"
            aria-label="Add video track"
            @click="addTrack('visual')"
          >
            <Plus class="size-3.5" /><Video class="size-3.5" />
          </button>
          <button
            v-tooltip="'Add audio track'"
            type="button"
            class="flex h-[calc(100%-6px)] flex-1 items-center justify-center gap-0.5 rounded-md bg-clip-audio/20 text-[11px] font-semibold text-clip-audio hover:bg-clip-audio/30"
            aria-label="Add audio track"
            @click="addTrack('audio')"
          >
            <Plus class="size-3.5" /><Music class="size-3.5" />
          </button>
        </div>
        <div ref="headers" class="will-change-transform">
          <TimelineTrackHeader
            v-for="geo in trackGeometry"
            :key="geo.track.id"
            :track="geo.track"
            :height="geo.height"
            :can-move-up="geo.index > 0"
            :can-move-down="geo.index < tracks.length - 1"
            :compact="narrow"
          />
        </div>
      </div>

      <!-- scrollable timeline -->
      <div
        ref="scroller"
        class="relative min-w-0 flex-1 overflow-auto overscroll-x-contain"
        @scroll="onScroll"
        @pointerdown.capture="onPointerDownCapture"
        @pointerup.capture="onPointerUpCapture"
        @pointercancel.capture="onPointerUpCapture"
        @dragover="onDragOver"
        @dragleave="dropHint = null"
        @drop="onDrop"
      >
        <div :style="{ paddingLeft: `${sidePad}px`, paddingRight: `${sidePad}px`, width: `${contentWidth + sidePad * 2}px` }">
        <div ref="content" class="relative" :style="{ width: `${contentWidth}px`, height: `${tracksHeight + RULER_HEIGHT + 16}px` }">
          <TimelineRuler
            class="sticky top-0 z-20 touch-none"
            :style="{ height: `${RULER_HEIGHT}px`, width: `${contentWidth}px` }"
            @pointerdown="scrub"
          />

          <div
            v-if="markRange"
            class="pointer-events-none absolute z-0 bg-accent/10"
            :style="{ left: `${markRange.left}px`, width: `${markRange.width}px`, top: `${RULER_HEIGHT}px`, bottom: '0' }"
          />

          <div class="relative" :style="{ height: `${tracksHeight}px` }" @click="onBackgroundClick">
            <TimelineTrackRow
              v-for="geo in trackGeometry"
              :key="geo.track.id"
              :track="geo.track"
              :top="geo.top"
              :height="geo.height"
              :drop-hint="dropHint?.trackId === geo.track.id ? dropHint.time : null"
              @menu="openItemMenu"
            />
          </div>

          <div
            v-if="snapIndicator !== null"
            class="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-warn"
            :style="{ left: `${snapIndicator * editor.zoom}px` }"
          />

          <!-- playhead -->
          <div ref="playhead" class="pointer-events-none absolute top-0 bottom-0 left-0 z-40 w-0 will-change-transform">
            <div class="absolute top-0 bottom-0 -left-px w-0.5 bg-accent" />
            <div class="absolute -top-0 -left-[7px] size-3.5 rounded-b-sm bg-accent" style="clip-path: polygon(0 0, 100% 0, 50% 100%)" />
          </div>
        </div>
        </div>
      </div>
    </div>

    <TimelineItemMenu :open="itemMenu.open" :x="itemMenu.x" :y="itemMenu.y" :item-id="itemMenu.itemId" @close="itemMenu.open = false" />
  </section>
</template>
