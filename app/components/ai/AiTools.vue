<script setup>
/**
 * On-device "smart" tools. Nothing is uploaded: audio analysis and colour
 * correction are plain maths, background removal runs a small neural network
 * in the browser (downloaded once, then cached for offline use).
 */
import { AudioWaveform, Captions, Eraser, Loader2, Scissors, Wand2 } from 'lucide-vue-next'
import { autoEnhanceFromPixels, dbToAmplitude, detectSilences } from '~/core/analysis/smart'
import { removeBackground } from '~/services/ai/backgroundRemoval'
import { mediaAnalysis } from '~/services/media/analysis'
import { mediaLibrary } from '~/services/media/mediaLibrary'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const props = defineProps({
  /** The selected clip, or null. */
  item: { type: Object, default: null },
  /** Show the explanation header (sidebar) or not (inside clip properties). */
  standalone: Boolean,
})

const projectStore = useProjectStore()
const editor = useEditorStore()
const media = useMediaStore()
const ui = useUiStore()
const online = useOnline()

const asset = computed(() => (props.item?.assetId ? projectStore.project?.assets[props.item.assetId] : null))
const hasSound = computed(() => props.item?.type === 'audio' || (props.item?.type === 'video' && asset.value?.hasAudio))
const isVisualMedia = computed(() => props.item?.type === 'video' || props.item?.type === 'image')

// ----- silence removal -------------------------------------------------------

const thresholdDb = ref(-34)
const minPause = ref(0.45)
const peaksVersion = ref(0)
let unsubscribe = null
onMounted(() => {
  unsubscribe = mediaAnalysis.onUpdate((_id, kind) => {
    if (kind === 'peaks') peaksVersion.value++
  })
})
onBeforeUnmount(() => unsubscribe?.())

const peaks = computed(() => {
  void peaksVersion.value
  return props.item?.assetId ? mediaAnalysis.getPeaks(props.item.assetId) : undefined
})

/** Silent parts of the selected clip, in timeline time. */
const silences = computed(() => {
  const item = props.item
  const p = peaks.value
  if (!item || !p || !hasSound.value || item.reversed) return []
  const from = item.sourceIn
  const to = item.sourceIn + item.duration * item.speed
  const ranges = detectSilences(p.data, p.bucketsPerSecond, from, to, {
    threshold: dbToAmplitude(thresholdDb.value),
    minSilence: minPause.value,
  })
  return ranges.map(([a, b]) => [item.start + (a - from) / item.speed, item.start + (b - from) / item.speed])
})
const silentSeconds = computed(() => silences.value.reduce((sum, [a, b]) => sum + (b - a), 0))

function analyse() {
  const blob = props.item?.assetId ? mediaLibrary.getBlob(props.item.assetId) : null
  if (!blob) {
    ui.toast('The media file of this clip is not available', 'error')
    return
  }
  mediaAnalysis.requestPeaks(props.item.assetId, blob)
}

function cutSilences() {
  if (!props.item || silences.value.length === 0) return
  const { removed, seconds } = projectStore.cutRangesFromItem(props.item.id, silences.value)
  if (removed) {
    ui.toast(`Removed ${removed} pause${removed === 1 ? '' : 's'} · ${seconds.toFixed(1)}s shorter`, 'success', {
      action: { label: 'Undo', run: () => projectStore.undo() },
    })
    editor.select([props.item.id])
    editor.engine?.refresh()
  }
}

// ----- auto enhance ------------------------------------------------------------

function currentFrameSource() {
  const item = props.item
  if (!item) return null
  if (item.type === 'image') return mediaLibrary.getImage(item.assetId) ?? null
  const video = editor.engine?.media.getVideo(item.id)
  if (video && video.readyState >= 2) return video
  return editor.engine?.media.getSnapshot(item.id)?.canvas ?? null
}

