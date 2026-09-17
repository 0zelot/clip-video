<script setup>
import { AudioLines, Captions, Image as ImageIcon, Lock, Shuffle, TriangleAlert, Type, Video } from 'lucide-vue-next'
import { getTrimBounds } from '~/core/operations/items'
import { formatDuration } from '~/core/time'
import { mediaLibrary } from '~/services/media/mediaLibrary'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'

const props = defineProps({
  /** @type {import('vue').PropType<import('~/core/model/types').Item>} */
  item: { type: Object, required: true },
  /** @type {import('vue').PropType<import('~/core/model/types').Track>} */
  track: { type: Object, required: true },
  height: { type: Number, required: true },
})
const emit = defineEmits(['menu'])

const projectStore = useProjectStore()
const editor = useEditorStore()
const media = useMediaStore()
const timeline = useTimeline()

/**
 * Live preview of the clip while it is dragged or trimmed. The store is only
 * updated once, on pointer up.
 * @typedef {{ mode: 'move' | 'trim-start' | 'trim-end', start: number, duration: number, offsetY: number, trackId: string }} DragState
 */
const drag = ref(null)

const selected = computed(() => editor.selection.includes(props.item.id))
const asset = computed(() => projectStore.project?.assets[props.item.assetId])
const missing = computed(() => !!props.item.assetId && media.status[props.item.assetId] === 'missing')
const imageUrl = computed(() => (props.item.type === 'image' ? mediaLibrary.getUrl(props.item.assetId) : undefined))

const view = computed(() => ({
  start: drag.value?.start ?? props.item.start,
  duration: drag.value?.duration ?? props.item.duration,
  offsetY: drag.value?.offsetY ?? 0,
}))

const style = computed(() => ({
  left: `${view.value.start * timeline.pxPerSecond.value}px`,
  width: `${Math.max(2, view.value.duration * timeline.pxPerSecond.value)}px`,
  transform: view.value.offsetY ? `translateY(${view.value.offsetY}px)` : undefined,
}))

const COLORS = {
  audio: 'bg-clip-audio/25 border-clip-audio/70',
  image: 'bg-clip-image/25 border-clip-image/70',
  text: 'bg-clip-text/25 border-clip-text/70',
  caption: 'bg-clip-caption/25 border-clip-caption/70',
  video: 'bg-clip-video/25 border-clip-video/70',
}
const ICONS = { audio: AudioLines, image: ImageIcon, text: Type, caption: Captions, video: Video }

const colorClass = computed(() => COLORS[props.item.type] ?? COLORS.video)
const icon = computed(() => ICONS[props.item.type] ?? Video)
const label = computed(() =>
  props.item.type === 'text' || props.item.type === 'caption' ? props.item.text || 'Text' : (props.item.name ?? asset.value?.name ?? 'Clip'),
)
const speedBadge = computed(() => (props.item.speed && Math.abs(props.item.speed - 1) > 0.001 ? `${props.item.speed}×` : null))

const showWaveform = computed(
  () => props.item.type === 'audio' || (props.item.type === 'video' && asset.value?.hasAudio && props.height >= 60),
)

// ----- pointer interaction ---------------------------------------------------

/** @param {'move' | 'trim-start' | 'trim-end'} mode */
function beginDrag(e, mode) {
  if (props.track.locked) return
  const project = projectStore.project
  if (!project) return

  const target = e.currentTarget
  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // pointer capture is optional (synthetic events, some touch stacks)
  }
  const grabTime = timeline.timeAt(e.clientX)
  const grabOffset = grabTime - props.item.start
  const originGeo = timeline.trackGeometry.value.find((g) => g.track.id === props.track.id)
  const originalStart = props.item.start
  const originalDuration = props.item.duration
  let moved = false
  let state = { mode, start: originalStart, duration: originalDuration, offsetY: 0, trackId: props.track.id }

  const move = (ev) => {
    const dx = Math.abs(ev.clientX - e.clientX)
    const dy = Math.abs(ev.clientY - e.clientY)
    if (!moved && dx < 4 && dy < 4) return
    moved = true
    timeline.autoScroll(ev.clientX)
    const pointerTime = timeline.timeAt(ev.clientX)

    if (mode === 'move') {
      let start = Math.max(0, pointerTime - grabOffset)
      const { delta, point } = timeline.snap([start, start + originalDuration], [props.item.id])
      start = Math.max(0, start + delta)
      timeline.setSnapIndicator(point)
      const geo = timeline.trackAt(ev.clientY)
      const compatible = geo && !geo.track.locked && (geo.track.kind === 'audio') === (props.item.type === 'audio')
      state = {
        mode,
        start,
        duration: originalDuration,
        trackId: compatible ? geo.track.id : props.track.id,
        offsetY: compatible && originGeo ? geo.top - originGeo.top : 0,
      }
    } else {
      const bounds = getTrimBounds(project, props.item.id, mode === 'trim-start' ? 'start' : 'end')
      if (!bounds) return
      let time = mode === 'trim-start' ? pointerTime - grabOffset : pointerTime - grabOffset + originalDuration
      const { delta, point } = timeline.snap([time], [props.item.id])
      time = Math.min(bounds.max, Math.max(bounds.min, time + delta))
      timeline.setSnapIndicator(point)
      state =
        mode === 'trim-start'
          ? { mode, start: time, duration: originalStart + originalDuration - time, offsetY: 0, trackId: props.track.id }
          : { mode, start: originalStart, duration: time - originalStart, offsetY: 0, trackId: props.track.id }
    }
    drag.value = state
  }

  const finish = (commit) => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', cancel)
    timeline.setSnapIndicator(null)
    timeline.autoScroll(Number.NaN)
    const result = drag.value
    drag.value = null
    if (!commit || !moved || !result) return
    if (mode === 'move') projectStore.moveItem(props.item.id, result.trackId, result.start)
    else if (mode === 'trim-start') projectStore.trimStart(props.item.id, result.start)
    else projectStore.trimEnd(props.item.id, result.start + result.duration)
  }

  const up = () => finish(true)
  const cancel = () => finish(false)
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', cancel)
}

function onPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return
  const wasSelected = selected.value
  if (e.shiftKey || e.ctrlKey || e.metaKey) editor.toggleSelect(props.item.id)
  else if (!wasSelected) editor.select([props.item.id])

  // On touch, an unselected clip lets the timeline scroll; tap to select first.
  if (e.pointerType === 'touch' && !wasSelected) return
  beginDrag(e, 'move')
}
</script>

<template>
  <div
    class="group absolute overflow-hidden rounded-md border select-none"
    :class="[
      colorClass,
      selected ? 'z-20 ring-2 ring-accent' : 'z-10',
      drag ? 'z-30 opacity-90 shadow-xl' : '',
      track.locked ? 'cursor-default' : selected ? 'cursor-grab touch-none' : 'cursor-pointer',
    ]"
    :style="{ ...style, top: '2px', bottom: '2px' }"
    :data-item-id="item.id"
    :data-item-type="item.type"
    role="button"
    :aria-label="`${item.type} clip ${item.name ?? ''}`"
    :aria-pressed="selected"
    @pointerdown="onPointerDown"
    @contextmenu.prevent.stop="emit('menu', { itemId: item.id, x: $event.clientX, y: $event.clientY })"
    @dblclick.stop="editor.focusProperties()"
    @click.stop
  >
    <!-- media preview -->
    <TimelineFilmstrip v-if="item.type === 'video' && !missing" :item="item" class="absolute inset-0" />
    <div
      v-else-if="item.type === 'image' && imageUrl && !missing"
      class="absolute inset-0 opacity-70"
      :style="{ backgroundImage: `url(${imageUrl})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }"
    />
    <div
      v-else-if="item.type === 'text' || item.type === 'caption'"
      class="pointer-events-none absolute inset-x-1 bottom-1 truncate text-center text-[10px] font-semibold opacity-80"
      :style="{ color: item.style.color }"
    >
      {{ item.text }}
    </div>
    <TimelineWaveform
      v-if="showWaveform && !missing"
      :item="item"
      class="absolute inset-x-0 bottom-0"
      :class="item.type === 'audio' ? 'top-4' : 'h-4'"
    />

    <!-- label -->
    <div class="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 bg-black/45 px-1 py-0.5 text-[10px] leading-tight">
      <component :is="icon" class="size-3 shrink-0" />
      <span class="min-w-0 flex-1 truncate">{{ label }}</span>
      <span v-if="speedBadge" class="shrink-0 rounded bg-accent px-1 font-mono text-[9px] text-accent-fg">{{ speedBadge }}</span>
      <Lock v-if="track.locked" class="size-3 shrink-0 text-warn" />
      <span class="shrink-0 font-mono opacity-80">{{ formatDuration(view.duration) }}</span>
    </div>

    <div v-if="missing" class="absolute inset-0 flex items-center justify-center gap-1 bg-warn/20 text-[10px] text-warn">
      <TriangleAlert class="size-3" /> offline
    </div>

    <!-- transition marker -->
    <div
      v-if="item.transitionIn"
      v-tooltip="`${item.transitionIn.kind} · ${item.transitionIn.duration}s`"
      class="pointer-events-none absolute top-1/2 -left-0.5 z-20 grid size-4 -translate-y-1/2 place-items-center rounded-full bg-accent text-accent-fg"
    >
      <Shuffle class="size-2.5" />
    </div>

    <!-- trim handles -->
    <template v-if="!track.locked">
      <div
        class="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize touch-none bg-accent/0 transition-colors group-hover:bg-accent/40 coarse:w-4"
        :class="selected ? 'bg-accent/60' : ''"
        role="separator"
        aria-label="Trim start"
        @pointerdown.stop="beginDrag($event, 'trim-start')"
      >
        <span v-if="selected" class="absolute inset-y-1/2 left-0.5 h-4 w-0.5 -translate-y-1/2 rounded bg-white/80" />
      </div>
      <div
        class="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize touch-none bg-accent/0 transition-colors group-hover:bg-accent/40 coarse:w-4"
        :class="selected ? 'bg-accent/60' : ''"
        role="separator"
        aria-label="Trim end"
        @pointerdown.stop="beginDrag($event, 'trim-end')"
      >
        <span v-if="selected" class="absolute inset-y-1/2 right-0.5 h-4 w-0.5 -translate-y-1/2 rounded bg-white/80" />
      </div>
    </template>
  </div>
</template>
