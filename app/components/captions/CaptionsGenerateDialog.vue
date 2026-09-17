<script setup>
import { Mic, ShieldCheck } from 'lucide-vue-next'
import { formatDuration } from '~/core/time'
import { CAPTION_LANGUAGES, WHISPER_MODELS, canTranscribe } from '~/services/captions/transcribe'
import { useCaptionsStore } from '~/stores/captions'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'

const props = defineProps({ open: Boolean })
const emit = defineEmits(['close'])

const captions = useCaptionsStore()
const projectStore = useProjectStore()
const media = useMediaStore()

const assetId = ref('')
const model = ref(WHISPER_MODELS[0].id)
const language = ref('auto')
const replace = ref(true)

/** Clips on the timeline that carry audio - captions are timed against them. */
const sources = computed(() => {
  const project = projectStore.project
  if (!project) return []
  const items = project.tracks.flatMap((t) => t.items).filter((i) => i.type === 'audio' || (i.type === 'video' && project.assets[i.assetId]?.hasAudio !== false))
  const seen = new Map()
  for (const item of items) {
    const asset = project.assets[item.assetId]
    if (!asset || seen.has(asset.id)) continue
    if (media.status[asset.id] !== 'ready') continue
    seen.set(asset.id, { asset, offset: Math.max(0, item.start - item.sourceIn) })
  }
  return [...seen.values()]
})

watch(
  () => props.open,
  (open) => {
    if (open && !assetId.value) assetId.value = sources.value[0]?.asset.id ?? ''
  },
)

const busy = computed(() => ['decoding', 'model', 'transcribing'].includes(captions.transcription.status))
const supported = canTranscribe()

async function run() {
  const source = sources.value.find((s) => s.asset.id === assetId.value)
  if (!source) return
  await captions.transcribeAsset(source.asset.id, {
    model: model.value,
    language: language.value,
    replace: replace.value,
    offset: source.offset,
  })
  if (captions.transcription.status === 'done') emit('close')
}
</script>

<template>
  <UiDialog :open="open" title="Generate captions from speech" width="max-w-lg" :dismissible="!busy" @close="emit('close')">
    <div v-if="!supported" class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
      This browser cannot run the local speech model.
    </div>

    <div v-else-if="busy" class="space-y-3 py-4">
      <div class="h-2 overflow-hidden rounded-full bg-panel-3">
        <div class="h-full rounded-full bg-accent transition-[width]" :style="{ width: `${Math.round(captions.transcription.ratio * 100)}%` }" />
      </div>
      <p class="text-sm">{{ captions.transcription.message }}</p>
      <p class="text-xs text-muted">
        The model runs on this device - the audio is never uploaded. The first run downloads the model once; afterwards it works offline.
      </p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex gap-2 rounded-xl bg-panel-2 p-3 text-xs text-muted">
        <ShieldCheck class="size-4 shrink-0 text-ok" />
        <p>
          Speech recognition runs locally (WebGPU / WebAssembly). Only the model weights are downloaded - once - from the
          Hugging Face CDN; your audio never leaves the device.
        </p>
      </div>

      <label class="block">
        <span class="label">Audio source</span>
        <select v-model="assetId" class="field">
          <option v-for="source in sources" :key="source.asset.id" :value="source.asset.id">
            {{ source.asset.name }} ({{ formatDuration(source.asset.duration ?? 0) }})
          </option>
        </select>
      </label>
      <p v-if="sources.length === 0" class="text-xs text-warn">Add a video or audio clip with sound to the timeline first.</p>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="label">Model</span>
          <select v-model="model" class="field">
            <option v-for="m in WHISPER_MODELS" :key="m.id" :value="m.id">{{ m.label }} · {{ m.size }}</option>
          </select>
        </label>
        <label class="block">
          <span class="label">Language</span>
          <select v-model="language" class="field">
            <option v-for="l in CAPTION_LANGUAGES" :key="l.id" :value="l.id">{{ l.label }}</option>
          </select>
        </label>
      </div>

      <UiSwitch v-model="replace" label="Replace existing captions" />
      <p v-if="captions.transcription.status === 'error'" class="text-xs text-danger">{{ captions.transcription.message }}</p>
    </div>

    <template #footer>
      <template v-if="busy">
        <UiButton variant="danger" @click="captions.cancelTranscription()">Cancel</UiButton>
      </template>
      <template v-else>
        <UiButton variant="ghost" @click="emit('close')">Close</UiButton>
        <UiButton variant="primary" :icon="Mic" :disabled="!supported || sources.length === 0" @click="run">Generate captions</UiButton>
      </template>
    </template>
  </UiDialog>
</template>
