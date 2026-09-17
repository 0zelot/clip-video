<script setup>
/**
 * Numeric input that commits on Enter/blur and can be scrubbed by dragging the
 * label horizontally (like in professional editors).
 */
const props = defineProps({
  modelValue: { type: Number, required: true },
  label: { type: String, default: '' },
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined },
  step: { type: Number, default: 1 },
  precision: { type: Number, default: 2 },
  suffix: { type: String, default: '' },
  disabled: Boolean,
  /** Display multiplier, e.g. 100 to edit 0..1 as percent. */
  factor: { type: Number, default: 1 },
})
const emit = defineEmits(['update:modelValue', 'commit'])

const text = ref('')
const focused = ref(false)

const display = computed(() => {
  const v = props.modelValue * props.factor
  return Number.isFinite(v) ? String(Number(v.toFixed(props.precision))) : '–'
})

watch(
  display,
  (v) => {
    if (!focused.value) text.value = v
  },
  { immediate: true },
)

function clamp(v) {
  let r = v
  if (props.min !== undefined) r = Math.max(props.min, r)
  if (props.max !== undefined) r = Math.min(props.max, r)
  return r
}

function commitText() {
  const parsed = Number(text.value.replace(',', '.'))
  if (!Number.isFinite(parsed)) {
    text.value = display.value
    return
  }
  const value = clamp(parsed / props.factor)
  emit('update:modelValue', value)
  emit('commit', value)
  text.value = String(Number((value * props.factor).toFixed(props.precision)))
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    e.target.blur()
  } else if (e.key === 'Escape') {
    text.value = display.value
    e.target.blur()
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const dir = e.key === 'ArrowUp' ? 1 : -1
    const mult = e.shiftKey ? 10 : 1
    const value = clamp(props.modelValue + (dir * props.step * mult) / props.factor)
    emit('update:modelValue', value)
    text.value = String(Number((value * props.factor).toFixed(props.precision)))
  }
}

function startScrub(e) {
  if (props.disabled || e.button !== 0) return
  const startX = e.clientX
  const startValue = props.modelValue
  const target = e.currentTarget
  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // pointer capture is optional (synthetic events, some touch stacks)
  }
  const move = (ev) => {
    const dx = ev.clientX - startX
    const value = clamp(startValue + (Math.round(dx / 3) * props.step * (ev.shiftKey ? 10 : 1)) / props.factor)
    emit('update:modelValue', value)
  }
  const up = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
    target.removeEventListener('pointercancel', up)
    emit('commit', props.modelValue)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
  target.addEventListener('pointercancel', up)
}
</script>

<template>
  <label class="block min-w-0">
    <span v-if="label" class="label cursor-ew-resize select-none touch-none" @pointerdown="startScrub">{{ label }}</span>
    <span class="relative block">
      <input
        v-model="text"
        class="field pr-7 font-mono tabular-nums"
        inputmode="decimal"
        :disabled="disabled"
        @focus="focused = true; $event.target.select()"
        @blur="focused = false; commitText()"
        @keydown="onKeydown"
      />
      <span v-if="suffix" class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted">{{ suffix }}</span>
    </span>
  </label>
</template>
