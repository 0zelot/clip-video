<script setup>
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: [Object, Function], default: null },
  /** Collapsed sections remember their state per title for the session. */
  defaultOpen: { type: Boolean, default: true },
})

const open = ref(props.defaultOpen)
</script>

<template>
  <section class="border-b border-line/70 py-2 last:border-b-0">
    <button type="button" class="flex w-full items-center gap-2 py-1 text-left" @click="open = !open">
      <component :is="icon" v-if="icon" class="size-3.5 text-muted" />
      <span class="panel-title flex-1">{{ title }}</span>
      <ChevronDown class="size-4 text-muted transition-transform" :class="open ? '' : '-rotate-90'" />
    </button>
    <div v-show="open" class="mt-2 space-y-2.5">
      <slot />
    </div>
  </section>
</template>
