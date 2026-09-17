<script setup>
/**
 * Context menu.
 * @typedef {object} MenuEntry
 * @property {string} [label]
 * @property {object} [icon] icon component
 * @property {string} [shortcut]
 * @property {boolean} [danger]
 * @property {boolean} [disabled]
 * @property {boolean} [separator]
 * @property {() => void} [run]
 */
const props = defineProps({
  open: Boolean,
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  /** @type {import('vue').PropType<MenuEntry[]>} */
  items: { type: Array, required: true },
})
const emit = defineEmits(['close'])

const menu = ref(null)
const position = ref({ left: 0, top: 0 })

watch(
  () => [props.open, props.x, props.y],
  async ([open]) => {
    if (!open) return
    position.value = { left: props.x, top: props.y }
    await nextTick()
    const el = menu.value
    if (!el) return
    const r = el.getBoundingClientRect()
    position.value = {
      left: Math.max(4, Math.min(props.x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(props.y, window.innerHeight - r.height - 4)),
    }
    el.querySelector('button:not(:disabled)')?.focus()
  },
)

function select(entry) {
  if (entry.disabled) return
  emit('close')
  entry.run?.()
}

function onKeydown(e) {
  const buttons = [...(menu.value?.querySelectorAll('button:not(:disabled)') ?? [])]
  const index = buttons.indexOf(document.activeElement)
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    const next = (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[250]" @pointerdown="emit('close')" @contextmenu.prevent="emit('close')">
      <div
        ref="menu"
        role="menu"
        class="fixed min-w-52 rounded-xl border border-line bg-panel-2 p-1 shadow-2xl"
        :style="{ left: `${position.left}px`, top: `${position.top}px` }"
        @pointerdown.stop
        @keydown="onKeydown"
      >
        <template v-for="(entry, i) in items" :key="i">
          <div v-if="entry.separator" class="my-1 h-px bg-line" />
          <button
            v-else
            type="button"
            role="menuitem"
            :disabled="entry.disabled"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none hover:bg-panel-3 focus:bg-panel-3 disabled:opacity-35 disabled:hover:bg-transparent coarse:py-3"
            :class="entry.danger ? 'text-danger' : 'text-fg'"
            @click="select(entry)"
          >
            <component :is="entry.icon" v-if="entry.icon" class="size-4 shrink-0 opacity-80" />
            <span v-else class="size-4 shrink-0" />
            <span class="flex-1">{{ entry.label }}</span>
            <kbd v-if="entry.shortcut" class="font-mono text-[11px] text-muted">{{ entry.shortcut }}</kbd>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>
