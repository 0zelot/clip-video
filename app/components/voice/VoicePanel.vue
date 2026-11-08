<script setup>
/**
 * Text to speech with several speakers - write a dialogue like
 *   A: Hi!
 *   B: Hello there.
 * and each line is spoken by that speaker's voice and placed on a new audio
 * track, one after another (optionally with captions).
 */
import { AudioLines, ChevronDown, Loader2, Mic, Play, Plus, Square, Trash2, UserRound, Wand2 } from 'lucide-vue-next'
import { distributeWords, wordsToPhrases, wordsToSentences } from '~/core/captions'
import { createItemFromAsset } from '~/core/model/defaults'
import { addTrack, insertItem } from '~/core/operations/items'
import { TTS_VOICES, canSpeak, parseScript, speak, storedVoices } from '~/services/ai/tts'
import { VOICE_EFFECTS, VOICE_PRESETS, formatAt, wavDuration } from '~/services/ai/voiceFx'
import { WHISPER_MODELS, canTranscribe, transcribeMedia } from '~/services/captions/transcribe'
import { mediaLibrary } from '~/services/media/mediaLibrary'
import { useCaptionsStore } from '~/stores/captions'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

/** Older versions kept one dialogue for all projects here. */
const LEGACY_STORAGE_KEY = 'clip:voice-panel'
const SAVE_DELAY_MS = 400
const projectStore = useProjectStore()
const editor = useEditorStore()
const media = useMediaStore()
const captions = useCaptionsStore()
const ui = useUiStore()
const online = useOnline()

const COLORS = ['#2ee6d6', '#ff7ab6', '#ffd166', '#8ab4ff', '#9dffb0', '#ff9f5a']
const speakerDefaults = (s, i) => ({ pitch: 0, rate: 1, effect: 'none', mix: 0.8, volume: 0, sample: '', open: false, color: COLORS[i % COLORS.length], ...s })
const SCRIPT_PLACEHOLDER = 'A: Cześć! Co dziś nagrywamy?\nB: Szybką rolkę o naszej nowej aplikacji.\nA [+2, fast]: Serio? Lecimy!\nB [radio]: Tu radio Clip, nadajemy na żywo.'

function freshState() {
  return {
    speakers: [
      speakerDefaults({ name: 'A', voiceId: 'pl_PL-gosia-medium' }, 0),
      speakerDefaults({ name: 'B', voiceId: 'pl_PL-darkman-medium' }, 1),
    ],
    script: '',
    gap: 0.25,
    withCaptions: true,
    /** Voice-over of the speech in a clip: source, language of the lines, original audio level. */
    fromSpeech: { assetId: '', translate: false, model: WHISPER_MODELS[0].id, duck: 0.3 },
  }
}

function parseStored(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.speakers) || !raw.speakers.length) return null
  const fresh = freshState()
  return { ...fresh, ...raw, speakers: raw.speakers.map(speakerDefaults), fromSpeech: { ...fresh.fromSpeech, ...(raw.fromSpeech ?? {}) } }
}

/** A line read faster than this to fit before the next one would sound rushed - it is pushed later instead. */
const MAX_FIT_RATE = 1.3

/**
 * The global dialogue of older versions belongs to the project that already
 * contains voice lines generated from it (they are named "A: <line text>").
 */
function claimLegacyState(project) {
  let legacy = null
  try {
    legacy = parseStored(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? 'null'))
  } catch {
    return null
  }
  if (!legacy || !project) return null
  const lineTexts = new Set(parseScript(legacy.script ?? '').map((l) => l.text.slice(0, 30)))
  const owns = project.tracks.some((t) => t.items.some((i) => typeof i.name === 'string' && lineTexts.has(i.name.slice(i.name.indexOf(': ') + 2))))
  if (!owns) return null
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // optional
  }
  return legacy
}

/** Every project has its own dialogue - a new project starts empty. */
function loadState() {
  const project = projectStore.project
  return parseStored(project?.voiceover) ?? claimLegacyState(project) ?? freshState()
}

const state = reactive(loadState())
let loadedProjectId = projectStore.project?.id ?? null
let saveTimer = null

function saveNow() {
  clearTimeout(saveTimer)
  saveTimer = null
  const project = projectStore.project
  if (!project || project.id !== loadedProjectId) return
  const json = JSON.stringify(state)
  if (json === JSON.stringify(project.voiceover ?? null)) return
  const snapshot = JSON.parse(json)
  projectStore.mutate('Edit voice-over', (p) => void (p.voiceover = snapshot), { history: false })
}

watch(state, () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS)
}, { deep: true })

