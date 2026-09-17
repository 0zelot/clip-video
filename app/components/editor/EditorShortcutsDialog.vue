<script setup>
import { SHORTCUTS } from '~/composables/useKeyboardShortcuts'
import { isMac } from '~/services/platform/platform'
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()
const mac = isMac()

const groups = computed(() => {
  const map = new Map()
  for (const s of SHORTCUTS) map.set(s.group, [...(map.get(s.group) ?? []), s])
  return [...map.entries()]
})

const keyLabel = (k) => (mac && k === 'Ctrl' ? '⌘' : k)
</script>

<template>
  <UiDialog :open="ui.shortcutsOpen" title="Keyboard shortcuts" width="max-w-2xl" @close="ui.shortcutsOpen = false">
    <div class="grid gap-6 sm:grid-cols-2">
      <section v-for="[group, items] in groups" :key="group">
        <h3 class="panel-title mb-2">{{ group }}</h3>
        <ul class="space-y-1.5">
          <li v-for="s in items" :key="s.description + s.keys.join()" class="flex items-center justify-between gap-3 text-sm">
            <span class="text-fg/90">{{ s.description }}</span>
            <span class="flex shrink-0 gap-1">
              <kbd v-for="k in s.keys" :key="k" class="rounded-md border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">
                {{ keyLabel(k) }}
              </kbd>
            </span>
          </li>
        </ul>
      </section>
    </div>
    <p class="mt-6 text-xs text-muted">
      Touch: tap a clip to select it, then drag it or its edges. Pinch the timeline to zoom, long-press a clip for more actions.
    </p>
  </UiDialog>
</template>
