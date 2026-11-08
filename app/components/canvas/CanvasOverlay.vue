<script setup>
/**
 * Direct manipulation of the selected item on the preview: drag to move,
 * corner handles (or a two-finger pinch) to scale, the top handle to rotate,
 * side handles to stretch blur regions. Values are written back into the
 * normalized transform - or as keyframes at the playhead once the clip is
 * animated - so they survive resolution changes.
 */
import { RotateCw } from 'lucide-vue-next'
import { isActiveAt } from '~/core/time'
import { computeItemRect } from '~/core/render/layout'
import { measureTextItem } from '~/core/render/text'
import { hasKeyframes, resolveItemAt } from '~/core/render/animate'
import { locateItem } from '~/core/model/queries'
import { isTextual } from '~/core/model/types'
import { previewInteraction } from '~/composables/usePreviewInteraction'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const props = defineProps({
  /** Preview surface size in CSS pixels. */
  surface: { type: Object, required: true },
})

const projectStore = useProjectStore()
const editor = useEditorStore()

const time = ref(0)

const item = computed(() => {
  const project = projectStore.project
  const id = editor.selection.length === 1 ? editor.selection[0] : null
  if (!project || !id) return null
  const found = locateItem(project, id)
  return found && found.item.type !== 'audio' && !found.track.hidden ? found.item : null
})
const locked = computed(() => {
  const project = projectStore.project
  return !!(project && item.value && locateItem(project, item.value.id)?.track.locked)
})

// The playhead only matters here when it changes what the box looks like:
// while playing, skip updates unless the clip is animated or (dis)appears.
usePlaybackTime((t) => {
  const r = Math.round(t * 30) / 30
  if (r === time.value) return
  const it = item.value
  if (!editor.playing || (it && (hasKeyframes(it) || isActiveAt(it, r) !== isActiveAt(it, time.value)))) time.value = r
})
watch(item, () => (time.value = Math.round(editor.currentTime() * 30) / 30))

const visible = computed(() => !!item.value && isActiveAt(item.value, time.value) && props.surface.width > 0)
const local = computed(() => (item.value ? Math.max(0, time.value - item.value.start) : 0))
/** The item as it looks right now (keyframes applied). */
const shown = computed(() => (item.value ? resolveItemAt(item.value, local.value) : null))

/** Text needs a 2D context to be measured. */
let measureCtx = null
function getMeasureCtx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  return measureCtx
}

/** Item bounds in preview (CSS) pixels. */
const box = computed(() => {
  const current = shown.value
  const project = projectStore.project
  if (!current || !project || !visible.value) return null
  const { width: pw, height: ph } = project.settings
  const scale = props.surface.width / pw

  if (isTextual(current)) {
    const m = measureTextItem(getMeasureCtx(), current, project.settings)
    return {
      left: (m.cx - m.width / 2) * scale,
      top: (m.cy - m.height / 2) * scale,
      width: Math.max(24, m.width * scale),
      height: Math.max(20, m.height * scale),
      rotation: current.transform.rotation,
    }
  }

  if (current.type === 'blur') {
    const tr = current.transform
    const w = current.size.w * pw * tr.scale * (tr.scaleX ?? 1)
    const h = current.size.h * ph * tr.scale * (tr.scaleY ?? 1)
    return { left: (tr.x * pw - w / 2) * scale, top: (tr.y * ph - h / 2) * scale, width: w * scale, height: h * scale, rotation: tr.rotation }
  }

  const asset = project.assets[current.assetId]
  const sourceW = asset?.width ?? 1920
  const sourceH = asset?.height ?? 1080
  const r = computeItemRect(current, sourceW, sourceH, pw, ph)
  return {
    left: (r.cx - r.width / 2) * scale,
    top: (r.cy - r.height / 2) * scale,
    width: r.width * scale,
    height: r.height * scale,
    rotation: r.rotation,
  }
})

// ----- writing changes ---------------------------------------------------------

/** Applies transform values (as keyframes when the clip is animated). */
function write(values, key) {
  const current = item.value
  if (!current) return
  if (hasKeyframes(current)) {
    const kf = {}
    for (const k of ['x', 'y', 'scale', 'rotation']) if (k in values) kf[k] = values[k]
    projectStore.setKeyframes(current.id, local.value, kf, key)
    const rest = { ...values }
    for (const k of Object.keys(kf)) delete rest[k]
    if (Object.keys(rest).length) projectStore.setTransform(current.id, { ...current.transform, ...rest }, key)
  } else {
    projectStore.setTransform(current.id, { ...current.transform, ...values }, key)
  }
}