watch(
  () => projectStore.project?.id,
  (id) => {
    if (id === loadedProjectId) return
    clearTimeout(saveTimer)
    saveTimer = null
    loadedProjectId = id ?? null
    stopPlayback()
    Object.assign(state, loadState())
  },
)
onBeforeUnmount(() => {
  if (saveTimer) saveNow()
})

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

// ----- voice-over of the speech in a clip ---------------------------------------

const GENERATED_VOICE = /^Voice .+ \d+\.wav$/

/** Clips on the timeline that have sound (our own generated voice lines excluded). */
const speechSources = computed(() => {
  const project = projectStore.project
  if (!project) return []
  const seen = new Map()
  for (const item of project.tracks.flatMap((t) => t.items)) {
    if (item.type !== 'video' && item.type !== 'audio') continue
    const asset = project.assets[item.assetId]
    if (!asset || asset.hasAudio === false || seen.has(asset.id) || GENERATED_VOICE.test(asset.name ?? '')) continue
    if (media.status[asset.id] !== 'ready') continue
    seen.set(asset.id, { asset, offset: Math.max(0, item.start - item.sourceIn) })
  }
  return [...seen.values()]
})
const speechSource = computed(() => speechSources.value.find((s) => s.asset.id === state.fromSpeech.assetId) ?? speechSources.value[0] ?? null)
const speechOpen = ref(!state.script.trim())
const canListen = canTranscribe()
const listening = ref(false)
let speechAbort = null

const SPEECH_PHASES = { decoding: 'Reading the audio…', model: 'Downloading the speech model (one time)…', transcribing: 'Recognising speech…' }

/** Recognises the speech of the chosen clip and writes it into the script as timed lines. */
async function scriptFromSpeech() {
  const source = speechSource.value
  if (!source || busy.value) return
  const blob = mediaLibrary.getBlob(source.asset.id)
  if (!blob) {
    ui.toast('That media file is not available on this device', 'error')
    return
  }
  if (state.script.trim()) {
    const ok = await ui.confirm({ title: 'Replace the script?', message: 'The current lines are replaced by the speech of the clip.', confirmLabel: 'Replace' })
    if (!ok) return
  }
  stopPlayback()
  busy.value = true
  listening.value = true
  speechAbort = new AbortController()
  const translate = !!state.fromSpeech.translate
  try {
    const result = await transcribeMedia(blob, {
      model: state.fromSpeech.model,
      task: translate ? 'translate' : 'transcribe',
      signal: speechAbort.signal,
      onProgress: ({ phase, ratio }) => (progress.value = { label: SPEECH_PHASES[phase] ?? 'Done', ratio }),
    })
    const shifted = result.words.map((w) => ({ ...w, start: w.start + source.offset, end: w.end + source.offset }))
    const sentences = wordsToSentences(shifted)
    if (!sentences.length) {
      ui.toast('No speech was recognised in this clip', 'warning')
      return
    }
    const speaker = state.speakers[0]
    // A Polish voice reading English (or the other way round) sounds wrong - switch to a matching voice.
    const target = translate ? 'en' : result.language
    let note = ''
    if (target && speaker && !speaker.voiceId.startsWith(`${target}_`)) {
      const voice = TTS_VOICES.find((v) => v.id.startsWith(`${target}_`))
      if (voice) {
        speaker.voiceId = voice.id
        note = ` ${speaker.name} now speaks with ${voice.label} (${voice.lang}).`
      }
    }
    state.fromSpeech.assetId = source.asset.id
    state.script = sentences.map((s) => `${speaker?.name ?? 'A'} [at ${formatAt(s.start)}]: ${s.text}`).join('\n')
    ui.toast(`${sentences.length} lines written from the speech - check the text, then press Generate.${note}`, 'success')
  } catch (error) {
    if (error?.name !== 'AbortError') reportError(error)
  } finally {
    speechAbort = null
    listening.value = false
    busy.value = false
    progress.value = null
  }
}

function cancelSpeech() {
  speechAbort?.abort()
}

