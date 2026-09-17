<script setup>
defineProps({
  icon: { type: [Object, Function], required: true },
  label: { type: String, required: true },
  /** Renders a pressed state; leave undefined for plain buttons. */
  active: { type: Boolean, default: undefined },
  disabled: Boolean,
  /** 'sm' | 'md' | 'lg' */
  size: { type: String, default: 'md' },
  /** 'ghost' | 'solid' | 'accent' */
  variant: { type: String, default: 'ghost' },
})
</script>

<template>
  <button
    v-tooltip="label"
    type="button"
    :aria-label="label"
    :aria-pressed="active === undefined ? undefined : active"
    :disabled="disabled"
    class="inline-flex shrink-0 items-center justify-center rounded-lg transition-colors select-none disabled:cursor-not-allowed disabled:opacity-35"
    :class="[
      {
        sm: 'size-7 coarse:size-10',
        md: 'size-9 coarse:size-11',
        lg: 'size-11 coarse:size-12',
      }[size],
      variant === 'accent'
        ? 'bg-accent text-accent-fg hover:bg-accent-strong'
        : variant === 'solid'
          ? 'bg-panel-3 hover:bg-line'
          : active
            ? 'bg-accent/15 text-accent hover:bg-accent/25'
            : 'text-fg/85 hover:bg-panel-3 hover:text-fg',
    ]"
  >
    <component :is="icon" :class="size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-[18px]'" />
  </button>
</template>
