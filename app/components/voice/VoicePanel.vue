<script setup>
/**
 * Text to speech with several speakers - write a dialogue like
 *   A: Hi!
 *   B: Hello there.
 * and each line is spoken by that speaker's voice and placed on a new audio
 * track, one after another (optionally with captions).
 */
import { Loader2, Mic, Play, Plus, Trash2, UserRound } from 'lucide-vue-next'
import { distributeWords, wordsToPhrases } from '~/core/captions'
import { createItemFromAsset } from '~/core/model/defaults'
import { addTrack, insertItem } from '~/core/operations/items'
import { TTS_VOICES, canSpeak, parseScript, speak, storedVoices } from '~/services/ai/tts'
import { useCaptionsStore } from '~/stores/captions'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const STORAGE_KEY = 'clip:voice-panel'
const projectStore = useProjectStore()
const editor = useEditorStore()
const media = useMediaStore()
const captions = useCaptionsStore()
const ui = useUiStore()
const online = useOnline()

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (raw && Array.isArray(raw.speakers) && raw.speakers.length) return raw
  } catch {
    // ignore
  }
  return {
    speakers: [
      { name: 'A', voiceId: 'pl_PL-gosia-medium', pitch: 0, rate: 1 },
      { name: 'B', voiceId: 'pl_PL-darkman-medium', pitch: 0, rate: 1 },
    ],
    script: 'A: Cześć! Co dziś nagrywamy?\nB: Szybką rolkę o naszej nowej aplikacji.',
    gap: 0.25,
    withCaptions: true,
  }
}
const state = reactive(load())
watch(
  state,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // optional
    }
  },
  { deep: true },
)

const languages = computed(() => {
  const groups = new Map()
  for (const v of TTS_VOICES) {
    if (!groups.has(v.lang)) groups.set(v.lang, [])
    groups.get(v.lang).push(v)
  }
  return [...groups.entries()]
})

const stored = ref([])
onMounted(async () => {
  stored.value = await storedVoices()
})

const lines = computed(() => parseScript(state.script))

/** Speaker of a line: matched by name, otherwise the first speaker. */
function speakerFor(name) {
  return state.speakers.find((s) => s.name.toLowerCase() === (name ?? '').toLowerCase()) ?? state.speakers[0]
}

const unknownNames = computed(() => {
  const names = new Set()
  for (const line of lines.value) if (line.speaker && !state.speakers.some((s) => s.name.toLowerCase() === line.speaker.toLowerCase())) names.add(line.speaker)
  return [...names]
})

function addSpeaker(name) {
  const used = new Set(state.speakers.map((s) => s.voiceId))
  const voice = TTS_VOICES.find((v) => !used.has(v.id)) ?? TTS_VOICES[0]
  state.speakers.push({ name: name ?? String.fromCharCode(65 + state.speakers.length), voiceId: voice.id, pitch: 0, rate: 1 })
}

const busy = ref(false)
const progress = ref(null)
let audio = null

async function testVoice(speaker) {
  if (busy.value) return
  busy.value = true
  progress.value = { label: `Preparing ${speaker.name}…`, ratio: 0 }
  try {
    const wav = await speak({ text: speaker.voiceId.startsWith('pl') ? 'Cześć, tak brzmi mój głos.' : 'Hi, this is how I sound.', voiceId: speaker.voiceId, pitch: speaker.pitch, rate: speaker.rate }, onProgress)
    stored.value = await storedVoices()
    audio?.pause()
    audio = new Audio(URL.createObjectURL(wav))
    void audio.play()
  } catch (error) {
    reportError(error)
  } finally {
    busy.value = false
    progress.value = null
  }
}

function onProgress(p) {
  progress.value = { ...progress.value, ratio: p.ratio, phase: p.phase }
}

function reportError(error) {
  const message = error instanceof Error ? error.message : String(error)
  const network = !online.value || /fetch|network|load/i.test(message)
  ui.toast(
    network
      ? 'Could not download the voice. Voices are downloaded once (huggingface.co, cdn.jsdelivr.net, cdnjs) - check the internet connection and try again.'
      : `Voice generation failed: ${message}`,
    'error',
  )
}