function describe(o) {
  const parts = []
  if (o.at != null) parts.push(`at ${formatAt(o.at)}`)
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

// ----- listening -------------------------------------------------------------
//
// Every preview plays on ONE audio element that is started inside each click
// (unlockPlayer). Strict browsers refuse play() on media that was not started
// from a user gesture - with a new element per line only the lines that began
// within ~5 s of the click were heard, then the dialogue raced to the end.

const player = import.meta.client ? new Audio() : null
let playerUrl = null
/** Resolves the playback that is currently running (when it is stopped). */
let finishPlayback = null

function resetPlayer() {
  const finish = finishPlayback
  finishPlayback = null
  if (player) {
    player.onended = player.onpause = player.onerror = null
    player.pause()
    player.removeAttribute('src')
    player.load()
  }
  if (playerUrl) URL.revokeObjectURL(playerUrl)
  playerUrl = null
  finish?.()
}

/** Call synchronously at the start of a click handler, before any await. */
function unlockPlayer() {
  resetPlayer()
  if (!player) return
  try {
    player.play().catch(() => {})
    player.pause()
  } catch {
    // nothing to unlock
  }
}

class PlaybackBlockedError extends Error {}

/** Plays a WAV and resolves when it has finished or was stopped. */
function playBlob(blob) {
  resetPlayer()
  if (!player) return Promise.resolve()
  playerUrl = URL.createObjectURL(blob)
  player.src = playerUrl
  return new Promise((resolve, reject) => {
    finishPlayback = resolve
    player.onended = resolve
    player.onpause = resolve
    player.onerror = () => reject(new Error('This audio could not be played'))
    player.play().catch((error) => {
      if (error?.name === 'NotAllowedError') reject(new PlaybackBlockedError('The browser blocked playback - press play again'))
      // AbortError: stopped before it started - already resolved by resetPlayer
    })
  })
}

const playingKey = ref(null)
async function previewLine(line, index) {
  if (playingKey.value === index) return stopPlayback()
  if (busy.value) return
  stopPlayback()
  unlockPlayer()
  busy.value = true
  progress.value = { label: `Line ${index + 1}`, ratio: 0 }
  try {
    const wav = await speak({ text: line.text, ...settingsFor(line) }, onProgress)
    stored.value = await storedVoices()
    busy.value = false
    progress.value = null
    await play(wav, index)
  } catch (error) {
    reportError(error)
  } finally {
    busy.value = false
    progress.value = null
  }
}

async function play(wav, key) {
  playingKey.value = key
  try {
    await playBlob(wav)
  } finally {
    if (playingKey.value === key) playingKey.value = null
  }
}

const busy = ref(false)
const progress = ref(null)

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
  unlockPlayer()
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
    busy.value = false
    progress.value = null
    await play(wav, key)
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
  unlockPlayer()
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
      await playBlob(wavs[i])
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
  resetPlayer()
  playingKey.value = null
  currentLine.value = -1
}
onBeforeUnmount(stopPlayback)

function onProgress(p) {
  progress.value = { ...progress.value, ratio: p.ratio, phase: p.phase }
}