// ----- interaction -----------------------------------------------------------

const dragging = ref(false)
const root = ref(null)
const rectLeft = () => root.value?.getBoundingClientRect().left ?? 0
const rectTop = () => root.value?.getBoundingClientRect().top ?? 0

/** Active pointers on the selection box (for pinch). */
const pointers = new Map()
let gesture = null

function onBoxPointerDown(e) {
  const current = item.value
  const project = projectStore.project
  if (!current || !project || locked.value) return
  e.preventDefault()
  e.stopPropagation()
  try {
    e.currentTarget.setPointerCapture(e.pointerId)
  } catch {
    // optional
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  previewInteraction.itemPointers = pointers.size
  dragging.value = true
  const origin = { ...shown.value.transform }
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    gesture = {
      kind: 'pinch',
      origin,
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    }
  } else {
    gesture = { kind: 'move', origin, start: { x: e.clientX, y: e.clientY } }
  }
}

function onBoxPointerMove(e) {
  if (!pointers.has(e.pointerId) || !gesture) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  const current = item.value
  const project = projectStore.project
  if (!current || !project) return
  const scale = props.surface.width / project.settings.width
  const { origin } = gesture
  if (gesture.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()]
    const distance = Math.hypot(a.x - b.x, a.y - b.y)
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    let rotation = origin.rotation + ((angle - gesture.angle) * 180) / Math.PI
    const snapped = Math.round(rotation / 90) * 90
    if (Math.abs(snapped - rotation) < 5) rotation = snapped
    write(
      {
        scale: Math.min(12, Math.max(0.05, origin.scale * (distance / gesture.distance))),
        rotation: Math.round(rotation * 10) / 10,
        x: origin.x + (center.x - gesture.center.x) / scale / project.settings.width,
        y: origin.y + (center.y - gesture.center.y) / scale / project.settings.height,
      },
      `pinch:${current.id}`,
    )
  } else if (gesture.kind === 'move') {
    const dx = (e.clientX - gesture.start.x) / scale / project.settings.width
    const dy = (e.clientY - gesture.start.y) / scale / project.settings.height
    let x = origin.x + dx
    let y = origin.y + dy
    // Snap to the centre lines.
    guides.value = { v: Math.abs(x - 0.5) < 0.012, h: Math.abs(y - 0.5) < 0.012 }
    if (guides.value.v) x = 0.5
    if (guides.value.h) y = 0.5
    write({ x, y }, `move:${current.id}`)
  }
}

function onBoxPointerUp(e) {
  pointers.delete(e.pointerId)
  previewInteraction.itemPointers = pointers.size
  if (pointers.size === 0) {
    gesture = null
    dragging.value = false
    guides.value = { v: false, h: false }
  } else if (gesture?.kind === 'pinch') {
    // One finger left: continue moving from here.
    const [rest] = [...pointers.values()]
    gesture = { kind: 'move', origin: { ...shown.value.transform }, start: rest }
  }
}

const guides = ref({ v: false, h: false })

function beginScale(e) {
  const current = item.value
  const b = box.value
  if (!current || !b || locked.value) return
  e.preventDefault()
  e.stopPropagation()
  const origin = { ...shown.value.transform }
  const centerX = b.left + b.width / 2
  const centerY = b.top + b.height / 2
  const startDistance = Math.hypot(e.clientX - rectLeft() - centerX, e.clientY - rectTop() - centerY) || 1
  captureDrag(e, (ev) => {
    const distance = Math.hypot(ev.clientX - rectLeft() - centerX, ev.clientY - rectTop() - centerY)
    const factor = Math.max(0.05, distance / startDistance)
    write({ scale: Math.min(12, Math.max(0.05, origin.scale * factor)) }, `scale:${current.id}`)
  })
}

/** Side handles: stretch width or height (blur regions). */
function beginStretch(e, axis) {
  const current = item.value
  const b = box.value
  if (!current || !b || locked.value) return
  e.preventDefault()
  e.stopPropagation()
  const origin = { ...shown.value.transform }
  const centerX = rectLeft() + b.left + b.width / 2
  const centerY = rectTop() + b.top + b.height / 2
  const start = axis === 'x' ? Math.abs(e.clientX - centerX) || 1 : Math.abs(e.clientY - centerY) || 1
  captureDrag(e, (ev) => {
    const now = axis === 'x' ? Math.abs(ev.clientX - centerX) : Math.abs(ev.clientY - centerY)
    const factor = Math.max(0.05, now / start)
    const key = axis === 'x' ? 'scaleX' : 'scaleY'
    projectStore.setTransform(current.id, { ...current.transform, [key]: Math.min(20, Math.max(0.05, (origin[key] ?? 1) * factor)) }, `stretch:${current.id}`)
  })
}

