<script setup>
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-vue-next'
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()
const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert }
const colors = { info: 'text-accent', success: 'text-ok', warning: 'text-warn', error: 'text-danger' }
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-2 z-[300] flex flex-col items-center gap-2 px-3 safe-top" aria-live="polite">
    <TransitionGroup
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl border border-line bg-panel-2/95 px-3 py-2.5 text-sm shadow-xl backdrop-blur"
        :role="t.kind === 'error' ? 'alert' : 'status'"
      >
        <component :is="icons[t.kind]" class="mt-0.5 size-4 shrink-0" :class="colors[t.kind]" />
        <p class="min-w-0 flex-1 leading-snug">{{ t.message }}</p>
        <button
          v-if="t.action"
          type="button"
          class="shrink-0 font-semibold text-accent hover:underline"
          @click="t.action.run(); ui.dismiss(t.id)"
        >
          {{ t.action.label }}
        </button>
        <button type="button" class="shrink-0 text-muted hover:text-fg" aria-label="Dismiss" @click="ui.dismiss(t.id)">
          <X class="size-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
