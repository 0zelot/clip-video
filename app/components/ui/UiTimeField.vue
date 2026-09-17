<script setup>
import { formatTimecode, parseTime } from '~/core/time'

const props = defineProps({
  modelValue: { type: Number, required: true },
  label: { type: String, default: '' },
  fps: { type: Number, required: true },
  disabled: Boolean,
  min: { type: Number, default: 0 },
  max: { type: Number, default: undefined },
})
const emit = defineEmits(['commit'])

const text = ref('')
const focused = ref(false)
const invalid = ref(false)

const display = computed(() => formatTimecode(props.modelValue, props.fps))
watch(
  display,
  (v) => {
    if (!focused.value) text.value = v
  },
  { immediate: true },
)

/** Accepts `mm:ss.ff` (frames) as displayed, or plain seconds like `12.5`. */
function parse(input) {
  const m = input.trim().match(/^(?:(\d+):)?(\d+):(\d+)\.(\d+)$/)
  if (m) {
    const [, h, mm, ss, ff] = m
    return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + Number(ff) / props.fps
  }
  return parseTime(input)
}

function commit() {
  const value = parse(text.value)
  if (value === null) {
    invalid.value = true
    text.value = display.value
    setTimeout(() => (invalid.value = false), 800)
    return
  }
  const clamped = Math.min(props.max ?? Number.POSITIVE_INFINITY, Math.max(props.min, value))
  if (Math.abs(clamped - props.modelValue) > 1e-6) emit('commit', clamped)
  text.value = formatTimecode(clamped, props.fps)
}
</script>

<template>
  <label class="block min-w-0">
    <span v-if="label" class="label">{{ label }}</span>
    <input
      v-model="text"
      class="field font-mono tabular-nums"
      :class="invalid ? 'border-danger' : ''"
      :disabled="disabled"
      inputmode="decimal"
      @focus="focused = true; $event.target.select()"
      @blur="focused = false; commit()"
      @keydown.enter="$event.target.blur()"
      @keydown.esc="text = display; $event.target.blur()"
    />
  </label>
</template>
