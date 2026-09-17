<script setup>
defineProps({
  modelValue: Boolean,
  label: { type: String, default: '' },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <label class="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm select-none" :class="disabled ? 'opacity-40 cursor-not-allowed' : ''">
    <span v-if="label">{{ label }}</span>
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label"
      :disabled="disabled"
      class="relative h-5 w-9 shrink-0 rounded-full transition-colors coarse:h-7 coarse:w-12"
      :class="modelValue ? 'bg-accent' : 'bg-line'"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span
        class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform coarse:size-6"
        :class="modelValue ? 'translate-x-4 coarse:translate-x-5' : ''"
      />
    </button>
  </label>
</template>
