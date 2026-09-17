import { useEditorStore } from '~/stores/editor'
import { useUiStore } from '~/stores/ui'
import { useEditorCommands } from './useEditorCommands'

/**
 * Documentation for the "?" dialog. Keep in sync with the handler below.
 * @type {{ keys: string[], description: string, group: string }[]}
 */
export const SHORTCUTS = [
  { group: 'Playback', keys: ['Space'], description: 'Play / pause' },
  { group: 'Playback', keys: ['←', '→'], description: 'Previous / next frame' },
  { group: 'Playback', keys: ['Shift', '←/→'], description: 'Jump 1 second' },
  { group: 'Playback', keys: ['Home', 'End'], description: 'Go to start / end' },
  { group: 'Editing', keys: ['S'], description: 'Split at playhead' },
  { group: 'Editing', keys: ['T'], description: 'Add text at the playhead' },
  { group: 'Editing', keys: ['Ctrl', 'B'], description: 'Split at playhead' },
  { group: 'Editing', keys: ['Delete / Backspace'], description: 'Delete selected clips' },
  { group: 'Editing', keys: ['Ctrl', 'D'], description: 'Duplicate selected clips' },
  { group: 'Editing', keys: ['Ctrl', 'A'], description: 'Select all clips' },
  { group: 'Editing', keys: ['Esc'], description: 'Clear selection' },
  { group: 'Editing', keys: ['I', 'O'], description: 'Set In / Out point' },
  { group: 'Editing', keys: ['Shift', 'Delete'], description: 'Ripple-delete In→Out range' },
  { group: 'Editing', keys: ['N'], description: 'Toggle snapping' },
  { group: 'Project', keys: ['Ctrl', 'Z'], description: 'Undo' },
  { group: 'Project', keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
  { group: 'Project', keys: ['Ctrl', 'Y'], description: 'Redo' },
  { group: 'Project', keys: ['Ctrl', 'S'], description: 'Save' },
  { group: 'Project', keys: ['Ctrl', 'E'], description: 'Export' },
  { group: 'Timeline', keys: ['+', '−'], description: 'Zoom in / out' },
  { group: 'Timeline', keys: ['Ctrl', 'Wheel'], description: 'Zoom around the cursor' },
  { group: 'Help', keys: ['?'], description: 'Show keyboard shortcuts' },
]

function isEditableTarget(target) {
  const el = target
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || el.isContentEditable) return true
  if (tag === 'SELECT') return true
  if (tag === 'INPUT') {
    return !['checkbox', 'radio', 'range', 'button', 'color'].includes(el.type)
  }
  return false
}

export function useKeyboardShortcuts() {
  const commands = useEditorCommands()
  const editor = useEditorStore()
  const ui = useUiStore()

  function onKeydown(e) {
    // Dialogs handle their own keys.
    if (ui.confirmState || ui.promptState || editor.exportOpen) return
    const mod = e.ctrlKey || e.metaKey
    const key = e.key

    // Save works everywhere, even while typing in a field.
    if (mod && key.toLowerCase() === 's') {
      e.preventDefault()
      void commands.save()
      return
    }
    if (isEditableTarget(e.target)) return

    let handled = true
    if (mod) {
      switch (key.toLowerCase()) {
        case 'z':
          if (e.shiftKey) commands.redo()
          else commands.undo()
          break
        case 'y':
          commands.redo()
          break
        case 'd':
          commands.duplicateSelection()
          break
        case 'a':
          commands.selectAll()
          break
        case 'b':
          commands.split()
          break
        case 'e':
          commands.openExport()
          break
        default:
          handled = false
      }
    } else {
      switch (key) {
        case ' ':
          if (e.target?.tagName === 'BUTTON') e.target.blur()
          commands.togglePlay()
          break
        case 'ArrowLeft':
          if (e.shiftKey) commands.seekBy(-1)
          else commands.stepFrames(-1)
          break
        case 'ArrowRight':
          if (e.shiftKey) commands.seekBy(1)
          else commands.stepFrames(1)
          break
        case 'Home':
          commands.goToStart()
          break
        case 'End':
          commands.goToEnd()
          break
        case 'Delete':
        case 'Backspace':
          if (e.shiftKey) commands.deleteRange(true)
          else commands.deleteSelection()
          break
        case 's':
        case 'S':
          commands.split()
          break
        case 't':
        case 'T':
          commands.addText()
          break
        case 'i':
        case 'I':
          commands.markIn()
          break
        case 'o':
        case 'O':
          commands.markOut()
          break
        case 'n':
        case 'N':
          editor.snapping = !editor.snapping
          ui.toast(`Snapping ${editor.snapping ? 'on' : 'off'}`, 'info', { timeout: 1200 })
          break
        case '+':
        case '=':
          commands.zoom(1.25)
          break
        case '-':
        case '_':
          commands.zoom(0.8)
          break
        case 'Escape':
          commands.clearSelection()
          break
        case '?':
          ui.shortcutsOpen = !ui.shortcutsOpen
          break
        default:
          handled = false
      }
    }
    if (handled) e.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
