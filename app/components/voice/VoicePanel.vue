<script setup>
/**
 * Text to speech with several speakers - write a dialogue like
 *   A: Hi!
 *   B: Hello there.
 * and each line is spoken by that speaker's voice and placed on a new audio
 * track, one after another (optionally with captions).
 */
import { ChevronDown, Loader2, Mic, Play, Plus, Square, Trash2, UserRound } from 'lucide-vue-next'
import { distributeWords, wordsToPhrases } from '~/core/captions'
import { createItemFromAsset } from '~/core/model/defaults'
import { addTrack, insertItem } from '~/core/operations/items'
import { TTS_VOICES, canSpeak, parseScript, speak, storedVoices } from '~/services/ai/tts'
import { VOICE_EFFECTS, VOICE_PRESETS } from '~/services/ai/voiceFx'
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

const COLORS = ['#2ee6d6', '#ff7ab6', '#ffd166', '#8ab4ff', '#9dffb0', '#ff9f5a']
const speakerDefaults = (s, i) => ({ pitch: 0, rate: 1, effect: 'none', mix: 0.8, volume: 0, sample: '', open: false, color: COLORS[i % COLORS.length], ...s })

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (raw && Array.isArray(raw.speakers) && raw.speakers.length) return { ...raw, speakers: raw.speakers.map(speakerDefaults) }
  } catch {
    // ignore
  }
  return {
    speakers: [
      speakerDefaults({ name: 'A', voiceId: 'pl_PL-gosia-medium' }, 0),
      speakerDefaults({ name: 'B', voiceId: 'pl_PL-darkman-medium' }, 1),
    ],
    script: 'A: Cześć! Co dziś nagrywamy?\nB: Szybką rolkę o naszej nowej aplikacji.\nA [+2, fast]: Serio? Lecimy!\nB [radio]: Tu radio Clip, nadajemy na żywo.',
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
  // Prefer an unused voice of the same language as the first speaker.
  const lang = TTS_VOICES.find((v) => v.id === state.speakers[0]?.voiceId)?.lang
  const voice = TTS_VOICES.find((v) => !used.has(v.id) && v.lang === lang) ?? TTS_VOICES.find((v) => !used.has(v.id)) ?? TTS_VOICES[0]
  state.speakers.push(speakerDefaults({ name: name ?? String.fromCharCode(65 + state.speakers.length), voiceId: voice.id, open: true }, state.speakers.length))
}

function applyPreset(speaker, preset) {
  speaker.pitch = preset.pitch
  speaker.rate = preset.rate
  speaker.effect = preset.effect
}

/** Final voice settings of a line: the speaker's, adjusted by the line's [ … ] overrides. */
function settingsFor(line) {
  const speaker = speakerFor(line.speaker)
  const o = line.overrides ?? {}
  return {
    voiceId: speaker.voiceId,
    pitch: (speaker.pitch ?? 0) + (o.pitch ?? 0),
    rate: (speaker.rate ?? 1) * (o.rate ?? 1),
    effect: o.effect ?? speaker.effect ?? 'none',
    mix: speaker.mix ?? 0.8,
    volume: (speaker.volume ?? 0) + (o.volume ?? 0),
  }
}

function describe(o) {
  const parts = []
  if (o.pitch) parts.push(`${o.pitch > 0 ? '+' : ''}${o.pitch} st`)
  if (o.rate) parts.push(`${o.rate}×`)
  if (o.effect) parts.push(o.effect)
  if (o.volume) parts.push(o.volume > 0 ? 'louder' : 'quieter')
  if (o.pause) parts.push(`pause ${o.pause}s`)
  return parts.join(' · ')
}

/** Appends a new line for a speaker to the script. */
function addLine(speaker) {
  state.script = `${state.script.replace(/\s+$/, '')}\n${speaker.name}: `
}