async function generate() {
  if (busy.value || !projectStore.project) return
  const todo = lines.value.filter((l) => l.text)
  if (!todo.length) {
    ui.toast('Write at least one line', 'info')
    return
  }
  busy.value = true
  const files = []
  try {
    for (let i = 0; i < todo.length; i++) {
      const line = todo[i]
      const speaker = speakerFor(line.speaker)
      progress.value = { label: `Line ${i + 1} of ${todo.length} · ${speaker.name}`, ratio: 0 }
      const wav = await speak({ text: line.text, voiceId: speaker.voiceId, pitch: speaker.pitch, rate: speaker.rate }, onProgress)
      files.push({ file: new File([wav], `Voice ${speaker.name} ${i + 1}.wav`, { type: 'audio/wav', lastModified: Date.now() }), line })
    }
    stored.value = await storedVoices()
    progress.value = { label: 'Adding to the timeline…', ratio: 1 }
    const assets = await media.importFiles(files.map((f) => f.file))
    if (assets.length !== files.length) throw new Error('Some lines could not be imported')

    // Place the lines one after another on a new audio track.
    let cursor = editor.currentTime()
    const phrases = []
    const placed = projectStore.mutate('Add voice-over', (draft) => {
      const track = addTrack(draft, 'audio')
      track.name = `Voice ${draft.tracks.filter((t) => t.kind === 'audio').length}`
      const ids = []
      assets.forEach((asset, i) => {
        const item = createItemFromAsset(asset, cursor)
        item.name = `${files[i].line.speaker ?? state.speakers[0].name}: ${files[i].line.text.slice(0, 30)}`
        const inserted = insertItem(draft, track.id, item, { exact: true })
        if (inserted) {
          ids.push(inserted.id)
          phrases.push(...wordsToPhrases(distributeWords(files[i].line.text, cursor + 0.05, cursor + Math.max(0.2, item.duration - 0.05))))
          cursor += item.duration + state.gap
        }
      })
      return ids
    })
    if (state.withCaptions && phrases.length) captions.addPhrases(phrases)
    editor.engine?.refresh()
    ui.toast(`Added ${placed?.length ?? 0} voice line${placed?.length === 1 ? '' : 's'}`, 'success', { action: { label: 'Undo', run: () => projectStore.undo() } })
  } catch (error) {
    reportError(error)
  } finally {
    busy.value = false
    progress.value = null
  }
}
</script>

<template>
  <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
    <p class="text-xs text-muted">
      Text to speech on your device. Write lines as <span class="font-mono text-fg">A: text</span> - every speaker gets a voice. Voices download once (~20–60 MB) and then work offline.
    </p>
    <p v-if="!canSpeak()" class="rounded-lg bg-warn/10 p-2 text-xs text-warn">This browser cannot store voices (no private file system). Try Chrome, Edge or the Android app.</p>

    <!-- speakers -->
    <div class="space-y-2">
      <div v-for="(speaker, i) in state.speakers" :key="i" class="rounded-xl border border-line bg-panel-2 p-2.5">
        <div class="flex items-center gap-2">
          <UserRound class="size-4 shrink-0 text-accent" />
          <input v-model="speaker.name" class="field h-8 w-16 font-semibold" maxlength="24" aria-label="Speaker name" />
          <select v-model="speaker.voiceId" class="field h-8 min-w-0 flex-1" aria-label="Voice">
            <optgroup v-for="[lang, voices] in languages" :key="lang" :label="lang">
              <option v-for="v in voices" :key="v.id" :value="v.id">{{ v.label }} ({{ v.gender }}){{ stored.includes(v.id) ? ' ✓' : '' }}</option>
            </optgroup>
          </select>
          <UiIconButton :icon="Play" label="Test voice" size="sm" :disabled="busy" @click="testVoice(speaker)" />
          <UiIconButton v-if="state.speakers.length > 1" :icon="Trash2" label="Remove speaker" size="sm" @click="state.speakers.splice(i, 1)" />
        </div>
        <div class="mt-1 grid grid-cols-2 gap-2">
          <UiSlider v-model="speaker.pitch" label="Pitch" :min="-6" :max="6" :step="0.5" :format="(v) => `${v > 0 ? '+' : ''}${v} st`" />
          <UiSlider v-model="speaker.rate" label="Speed" :min="0.6" :max="1.8" :step="0.05" :format="(v) => `${v.toFixed(2)}×`" />
        </div>
      </div>
      <UiButton size="sm" block :icon="Plus" @click="addSpeaker()">Add speaker</UiButton>
      <p v-if="unknownNames.length" class="text-[11px] text-warn">
        Unknown speaker{{ unknownNames.length > 1 ? 's' : '' }}: {{ unknownNames.join(', ') }} -
        <button type="button" class="underline" @click="unknownNames.forEach((n) => addSpeaker(n))">add</button> (otherwise {{ state.speakers[0]?.name }} reads them).
      </p>
    </div>

    <!-- script -->
    <label class="block">
      <span class="label">Script</span>
      <textarea v-model="state.script" rows="7" class="field h-auto py-1.5 leading-snug" placeholder="A: Hello!&#10;B: Hi, how are you?" />
    </label>
    <p class="text-[11px] text-muted">{{ lines.length }} line{{ lines.length === 1 ? '' : 's' }} · placed from the playhead on a new audio track.</p>

    <UiSlider v-model="state.gap" label="Pause between lines" :min="0" :max="1.5" :step="0.05" :format="(v) => `${v.toFixed(2)} s`" />
    <UiSwitch v-model="state.withCaptions" label="Add captions for the lines" />

    <UiButton variant="primary" block :icon="busy ? Loader2 : Mic" :disabled="busy || !lines.length" @click="generate">
      {{ busy ? 'Working…' : 'Generate voice-over' }}
    </UiButton>
    <div v-if="progress" class="rounded-lg bg-panel-2 p-2 text-[11px] text-muted">
      <p>{{ progress.label }}{{ progress.phase === 'download' ? ` · downloading voice ${Math.round((progress.ratio ?? 0) * 100)}%` : progress.phase === 'speaking' ? ' · speaking…' : '' }}</p>
      <div class="mt-1 h-1 overflow-hidden rounded bg-line"><div class="h-full bg-accent transition-[width]" :style="{ width: `${Math.round((progress.ratio ?? 0) * 100)}%` }" /></div>
    </div>
  </div>
</template>