function beginRotate(e) {
  const current = item.value
  const b = box.value
  if (!current || !b || locked.value) return
  e.preventDefault()
  e.stopPropagation()
  const origin = { ...shown.value.transform }
  const centerX = rectLeft() + b.left + b.width / 2
  const centerY = rectTop() + b.top + b.height / 2
  const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX)
  captureDrag(e, (ev) => {
    const angle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX)
    let degrees = origin.rotation + ((angle - startAngle) * 180) / Math.PI
    // Snap to straight angles.
    const snapped = Math.round(degrees / 15) * 15
    if (Math.abs(snapped - degrees) < 4) degrees = snapped
    write({ rotation: Math.round(degrees * 10) / 10 }, `rotate:${current.id}`)
  })
}

function captureDrag(e, onMove) {
  const target = e.currentTarget
  dragging.value = true
  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // pointer capture is optional
  }
  const move = (ev) => onMove(ev)
  const up = () => {
    dragging.value = false
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', up)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
}

const handles = [
  { id: 'nw', style: 'left:-7px;top:-7px', cursor: 'nwse-resize' },
  { id: 'ne', style: 'right:-7px;top:-7px', cursor: 'nesw-resize' },
  { id: 'sw', style: 'left:-7px;bottom:-7px', cursor: 'nesw-resize' },
  { id: 'se', style: 'right:-7px;bottom:-7px', cursor: 'nwse-resize' },
]
const sideHandles = [
  { id: 'e', axis: 'x', style: 'right:-6px;top:50%;transform:translateY(-50%)', cls: 'h-6 w-2.5 coarse:h-8 coarse:w-3.5', cursor: 'ew-resize' },
  { id: 'w', axis: 'x', style: 'left:-6px;top:50%;transform:translateY(-50%)', cls: 'h-6 w-2.5 coarse:h-8 coarse:w-3.5', cursor: 'ew-resize' },
  { id: 'n', axis: 'y', style: 'top:-6px;left:50%;transform:translateX(-50%)', cls: 'h-2.5 w-6 coarse:h-3.5 coarse:w-8', cursor: 'ns-resize' },
  { id: 's', axis: 'y', style: 'bottom:-6px;left:50%;transform:translateX(-50%)', cls: 'h-2.5 w-6 coarse:h-3.5 coarse:w-8', cursor: 'ns-resize' },
]
</script>

<template>
  <div ref="root" class="pointer-events-none absolute">
    <div v-if="guides.v" class="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px bg-warn/80" />
    <div v-if="guides.h" class="pointer-events-none absolute top-1/2 right-0 left-0 h-px bg-warn/80" />
    <div
      v-if="visible && box"
      data-preview-handle
      class="pointer-events-auto absolute touch-none"
      :style="{
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
        cursor: locked ? 'not-allowed' : dragging ? 'grabbing' : 'grab',
      }"
      @pointerdown="onBoxPointerDown"
      @pointermove="onBoxPointerMove"
      @pointerup="onBoxPointerUp"
      @pointercancel="onBoxPointerUp"
    >
      <div
        class="absolute inset-0 border-2"
        :class="[item?.type === 'blur' ? 'border-dashed border-warn/90' : 'border-accent/90', item?.type === 'blur' && item.shape === 'ellipse' ? 'rounded-[50%]' : '']"
      />
      <template v-if="!locked">
        <div
          v-for="handle in handles"
          :key="handle.id"
          class="absolute size-3.5 rounded-full border-2 border-accent bg-panel coarse:size-5"
          :style="`${handle.style};cursor:${handle.cursor}`"
          @pointerdown="beginScale($event)"
        />
        <template v-if="item?.type === 'blur'">
          <div
            v-for="handle in sideHandles"
            :key="handle.id"
            class="absolute rounded-full border-2 border-warn bg-panel"
            :class="handle.cls"
            :style="`${handle.style};cursor:${handle.cursor}`"
            @pointerdown="beginStretch($event, handle.axis)"
          />
        </template>
        <div
          class="absolute -top-9 left-1/2 grid size-7 -translate-x-1/2 place-items-center rounded-full border-2 border-accent bg-panel text-accent coarse:-top-11 coarse:size-9"
          style="cursor: grab"
          @pointerdown="beginRotate"
        >
          <RotateCw class="size-3.5" />
        </div>
      </template>
    </div>
  </div>
</template>