const playingKey = ref(null)
async function previewLine(line, index) {
  if (playingKey.value === index) return stopPlayback()
  if (busy.value) return
  stopPlayback()
  busy.value = true
  progress.value = { label: `Line ${index + 1}`, ratio: 0 }
  try {
    const wav = await speak({ text: line.text, ...settingsFor(line) }, onProgress)
    stored.value = await storedVoices()
    play(wav, index)
  } catch (error) {
    reportError(error)
  } finally {
    busy.value = false
    progress.value = null
  }
}

function play(wav, key) {
  stopPlayback()
  audio = new Audio(URL.createObjectURL(wav))
  playingKey.value = key
  audio.onended = () => (playingKey.value = null)
  void audio.play()
}

const busy = ref(false)
const progress = ref(null)
let audio = null

/** What a speaker says when tested: their own sample text, else their first line in the script. */
function defaultSample(speaker) {
  const line = lines.value.find((l) => speakerFor(l.speaker) === speaker && l.text)
  if (line) return line.text
  return speaker.voiceId.startsWith('pl') ? 'Cześć, tak brzmi mój głos.' : 'Hi, this is how I sound.'
}

function sampleFor(speaker) {
  return speaker.sample?.trim() || defaultSample(speaker)
}

/** Speaks the sample with the speaker's current pitch, tempo, effect and volume. */
async function testVoice(speaker) {
  const key = `speaker-${speaker.name}`
  if (playingKey.value === key) return stopPlayback()
  if (busy.value) return
  stopPlayback()
  busy.value = true
  progress.value = { label: `Preparing ${speaker.name}…`, ratio: 0 }
  try {
    const wav = await speak(
      {
        text: sampleFor(speaker),
        voiceId: speaker.voiceId,
        pitch: speaker.pitch,
        rate: speaker.rate,
        effect: speaker.effect,
        mix: speaker.mix,
        volume: speaker.volume,
      },
      onProgress,
    )
    stored.value = await storedVoices()
    play(wav, key)
  } catch (error) {
    reportError(error)
  } finally {
    busy.value = false
    progress.value = null
  }
}

/** Plays the whole dialogue in order (nothing is added to the timeline). */
let dialogueToken = 0
async function playDialogue() {
  if (playingKey.value === 'all') return stopPlayback()
  if (busy.value) return
  const todo = lines.value.filter((l) => l.text)
  if (!todo.length) return
  stopPlayback()
  const token = ++dialogueToken
  playingKey.value = 'all'
  busy.value = true
  try {
    // Generate everything first (cached afterwards), so playback has no gaps.
    const wavs = []
    for (let i = 0; i < todo.length; i++) {
      progress.value = { label: `Preparing line ${i + 1} of ${todo.length}`, ratio: 0 }
      wavs.push(await speak({ text: todo[i].text, ...settingsFor(todo[i]) }, onProgress))
      if (token !== dialogueToken) return
    }
    stored.value = await storedVoices()
    busy.value = false
    progress.value = null
    for (let i = 0; i < wavs.length; i++) {
      if (token !== dialogueToken) return
      const pause = (todo[i].overrides?.pause ?? 0) + (i > 0 ? state.gap : 0)
      if (pause > 0) await new Promise((r) => setTimeout(r, pause * 1000))
      if (token !== dialogueToken) return
      currentLine.value = lines.value.indexOf(todo[i])
      await new Promise((resolve) => {
        audio = new Audio(URL.createObjectURL(wavs[i]))
        audio.onended = resolve
        audio.onerror = resolve
        audio.onpause = resolve
        void audio.play().catch(resolve)
      })
    }
  } catch (error) {
    reportError(error)
  } finally {
    if (token === dialogueToken) {
      playingKey.value = null
      currentLine.value = -1
      busy.value = false
      progress.value = null
    }
  }
}

const currentLine = ref(-1)

