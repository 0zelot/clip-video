<script setup>
/**
 * Direct manipulation of the selected item on the preview: drag to move,
 * corner handles to scale, the top handle to rotate. Values are written back
 * into the normalized transform, so they survive resolution changes.
 */
import { RotateCw } from 'lucide-vue-next'
import { isActiveAt } from '~/core/time'
import { computeItemRect } from '~/core/render/layout'
import { measureTextItem } from '~/core/render/text'
import { locateItem } from '~/core/model/queries'
import { isTextual } from '~/core/model/types'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const props = defineProps({
  /** Preview surface size in CSS pixels. */
  surface: { type: Object, required: true },
})

const projectStore = useProjectStore()
const editor = useEditorStore()

const time = ref(0)
usePlaybackTime((t) => (time.value = Math.round(t * 30) / 30))

const item = computed(() => {
  const project = projectStore.project
  const id = editor.selection.length === 1 ? editor.selection[0] : null
  if (!project || !id) return null
  const found = locateItem(project, id)
  return found && found.item.type !== 'audio' ? found.item : null
})

const visible = computed(() => !!item.value && isActiveAt(item.value, time.value) && props.surface.width > 0)

/** Text needs a 2D context to be measured. */
let measureCtx = null
function getMeasureCtx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  return measureCtx
}

/** Item bounds in preview (CSS) pixels. */
const box = computed(() => {
  const current = item.value
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

// ----- interaction -----------------------------------------------------------

const dragging = ref(false)

function beginMove(e) {
  const current = item.value
  const project = projectStore.project
  if (!current || !project || current.locked) return
  e.preventDefault()
  const start = { x: e.clientX, y: e.clientY }
  const origin = { ...current.transform }
  const scale = props.surface.width / project.settings.width
  captureDrag(e, (ev) => {
    const dx = (ev.clientX - start.x) / scale / project.settings.width
    const dy = (ev.clientY - start.y) / scale / project.settings.height
    projectStore.setTransform(current.id, { ...origin, x: origin.x + dx, y: origin.y + dy }, `move:${current.id}`)
  })
}

function beginScale(e, corner) {
  const current = item.value
  const b = box.value
  if (!current || !b) return
  e.preventDefault()
  e.stopPropagation()
  const origin = { ...current.transform }
  const centerX = b.left + b.width / 2
  const centerY = b.top + b.height / 2
  const startDistance = Math.hypot(e.clientX - rectLeft() - centerX, e.clientY - rectTop() - centerY) || 1
  captureDrag(e, (ev) => {
    const distance = Math.hypot(ev.clientX - rectLeft() - centerX, ev.clientY - rectTop() - centerY)
    const factor = Math.max(0.05, distance / startDistance)
    projectStore.setTransform(current.id, { ...origin, scale: Math.min(12, Math.max(0.05, origin.scale * factor)) }, `scale:${current.id}`)
  })
}

function beginRotate(e) {
  const current = item.value
  const b = box.value
  if (!current || !b) return
  e.preventDefault()
  e.stopPropagation()
  const origin = { ...current.transform }
  const centerX = rectLeft() + b.left + b.width / 2
  const centerY = rectTop() + b.top + b.height / 2
  const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX)
  captureDrag(e, (ev) => {
    const angle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX)
    let degrees = origin.rotation + ((angle - startAngle) * 180) / Math.PI
    // Snap to straight angles.
    const snapped = Math.round(degrees / 15) * 15
    if (Math.abs(snapped - degrees) < 4) degrees = snapped
    projectStore.setTransform(current.id, { ...origin, rotation: Math.round(degrees * 10) / 10 }, `rotate:${current.id}`)
  })
}

const root = ref(null)
const rectLeft = () => root.value?.getBoundingClientRect().left ?? 0
const rectTop = () => root.value?.getBoundingClientRect().top ?? 0

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
</script>

<template>
  <div ref="root" class="pointer-events-none absolute">
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
        cursor: dragging ? 'grabbing' : 'grab',
      }"
      @pointerdown="beginMove"
    >
      <div class="absolute inset-0 border-2 border-accent/90" />
      <div
        v-for="handle in handles"
        :key="handle.id"
        class="absolute size-3.5 rounded-full border-2 border-accent bg-panel coarse:size-5"
        :style="`${handle.style};cursor:${handle.cursor}`"
        @pointerdown="beginScale($event, handle.id)"
      />
      <div
        class="absolute -top-9 left-1/2 grid size-7 -translate-x-1/2 place-items-center rounded-full border-2 border-accent bg-panel text-accent coarse:size-9"
        style="cursor: grab"
        @pointerdown="beginRotate"
      >
        <RotateCw class="size-3.5" />
      </div>
    </div>
  </div>
</template>