async function autoEnhance() {
  const item = props.item
  if (!item) return
  if (item.type === 'video') {
    // Make sure the clip's video element shows a frame of this clip.
    const t = Math.min(Math.max(editor.currentTime(), item.start), item.start + item.duration - 0.01)
    if (editor.currentTime() !== t) editor.engine?.seek(t)
    await new Promise((r) => setTimeout(r, 250))
  }
  const source = currentFrameSource()
  if (!source) {
    ui.toast('Move the playhead over the clip and try again', 'info')
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const c = canvas.getContext('2d', { willReadFrequently: true })
  try {
    c.drawImage(source, 0, 0, 64, 64)
    const { data } = c.getImageData(0, 0, 64, 64)
    const fix = autoEnhanceFromPixels(data)
    projectStore.setEffects(item.id, { ...item.effects, ...fix }, `enhance:${item.id}`)
    editor.engine?.refresh()
    ui.toast(`Enhanced: brightness ${Math.round(fix.brightness * 100)}%, contrast ${Math.round(fix.contrast * 100)}%, saturation ${Math.round(fix.saturation * 100)}%`, 'success')
  } catch {
    ui.toast('Could not read the frame of this clip', 'error')
  }
}

// ----- background removal ---------------------------------------------------------

const bgBusy = ref(false)
const bgProgress = ref(null)

async function cutOutBackground() {
  const item = props.item
  if (!item || item.type !== 'image') return
  const blob = mediaLibrary.getBlob(item.assetId)
  if (!blob) {
    ui.toast('The image of this clip is not available', 'error')
    return
  }
  bgBusy.value = true
  bgProgress.value = { phase: 'model', ratio: 0 }
  try {
    const png = await removeBackground(blob, { onProgress: (p) => (bgProgress.value = p) })
    const base = (asset.value?.name ?? 'image').replace(/\.[^.]+$/, '')
    const file = new File([png], `${base} (cut out).png`, { type: 'image/png', lastModified: Date.now() })
    const [created] = await media.importFiles([file])
    if (created) {
      projectStore.replaceAsset(item.id, created.id, created.name)
      editor.engine?.refresh()
      ui.toast('Background removed', 'success', { action: { label: 'Undo', run: () => projectStore.undo() } })
    }
  } catch (error) {
    ui.toast(
      online.value
        ? `Background removal failed: ${error instanceof Error ? error.message : String(error)}`
        : 'The background removal model has to be downloaded once - connect to the internet and try again.',
      'error',
    )
  } finally {
    bgBusy.value = false
    bgProgress.value = null
  }
}

function openCaptions() {
  editor.sidebarTab = 'captions'
  editor.mobilePanel = 'media'
}
</script>

<template>
  <div class="space-y-3">
    <p v-if="standalone" class="text-xs text-muted">
      Smart tools run on this device - your video is never uploaded. Select a clip on the timeline to use them.
    </p>

    <button
      v-if="standalone"
      type="button"
      class="flex w-full items-center gap-3 rounded-xl border border-line bg-panel-2 p-3 text-left hover:border-accent"
      @click="openCaptions"
    >
      <Captions class="size-5 shrink-0 text-accent" />
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-medium">Auto captions</span>
        <span class="block text-[11px] text-muted">Speech recognition with word timing (Whisper, offline after first use)</span>
      </span>
    </button>

    <!-- remove silences -->
    <div class="rounded-xl border border-line bg-panel-2 p-3" :class="hasSound ? '' : 'opacity-60'">
      <div class="flex items-center gap-2">
        <AudioWaveform class="size-5 shrink-0 text-accent" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">Remove silences</p>
          <p class="text-[11px] text-muted">Jump-cuts pauses out of talking clips.</p>
        </div>
      </div>
      <template v-if="hasSound">
        <div v-if="!peaks" class="mt-2">
          <UiButton size="sm" block @click="analyse">Analyse audio</UiButton>
        </div>
        <div v-else class="mt-2 space-y-2">
          <UiSlider
            v-model="thresholdDb"
            label="Silence below"
            :min="-60"
            :max="-15"
            :step="1"
            :format="(v) => `${v} dB`"
          />
          <UiSlider
            v-model="minPause"
            label="Shortest pause"
            :min="0.15"
            :max="2"
            :step="0.05"
            :format="(v) => `${v.toFixed(2)} s`"
          />
          <p class="text-[11px] text-muted">
            Found <span class="text-fg">{{ silences.length }}</span> pause{{ silences.length === 1 ? '' : 's' }} ·
            <span class="text-fg">{{ silentSeconds.toFixed(1) }}s</span>
          </p>
          <UiButton size="sm" variant="primary" block :icon="Scissors" :disabled="silences.length === 0" @click="cutSilences">
            Cut {{ silences.length }} pause{{ silences.length === 1 ? '' : 's' }}
          </UiButton>
          <p class="text-[10px] text-subtle">Only this clip's track is shortened - generate captions afterwards.</p>
        </div>
      </template>
      <p v-else class="mt-2 text-[11px] text-subtle">Select a video or audio clip with sound.</p>
    </div>

    <!-- auto enhance -->
    <div class="rounded-xl border border-line bg-panel-2 p-3" :class="isVisualMedia ? '' : 'opacity-60'">
      <div class="flex items-center gap-2">
        <Wand2 class="size-5 shrink-0 text-accent" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">Auto enhance</p>
          <p class="text-[11px] text-muted">Fixes exposure, contrast and dull colours.</p>
        </div>
        <UiButton size="sm" :disabled="!isVisualMedia" @click="autoEnhance">Apply</UiButton>
      </div>
    </div>

    <!-- background removal -->
    <div class="rounded-xl border border-line bg-panel-2 p-3" :class="item?.type === 'image' ? '' : 'opacity-60'">
      <div class="flex items-center gap-2">
        <Eraser class="size-5 shrink-0 text-accent" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium">Remove background</p>
          <p class="text-[11px] text-muted">Cuts people and objects out of photos (~25 MB model, once).</p>
        </div>
        <UiButton size="sm" :disabled="item?.type !== 'image' || bgBusy" :loading="bgBusy" @click="cutOutBackground">Run</UiButton>
      </div>
      <p v-if="bgProgress" class="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
        <Loader2 class="size-3 animate-spin" />
        {{ bgProgress.phase === 'model' ? `Downloading model ${Math.round(bgProgress.ratio * 100)}%` : 'Processing…' }}
      </p>
      <p v-else-if="item && item.type !== 'image'" class="mt-2 text-[11px] text-subtle">Works on photo clips.</p>
    </div>
  </div>
</template>