function stopPlayback() {
  dialogueToken++
  audio?.pause()
  audio = null
  playingKey.value = null
  currentLine.value = -1
}
onBeforeUnmount(stopPlayback)

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
  stopPlayback()
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
      const wav = await speak({ text: line.text, ...settingsFor(line) }, onProgress)
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
        cursor += files[i].line.overrides?.pause ?? 0
        const item = createItemFromAsset(asset, cursor)
        item.name = `${speakerFor(files[i].line.speaker).name}: ${files[i].line.text.slice(0, 30)}`
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
      <div v-for="(speaker, i) in state.speakers" :key="i" class="rounded-xl border border-line bg-panel-2 p-2.5" :style="{ borderLeft: `3px solid ${speaker.color}` }">
        <div class="flex items-center gap-1.5">
          <UserRound class="size-4 shrink-0" :style="{ color: speaker.color }" />
          <input v-model="speaker.name" class="field h-8 w-14 font-semibold" maxlength="24" aria-label="Speaker name" />
          <select v-model="speaker.voiceId" class="field h-8 min-w-0 flex-1" aria-label="Voice">
            <optgroup v-for="[lang, voices] in languages" :key="lang" :label="lang">
              <option v-for="v in voices" :key="v.id" :value="v.id">{{ v.label }} ({{ v.gender }}){{ stored.includes(v.id) ? ' ✓' : '' }}</option>
            </optgroup>
          </select>
          <UiIconButton :icon="playingKey === `speaker-${speaker.name}` ? Square : Play" label="Listen to this voice" size="sm" :disabled="busy && playingKey !== `speaker-${speaker.name}`" @click="testVoice(speaker)" />
          <UiIconButton :icon="ChevronDown" :label="speaker.open ? 'Hide voice settings' : 'Voice settings'" size="sm" :class="speaker.open ? 'rotate-180' : ''" @click="speaker.open = !speaker.open" />
        </div>
        <p v-if="!speaker.open" class="mt-1 truncate pl-6 text-[11px] text-muted">
          {{ speaker.pitch ? `${speaker.pitch > 0 ? '+' : ''}${speaker.pitch} st · ` : '' }}{{ speaker.rate !== 1 ? `${speaker.rate.toFixed(2)}× · ` : '' }}{{ VOICE_EFFECTS.find((e) => e.id === speaker.effect)?.label ?? 'Natural' }}
        </p>
        <div v-else class="mt-2 space-y-2">
          <div class="-mx-0.5 flex flex-wrap gap-1">
            <button
              v-for="preset in VOICE_PRESETS"
              :key="preset.id"
              type="button"
              class="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
              @click="applyPreset(speaker, preset)"
            >
              {{ preset.label }}
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <UiSlider v-model="speaker.pitch" label="Pitch" :min="-12" :max="12" :step="0.5" :format="(v) => `${v > 0 ? '+' : ''}${v} st`" />
            <UiSlider v-model="speaker.rate" label="Tempo" :min="0.5" :max="2" :step="0.05" :format="(v) => `${v.toFixed(2)}×`" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="label">Effect</span>
              <select v-model="speaker.effect" class="field">
                <option v-for="e in VOICE_EFFECTS" :key="e.id" :value="e.id">{{ e.label }}</option>
              </select>
            </label>
            <UiSlider v-model="speaker.mix" label="Effect amount" :min="0" :max="1" :step="0.05" :disabled="speaker.effect === 'none'" :format="(v) => `${Math.round(v * 100)}%`" />
          </div>
          <UiSlider v-model="speaker.volume" label="Volume" :min="-18" :max="12" :step="1" :format="(v) => `${v > 0 ? '+' : ''}${v} dB`" />
          <div class="rounded-lg bg-panel-3/50 p-2">
            <label class="block">
              <span class="label">Test text</span>
              <input v-model="speaker.sample" class="field" :placeholder="defaultSample(speaker)" maxlength="300" />
            </label>
            <UiButton
              size="sm"
              block
              class="mt-1.5"
              :variant="playingKey === `speaker-${speaker.name}` ? 'secondary' : 'primary'"
              :icon="playingKey === `speaker-${speaker.name}` ? Square : Play"
              :disabled="busy && playingKey !== `speaker-${speaker.name}`"
              @click="testVoice(speaker)"
            >
              {{ playingKey === `speaker-${speaker.name}` ? 'Stop' : 'Listen with these settings' }}
            </UiButton>
            <p class="mt-1 text-[10px] text-muted">Empty = {{ speaker.name }}'s first line from the script. Change pitch, tempo or the effect and listen again.</p>
          </div>
          <div class="flex justify-between">
            <UiButton size="sm" variant="ghost" @click="addLine(speaker)">+ line for {{ speaker.name }}</UiButton>
            <UiButton v-if="state.speakers.length > 1" size="sm" variant="danger" :icon="Trash2" @click="state.speakers.splice(i, 1)">Remove</UiButton>
          </div>
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
    <p class="text-[11px] text-muted">
      Change the voice of a single line in brackets: <span class="font-mono text-fg">B [+3, 1.2x, echo]: Really?!</span> -
      pitch (<span class="font-mono">+3</span>, <span class="font-mono">high</span>/<span class="font-mono">low</span>), tempo (<span class="font-mono">1.2x</span>, <span class="font-mono">fast</span>/<span class="font-mono">slow</span>), an effect, <span class="font-mono">loud</span>/<span class="font-mono">quiet</span>, <span class="font-mono">pause 1</span>.
    </p>

    <!-- parsed dialogue -->
    <ol v-if="lines.length" class="space-y-1">
      <li v-for="(line, i) in lines" :key="i" class="flex items-start gap-2 rounded-lg px-2 py-1.5" :class="currentLine === i ? 'bg-accent/15 ring-1 ring-accent' : 'bg-panel-2'">
        <span class="mt-0.5 shrink-0 rounded px-1.5 text-[10px] font-bold text-black" :style="{ background: speakerFor(line.speaker)?.color }">{{ speakerFor(line.speaker)?.name }}</span>
        <span class="min-w-0 flex-1 text-xs leading-snug">
          {{ line.text }}
          <span v-if="describe(line.overrides)" class="block text-[10px] text-accent">{{ describe(line.overrides) }}</span>
        </span>
        <UiIconButton :icon="playingKey === i ? Square : Play" label="Listen to this line" size="sm" :disabled="busy && playingKey !== i" @click="previewLine(line, i)" />
      </li>
    </ol>
    <p class="text-[11px] text-muted">{{ lines.length }} line{{ lines.length === 1 ? '' : 's' }} · placed from the playhead on a new audio track.</p>

    <UiSlider v-model="state.gap" label="Pause between lines" :min="0" :max="1.5" :step="0.05" :format="(v) => `${v.toFixed(2)} s`" />
    <UiSwitch v-model="state.withCaptions" label="Add captions for the lines" />

    <UiButton
      block
      :icon="playingKey === 'all' ? Square : Play"
      :disabled="!lines.length || (busy && playingKey !== 'all')"
      @click="playDialogue"
    >
      {{ playingKey === 'all' ? 'Stop' : 'Listen to the whole dialogue' }}
    </UiButton>
    <UiButton variant="primary" block :icon="busy ? Loader2 : Mic" :disabled="busy || !lines.length" @click="generate">
      {{ busy ? 'Working…' : 'Generate voice-over' }}
    </UiButton>
    <div v-if="progress" class="rounded-lg bg-panel-2 p-2 text-[11px] text-muted">
      <p>{{ progress.label }}{{ progress.phase === 'download' ? ` · downloading voice ${Math.round((progress.ratio ?? 0) * 100)}%` : progress.phase === 'speaking' ? ' · speaking…' : '' }}</p>
      <div class="mt-1 h-1 overflow-hidden rounded bg-line"><div class="h-full bg-accent transition-[width]" :style="{ width: `${Math.round((progress.ratio ?? 0) * 100)}%` }" /></div>
    </div>
  </div>
</template>
