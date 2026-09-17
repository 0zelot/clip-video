<script setup>
const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  step: { type: Number, default: 0.01 },
  label: { type: String, default: '' },
  disabled: Boolean,
  /** Optional formatter for the value shown next to the label. */
  format: { type: Function, default: null },
})
const emit = defineEmits(['update:modelValue', 'commit'])
const percent = computed(() => ((props.modelValue - props.min) / (props.max - props.min)) * 100)
</script>

<template>
  <label class="block">
    <span v-if="label" class="label flex justify-between">
      <span>{{ label }}</span>
      <span class="font-mono normal-case tracking-normal text-fg/80">{{ format ? format(modelValue) : modelValue }}</span>
    </span>
    <input
      type="range"
      class="clip-range w-full"
      :min="min"
      :max="max"
      :step="step"
      :value="modelValue"
      :disabled="disabled"
      :style="{ '--p': `${percent}%` }"
      @input="emit('update:modelValue', Number($event.target.value))"
      @change="emit('commit', Number($event.target.value))"
    />
  </label>
</template>

<style scoped>
.clip-range {
  appearance: none;
  height: 20px;
  background: transparent;
  cursor: pointer;
}
.clip-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(to right, var(--color-accent) var(--p), var(--color-line) var(--p));
}
.clip-range::-moz-range-track {
  height: 4px;
  border-radius: 4px;
  background: linear-gradient(to right, var(--color-accent) var(--p), var(--color-line) var(--p));
}
.clip-range::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
.clip-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 0;
  border-radius: 50%;
  background: #fff;
}
@media (pointer: coarse) {
  .clip-range {
    height: 32px;
  }
  .clip-range::-webkit-slider-thumb {
    width: 22px;
    height: 22px;
    margin-top: -9px;
  }
}
.clip-range:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
