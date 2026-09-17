<script setup>
const props = defineProps({
  /** 'primary' | 'secondary' | 'ghost' | 'danger' */
  variant: { type: String, default: 'secondary' },
  /** 'sm' | 'md' | 'lg' */
  size: { type: String, default: 'md' },
  icon: { type: [Object, Function], default: null },
  loading: Boolean,
  disabled: Boolean,
  type: { type: String, default: 'button' },
  block: Boolean,
})

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-40',
  props.block ? 'w-full' : '',
  {
    sm: 'h-7 px-2.5 text-xs coarse:h-10 coarse:px-3',
    md: 'h-9 px-3.5 text-sm coarse:h-11',
    lg: 'h-11 px-5 text-base coarse:h-12',
  }[props.size],
  {
    primary: 'bg-accent text-accent-fg hover:bg-accent-strong',
    secondary: 'bg-panel-3 text-fg hover:bg-line',
    ghost: 'bg-transparent text-fg hover:bg-panel-3',
    danger: 'bg-danger/15 text-danger hover:bg-danger/25',
  }[props.variant],
])
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled || loading">
    <span v-if="loading" class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    <component :is="icon" v-else-if="icon" class="size-4 shrink-0" />
    <slot />
  </button>
</template>
