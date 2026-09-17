import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { parseSubtitles, textToPhrases, wordsToPhrases } from '~/core/captions'
import { CAPTION_PRESETS, defaultCaptionStyle, defaultTextAnimation } from '~/core/model/defaults'
import * as captionOps from '~/core/operations/text'
import { mediaLibrary } from '~/services/media/mediaLibrary'
import { transcribeMedia } from '~/services/captions/transcribe'
import { useEditorStore } from './editor'
import { useProjectStore } from './project'
import { useUiStore } from './ui'

/**
 * Captions: importing (SRT / pasted text / local speech recognition), styling
 * and editing. The phrases themselves live on a dedicated captions track in the
 * project, so undo/redo and autosave work like for any other clip.
 */
export const useCaptionsStore = defineStore('captions', () => {
  const style = ref(defaultCaptionStyle())
  const animation = ref(defaultTextAnimation({ in: { kind: 'pop', duration: 0.18 }, out: { kind: 'none', duration: 0 } }))
  const position = ref({ x: 0.5, y: 0.78 })
  const wordsPerPhrase = ref(4)

  /** @type {import('vue').Ref<{ status: 'idle'|'decoding'|'model'|'transcribing'|'done'|'error', ratio: number, message: string }>} */
  const transcription = ref({ status: 'idle', ratio: 0, message: '' })
  let abortController = null

  const items = computed(() => {
    const project = useProjectStore().project
    return project ? captionOps.captionItems(project) : []
  })
  const count = computed(() => items.value.length)

  /** Picks up the look of the captions that are already in the project. */
  function syncFromProject() {
    const first = items.value[0]
    if (!first) return
    style.value = { ...first.style }
    animation.value = { in: { ...first.animation.in }, out: { ...first.animation.out } }
    position.value = { x: first.transform.x, y: first.transform.y }
  }

  function currentOptions() {
    return { style: { ...style.value }, animation: { in: { ...animation.value.in }, out: { ...animation.value.out } }, position: { ...position.value } }
  }

  /**
   * @param {import('~/core/captions').CaptionPhrase[]} phrases
   * @param {{ replace?: boolean }} [options]
   */
  function addPhrases(phrases, options = {}) {
    const projectStore = useProjectStore()
    if (phrases.length === 0) return []
    const created = projectStore.mutate(
      options.replace ? 'Replace captions' : 'Add captions',
      (draft) =>
        options.replace
          ? captionOps.replaceCaptions(draft, phrases, currentOptions())
          : captionOps.appendCaptions(draft, phrases, currentOptions()),
    )
    useEditorStore().engine?.refresh()
    return created ?? []
  }

  /** Imports an .srt / .vtt subtitle file. */
  async function importSubtitleFile(file) {
    const ui = useUiStore()
    const content = await file.text()
    const phrases = parseSubtitles(content)
    if (phrases.length === 0) {
      // Not a subtitle file after all - treat it as plain text.
      return importText(content)
    }
    const created = addPhrases(phrases, { replace: false })
    ui.toast(`Imported ${created.length} captions from "${file.name}"`, 'success')
    return created
  }

  /**
   * Turns pasted text into evenly timed phrases starting at the playhead.
   * @param {string} text
   * @param {{ start?: number, totalDuration?: number, replace?: boolean }} [options]
   */
  function importText(text, options = {}) {
    const ui = useUiStore()
    const editor = useEditorStore()
    const phrases = textToPhrases(text, {
      start: options.start ?? editor.currentTime(),
      wordsPerPhrase: wordsPerPhrase.value,
      totalDuration: options.totalDuration,
    })
    if (phrases.length === 0) {
      ui.toast('There is no text to add', 'info')
      return []
    }
    const created = addPhrases(phrases, { replace: options.replace })
    ui.toast(`Added ${created.length} captions - fine-tune the timing in the captions panel`, 'success')
    return created
  }

  /**
   * Generates captions from an audio or video asset using a local speech model.
   * @param {string} assetId
   * @param {{ model?: string, language?: string, replace?: boolean, offset?: number }} [options]
   */
  async function transcribeAsset(assetId, options = {}) {
    const ui = useUiStore()
    const blob = mediaLibrary.getBlob(assetId)
    if (!blob) {
      ui.toast('That media file is not available on this device', 'error')
      return []
    }
    abortController = new AbortController()
    transcription.value = { status: 'decoding', ratio: 0, message: 'Reading audio…' }
    try {
      const { words } = await transcribeMedia(blob, {
        model: options.model,
        language: options.language,
        signal: abortController.signal,
        onProgress: ({ phase, ratio }) => {
          const message =
            phase === 'decoding'
              ? 'Reading audio…'
              : phase === 'model'
                ? 'Downloading the speech model (one time)…'
                : phase === 'transcribing'
                  ? 'Recognising speech…'
                  : 'Done'
          transcription.value = { status: phase === 'done' ? 'done' : phase, ratio, message }
        },
      })
      if (words.length === 0) {
        transcription.value = { status: 'idle', ratio: 0, message: '' }
        ui.toast('No speech was recognised in this file', 'warning')
        return []
      }
      const offset = options.offset ?? 0
      const shifted = words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }))
      const phrases = wordsToPhrases(shifted, { maxWords: wordsPerPhrase.value })
      const created = addPhrases(phrases, { replace: options.replace })
      transcription.value = { status: 'done', ratio: 1, message: `${created.length} captions` }
      ui.toast(`Generated ${created.length} captions from speech`, 'success')
      return created
    } catch (error) {
      const aborted = error?.name === 'AbortError'
      transcription.value = { status: aborted ? 'idle' : 'error', ratio: 0, message: aborted ? '' : String(error?.message ?? error) }
      if (!aborted) ui.toast(`Transcription failed: ${error?.message ?? error}`, 'error')
      return []
    } finally {
      abortController = null
    }
  }

  function cancelTranscription() {
    abortController?.abort()
  }

  /** Applies a preset (style + animation + position) to every caption. */
  function applyPreset(preset) {
    style.value = { ...preset.style }
    animation.value = { in: { ...preset.animation.in }, out: { ...preset.animation.out } }
    if (preset.position) position.value = { ...preset.position }
    restyleAll()
  }

  function updateStyle(patch, coalesceKey) {
    style.value = { ...style.value, ...patch }
    restyleAll(coalesceKey)
  }

  function updateAnimation(patch) {
    animation.value = { in: { ...animation.value.in, ...(patch.in ?? {}) }, out: { ...animation.value.out, ...(patch.out ?? {}) } }
    restyleAll()
  }

  function setPosition(next) {
    position.value = { ...position.value, ...next }
    restyleAll('caption-position')
  }

  function restyleAll(coalesceKey) {
    const projectStore = useProjectStore()
    if (!projectStore.project || count.value === 0) return
    projectStore.mutate(
      'Restyle captions',
      (draft) => captionOps.restyleCaptions(draft, { style: style.value, animation: animation.value, position: position.value }),
      { coalesceKey: coalesceKey ?? 'caption-style' },
    )
    useEditorStore().engine?.refresh()
  }

  function saveAsPreset(name) {
    const projectStore = useProjectStore()
    projectStore.mutate(
      'Save caption preset',
      (draft) => {
        draft.savedCaptionStyles = [
          ...(draft.savedCaptionStyles ?? []).filter((p) => p.id !== name),
          { id: name, label: name, style: { ...style.value }, animation: { in: { ...animation.value.in }, out: { ...animation.value.out } }, position: { ...position.value } },
        ]
      },
      { history: false },
    )
  }

  function clearAll() {
    const projectStore = useProjectStore()
    projectStore.mutate('Remove captions', (draft) => captionOps.clearCaptions(draft))
    useEditorStore().engine?.refresh()
  }

  function shiftAll(delta) {
    const projectStore = useProjectStore()
    projectStore.mutate('Shift captions', (draft) => captionOps.shiftCaptions(draft, delta), { coalesceKey: 'caption-shift' })
    useEditorStore().engine?.refresh()
  }

  const presets = computed(() => {
    const saved = useProjectStore().project?.savedCaptionStyles ?? []
    return [...CAPTION_PRESETS, ...saved]
  })

  return {
    style,
    animation,
    position,
    wordsPerPhrase,
    transcription,
    items,
    count,
    presets,
    syncFromProject,
    addPhrases,
    importSubtitleFile,
    importText,
    transcribeAsset,
    cancelTranscription,
    applyPreset,
    updateStyle,
    updateAnimation,
    setPosition,
    saveAsPreset,
    clearAll,
    shiftAll,
  }
})