function reportError(error) {
  if (error instanceof PlaybackBlockedError) {
    ui.toast(error.message, 'warning')
    return
  }
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
      const settings = settingsFor(line)
      let wav = await speak({ text: line.text, ...settings }, onProgress)
      // A timed line that would run into the next one is read a little faster.
      const at = line.overrides?.at
      const nextAt = todo[i + 1]?.overrides?.at
      if (at != null && nextAt != null) {
        const slot = nextAt - at - 0.05
        const length = await wavDuration(wav)
        if (slot > 0.3 && length > slot) wav = await speak({ text: line.text, ...settings, rate: settings.rate * Math.min(MAX_FIT_RATE, length / slot) }, onProgress)
      }
      files.push({ file: new File([wav], `Voice ${speaker.name} ${i + 1}.wav`, { type: 'audio/wav', lastModified: Date.now() }), line })
    }
    stored.value = await storedVoices()
    progress.value = { label: 'Adding to the timeline…', ratio: 1 }
    const assets = await media.importFiles(files.map((f) => f.file))
    if (assets.length !== files.length) throw new Error('Some lines could not be imported')

    // Lines go one after another on a new audio track; a line with a time
    // ([at 0:12.5]) starts there, unless the previous line is still speaking.
    let cursor = editor.currentTime()
    let previousEnd = -Infinity
    const timed = files.some((f) => f.line.overrides?.at != null)
    const duckAssetId = timed && state.fromSpeech.duck < 1 ? state.fromSpeech.assetId : ''
    const phrases = []
    const placed = projectStore.mutate('Add voice-over', (draft) => {
      const track = addTrack(draft, 'audio')
      track.name = `Voice ${draft.tracks.filter((t) => t.kind === 'audio').length}`
      const ids = []
      assets.forEach((asset, i) => {
        const at = files[i].line.overrides?.at
        if (at != null) cursor = Math.max(at, previousEnd + 0.05)
        else cursor += files[i].line.overrides?.pause ?? 0
        const item = createItemFromAsset(asset, cursor)
        item.name = `${speakerFor(files[i].line.speaker).name}: ${files[i].line.text.slice(0, 30)}`
        const inserted = insertItem(draft, track.id, item, { exact: true })
        if (inserted) {
          ids.push(inserted.id)
          phrases.push(...wordsToPhrases(distributeWords(files[i].line.text, cursor + 0.05, cursor + Math.max(0.2, item.duration - 0.05))))
          previousEnd = cursor + item.duration
          cursor = previousEnd + state.gap
        }
      })
      // Lektor style: the original stays audible, quieter, under the voice-over.
      if (duckAssetId && ids.length) {
        for (const t of draft.tracks) {
          for (const it of t.items) {
            if (it.assetId === duckAssetId && it.audio) it.audio.volume = Math.min(it.audio.volume, state.fromSpeech.duck)
          }
        }
      }
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
      Text to speech on your device. Write lines as <span class="font-mono text-fg">A: text</span> - every speaker gets a voice. Voices download once (~20–115 MB) and then work offline.
    </p>
    <p v-if="!canSpeak()" class="rounded-lg bg-warn/10 p-2 text-xs text-warn">This browser cannot store voices (no private file system). Try Chrome, Edge or the Android app.</p>

    <!-- voice-over of the speech in a clip -->
    <div class="rounded-xl border border-line bg-panel-2 p-2.5">
      <button type="button" class="flex w-full items-center gap-1.5 text-left text-xs font-medium" :aria-expanded="speechOpen" @click="speechOpen = !speechOpen">
        <AudioLines class="size-4 shrink-0 text-accent" />
        <span class="flex-1">Voice-over from the video's speech</span>
        <ChevronDown class="size-4 text-muted transition-transform" :class="speechOpen ? 'rotate-180' : ''" />
      </button>
      <div v-if="speechOpen" class="mt-2 space-y-2">
        <p class="text-[11px] text-muted">
          Recognises what is said in a clip (on this device), writes it below as timed lines and reads them with your voice at the same moments - like a lektor. Edit or translate the lines before generating.
        </p>
        <template v-if="speechSources.length">
          <label class="block">
            <span class="label">Clip with speech</span>
            <select :value="speechSource?.asset.id" class="field" @change="state.fromSpeech.assetId = $event.target.value">
              <option v-for="s in speechSources" :key="s.asset.id" :value="s.asset.id">{{ s.asset.name }}</option>
            </select>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="label">Lines in</span>
              <select v-model="state.fromSpeech.translate" class="field">
                <option :value="false">Spoken language</option>
                <option :value="true">English (translated)</option>
              </select>
            </label>
            <label class="block">
              <span class="label">Recognition</span>
              <select v-model="state.fromSpeech.model" class="field">
                <option v-for="m in WHISPER_MODELS" :key="m.id" :value="m.id">{{ m.label }} · {{ m.size }}</option>
              </select>
            </label>
          </div>
          <UiSlider
            v-model="state.fromSpeech.duck"
            label="Original sound under the voice-over"
            :min="0"
            :max="1"
            :step="0.05"
            :format="(v) => (v >= 1 ? 'unchanged' : v <= 0 ? 'muted' : `${Math.round(v * 100)}%`)"
          />
          <UiButton v-if="listening" size="sm" block variant="danger" :icon="Square" @click="cancelSpeech">Stop recognising</UiButton>
          <UiButton v-else size="sm" block variant="primary" :icon="Wand2" :disabled="busy || !canListen" @click="scriptFromSpeech">Write the lines from the speech</UiButton>
          <p v-if="!canListen" class="text-[11px] text-warn">This browser cannot run the speech model.</p>
        </template>
        <p v-else class="text-[11px] text-warn">Add a video or audio clip with sound to the timeline first.</p>
      </div>
    </div>

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
      <textarea v-model="state.script" rows="7" class="field h-auto py-1.5 leading-snug" :placeholder="SCRIPT_PLACEHOLDER" />
    </label>
    <p class="text-[11px] text-muted">
      Change the voice of a single line in brackets: <span class="font-mono text-fg">B [+3, 1.2x, echo]: Really?!</span> -
      pitch (<span class="font-mono">+3</span>, <span class="font-mono">high</span>/<span class="font-mono">low</span>), tempo (<span class="font-mono">1.2x</span>, <span class="font-mono">fast</span>/<span class="font-mono">slow</span>), an effect, <span class="font-mono">loud</span>/<span class="font-mono">quiet</span>, <span class="font-mono">pause 1</span>, a start time <span class="font-mono">at 0:12.5</span>.
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
    <p class="text-[11px] text-muted">
      {{ lines.length }} line{{ lines.length === 1 ? '' : 's' }} · placed on a new audio track -
      {{ lines.some((l) => l.overrides?.at != null) ? 'lines with [at …] at their time, the others after them.' : 'from the playhead, one after another.' }}
    </p>

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
