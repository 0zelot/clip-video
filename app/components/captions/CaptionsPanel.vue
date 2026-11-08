<script setup>
import { textPreviewStyle } from '~/composables/useTextPreview'
import { ClipboardType, FileUp, Mic, Trash2, Wand2 } from 'lucide-vue-next'
import { useCaptionsStore } from '~/stores/captions'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const captions = useCaptionsStore()
const projectStore = useProjectStore()
const editor = useEditorStore()
const ui = useUiStore()

const generateOpen = ref(false)
const textOpen = ref(false)
const fps = computed(() => projectStore.project?.settings.fps ?? 30)

const positions = [
  { id: 'top', label: 'Top', y: 0.18 },
  { id: 'middle', label: 'Middle', y: 0.5 },
  { id: 'lower', label: 'Lower', y: 0.72 },
  { id: 'bottom', label: 'Bottom', y: 0.85 },
]

onMounted(() => captions.syncFromProject())

// Long videos can have hundreds of phrases: render them in pages.
const PAGE = 60
const windowStart = ref(0)
const windowEnd = ref(PAGE)
const visibleItems = computed(() => captions.items.slice(windowStart.value, windowEnd.value))
const selectedIds = computed(() => new Set(editor.selection))

/** Shows the page of phrases around the playhead. */
function jumpToPlayhead() {
  const t = editor.currentTime()
  const index = Math.max(0, captions.items.findIndex((i) => i.start + i.duration >= t))
  windowStart.value = Math.max(0, index - 5)
  windowEnd.value = windowStart.value + PAGE
}

const focusRow = (item) => editor.select([item.id])
const onStart = (item, v) => setTiming(item, 'start', v)
const onEnd = (item, v) => setTiming(item, 'end', v)

async function importFile() {
  const [file] = await pickFiles({ multiple: false, accept: '.srt,.vtt,.txt,text/plain' })
  if (file) await captions.importSubtitleFile(file)
}

function seekTo(item) {
  editor.engine?.seek(item.start + 0.01)
  editor.select([item.id])
}

function setTiming(item, field, value) {
  if (field === 'start') projectStore.setItemTiming(item.id, { start: value })
  else projectStore.setItemTiming(item.id, { duration: Math.max(0.2, value - item.start) })
  editor.engine?.refresh()
}

function setText(item, value) {
  projectStore.setCaptionText(item.id, value)
}

function splitHere(item) {
  const middle = Math.max(1, Math.floor(item.words.length / 2))
  const id = projectStore.splitCaptionAtWord(item.id, middle)
  if (!id) ui.toast('This caption is too short to split', 'info')
  editor.engine?.refresh()
}

function mergeNext(item) {
  if (!projectStore.mergeCaptionWithNext(item.id)) ui.toast('There is no caption after this one', 'info')
  editor.engine?.refresh()
}

function remove(item) {
  projectStore.deleteItems([item.id])
  editor.engine?.refresh()
}

async function clearAll() {
  const ok = await ui.confirm({
    title: 'Remove all captions?',
    message: `${captions.count} captions will be deleted. You can undo this.`,
    confirmLabel: 'Remove',
    danger: true,
  })
  if (ok) captions.clearAll()
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between gap-2 px-3 py-2.5">
      <h2 class="panel-title">Captions</h2>
      <span class="text-[11px] text-muted">{{ captions.count }} phrases</span>
    </div>

    <div class="space-y-2 px-3 pb-2">
      <div class="grid grid-cols-3 gap-1.5">
        <UiButton size="sm" variant="primary" :icon="Mic" @click="generateOpen = true">Auto</UiButton>
        <UiButton size="sm" :icon="FileUp" @click="importFile">SRT</UiButton>
        <UiButton size="sm" :icon="ClipboardType" @click="textOpen = true">Text</UiButton>
      </div>

      <div>
        <span class="label">Style</span>
        <div class="grid grid-cols-3 gap-1.5">
          <button
            v-for="preset in captions.presets"
            :key="preset.id"
            type="button"
            class="flex flex-col items-center gap-1 rounded-lg border border-line bg-[#2a2a36] p-1 text-[10px] text-muted hover:border-accent hover:text-accent"
            @click="captions.applyPreset(preset)"
          >
            <span class="grid h-8 w-full place-items-center overflow-hidden rounded-md text-xs uppercase" :style="textPreviewStyle(preset.style)">
              <span>Hey <span :style="{ color: preset.style.highlight === 'box' ? preset.style.color : preset.style.activeColor, background: preset.style.highlight === 'box' ? preset.style.activeBackground : undefined, WebkitTextFillColor: preset.style.highlight === 'box' ? undefined : preset.style.activeColor }">you</span></span>
            </span>
            <span class="w-full truncate text-center">{{ preset.label }}</span>
          </button>
        </div>
      </div>

      <div>
        <span class="label">Position</span>
        <div class="flex gap-1">
          <button
            v-for="pos in positions"
            :key="pos.id"
            type="button"
            class="h-8 flex-1 rounded-lg border text-[11px] coarse:h-10"
            :class="Math.abs(captions.position.y - pos.y) < 0.02 ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
            @click="captions.setPosition({ y: pos.y })"
          >
            {{ pos.label }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <UiNumberField v-model="captions.wordsPerPhrase" label="Words / phrase" :min="1" :max="12" :step="1" :precision="0" />
        <div class="flex items-end gap-1">
          <UiButton size="sm" class="flex-1" @click="captions.shiftAll(-0.1)">−0.1s</UiButton>
          <UiButton size="sm" class="flex-1" @click="captions.shiftAll(0.1)">+0.1s</UiButton>
        </div>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <div v-if="captions.count === 0" class="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
        <Wand2 class="mx-auto mb-2 size-6" />
        Generate captions from speech, import an .srt file or paste your script.
        Every phrase becomes a clip on the captions track that you can edit and restyle.
      </div>

      <template v-else>
        <div v-if="captions.count > PAGE" class="mb-2 flex items-center gap-2 text-[11px] text-muted">
          <span class="flex-1">Showing {{ windowStart + 1 }}–{{ windowStart + visibleItems.length }} of {{ captions.count }}</span>
          <button v-if="windowStart > 0" type="button" class="text-accent" @click="windowStart = Math.max(0, windowStart - PAGE)">Earlier</button>
          <button type="button" class="text-accent" @click="jumpToPlayhead">Around the playhead</button>
        </div>
        <ul class="space-y-1.5">
          <CaptionsRow
            v-for="item in visibleItems"
            :key="item.id"
            :item="item"
            :fps="fps"
            :selected="selectedIds.has(item.id)"
            @seek="seekTo"
            @split="splitHere"
            @merge="mergeNext"
            @remove="remove"
            @text="setText"
            @focus="focusRow"
            @start="onStart"
            @end="onEnd"
          />
        </ul>
        <UiButton v-if="windowEnd < captions.count" size="sm" block class="mt-2" @click="windowEnd += PAGE">Show more</UiButton>
      </template>

      <UiButton v-if="captions.count > 0" size="sm" variant="danger" block class="mt-3" :icon="Trash2" @click="clearAll">
        Remove all captions
      </UiButton>
    </div>

    <CaptionsGenerateDialog :open="generateOpen" @close="generateOpen = false" />
    <CaptionsTextDialog :open="textOpen" @close="textOpen = false" />
  </div>
</template>
