<script setup>
import { AudioLines, Captions, Clock, Copy, Image as ImageIcon, Scissors, Sparkles, Trash2, Type, Video } from 'lucide-vue-next'
import { locateItem } from '~/core/model/queries'
import { hasAudio, isTextual, isVisualItem } from '~/core/model/types'
import { formatDuration, itemEnd, sourceOut } from '~/core/time'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'

const projectStore = useProjectStore()
const editor = useEditorStore()
const commands = useEditorCommands()

const location = computed(() => {
  const project = projectStore.project
  const id = editor.selection.length === 1 ? editor.selection[0] : null
  return project && id ? locateItem(project, id) : null
})
const item = computed(() => location.value?.item ?? null)
const asset = computed(() => (item.value?.assetId ? projectStore.project?.assets[item.value.assetId] : undefined))
const fps = computed(() => projectStore.project?.settings.fps ?? 30)
const icon = computed(() =>
  item.value?.type === 'audio'
    ? AudioLines
    : item.value?.type === 'image'
      ? ImageIcon
      : item.value?.type === 'text'
        ? Type
        : item.value?.type === 'caption'
          ? Captions
          : Video,
)

/** Mobile toolbar: only one section is shown in the bottom sheet. */
const focus = computed(() => (editor.mobilePanel === 'properties' ? editor.propertiesFocus : null))
const show = (section) => !focus.value || focus.value === section

function setStart(value) {
  if (item.value) projectStore.setItemTiming(item.value.id, { start: value })
}
function setDuration(value) {
  if (item.value) projectStore.setItemTiming(item.value.id, { duration: value })
}
function setSourceIn(value) {
  if (item.value) projectStore.setSourceIn(item.value.id, value)
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col" data-properties-panel>
    <div class="flex items-center justify-between px-3 py-2.5">
      <h2 class="panel-title">{{ item ? 'Clip' : editor.selection.length > 1 ? 'Selection' : 'Project' }}</h2>
      <button
        v-if="focus && item"
        type="button"
        class="text-[11px] font-medium text-accent"
        @click="editor.propertiesFocus = null"
      >
        All settings
      </button>
      <span v-if="location && !focus" class="text-[11px] text-muted">{{ location.track.name }}</span>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
      <!-- multiple selection -->
      <div v-if="editor.selection.length > 1" class="space-y-4">
        <p class="text-sm text-muted">{{ editor.selection.length }} clips selected</p>
        <div class="grid grid-cols-2 gap-2">
          <UiButton :icon="Copy" @click="commands.duplicateSelection()">Duplicate</UiButton>
          <UiButton variant="danger" :icon="Trash2" @click="commands.deleteSelection()">Delete</UiButton>
        </div>
      </div>

      <!-- single clip -->
      <div v-else-if="item">
        <template v-if="!focus">
        <div class="flex items-center gap-2 rounded-xl bg-panel-2 p-2.5">
          <component :is="icon" class="size-4 shrink-0 text-accent" />
          <p class="min-w-0 flex-1 truncate text-sm font-medium" :title="asset?.name">{{ item.name ?? asset?.name ?? item.type }}</p>
        </div>

        <div class="mt-3 grid grid-cols-3 gap-1.5">
          <UiButton size="sm" :icon="Scissors" @click="commands.split()">Split</UiButton>
          <UiButton size="sm" :icon="Copy" @click="commands.duplicateSelection()">Copy</UiButton>
          <UiButton size="sm" variant="danger" :icon="Trash2" @click="commands.deleteSelection()">Delete</UiButton>
        </div>
        </template>

        <PropertiesSection v-if="show('timing')" title="Timing" :icon="Clock">
          <div class="grid grid-cols-2 gap-2">
            <UiTimeField :model-value="item.start" label="Start" :fps="fps" @commit="setStart" />
            <UiTimeField :model-value="item.duration" label="Duration" :fps="fps" :min="1 / fps" @commit="setDuration" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <UiTimeField
              :model-value="itemEnd(item)"
              label="End"
              :fps="fps"
              :min="item.start + 1 / fps"
              @commit="(v) => setDuration(v - item.start)"
            />
            <UiTimeField
              v-if="item.type === 'video' || item.type === 'audio'"
              :model-value="item.sourceIn"
              label="Source in"
              :fps="fps"
              :max="asset?.duration ?? undefined"
              @commit="setSourceIn"
            />
          </div>
          <p v-if="(item.type === 'video' || item.type === 'audio') && asset?.duration" class="text-[11px] text-muted">
            Uses {{ formatDuration(item.sourceIn) }} – {{ formatDuration(sourceOut(item)) }} of {{ formatDuration(asset.duration) }}
          </p>
        </PropertiesSection>

        <PropertiesText v-if="isTextual(item) && show('text')" :item="item" />
        <PropertiesSpeed v-if="(item.type === 'video' || item.type === 'audio') && show('speed')" :item="item" />
        <PropertiesTransform v-if="isVisualItem(item) && show('transform')" :item="item" />
        <PropertiesEffects v-if="(item.type === 'video' || item.type === 'image') && show('effects')" :item="item" />
        <PropertiesMotion v-if="(item.type === 'video' || item.type === 'image') && show('motion')" :item="item" />
        <PropertiesTransition v-if="(item.type === 'video' || item.type === 'image') && show('transition')" :item="item" />
        <PropertiesAudio v-if="hasAudio(item) && show('audio')" :item="item" />
        <PropertiesSection v-if="item.type !== 'text' && item.type !== 'caption' && show('ai')" title="Smart tools (on-device AI)" :icon="Sparkles" :default-open="focus === 'ai'">
          <AiTools :item="item" />
        </PropertiesSection>

        <PropertiesSection v-if="asset && !focus" title="Source" :default-open="false">
          <dl class="space-y-1 text-xs text-muted">
            <div class="flex justify-between gap-2">
              <dt>File</dt>
              <dd class="truncate text-fg/80" :title="asset.name">{{ asset.name }}</dd>
            </div>
            <div v-if="asset.width" class="flex justify-between gap-2">
              <dt>Resolution</dt>
              <dd class="text-fg/80">{{ asset.width }}×{{ asset.height }}{{ asset.fps ? ` · ${asset.fps}fps` : '' }}</dd>
            </div>
            <div v-if="asset.duration" class="flex justify-between gap-2">
              <dt>Length</dt>
              <dd class="text-fg/80">{{ formatDuration(asset.duration) }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>Stored</dt>
              <dd class="text-fg/80">{{ asset.storage === 'indexeddb' ? 'on this device' : 'in memory only' }}</dd>
            </div>
          </dl>
        </PropertiesSection>
      </div>

      <!-- nothing selected -->
      <ProjectSettingsPanel v-else />
    </div>
  </div>
</template>
