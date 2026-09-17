import { locateItem } from '~/core/model/queries'
import { EPSILON, snapToFrame } from '~/core/time'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

/**
 * Editor commands shared by the toolbar, keyboard shortcuts and context menus.
 * Components never manipulate the project directly - they call these.
 */
export function useEditorCommands() {
  const projectStore = useProjectStore()
  const editor = useEditorStore()
  const ui = useUiStore()

  const fps = () => projectStore.project?.settings.fps ?? 30
  const now = () => editor.currentTime()

  function seek(time) {
    editor.engine?.seek(time)
  }

  function refresh() {
    editor.engine?.refresh()
  }

  const commands = {
    togglePlay: () => editor.engine?.toggle(),
    pause: () => editor.engine?.pause(),
    seek,
    stepFrames: (frames) => {
      editor.engine?.pause()
      seek(snapToFrame(now(), fps()) + frames / fps())
    },
    seekBy: (seconds) => seek(now() + seconds),
    goToStart: () => seek(0),
    goToEnd: () => seek(projectStore.duration),

    undo: () => {
      const label = projectStore.undo()
      if (label) {
        pruneSelection()
        refresh()
      }
    },
    redo: () => {
      const label = projectStore.redo()
      if (label) {
        pruneSelection()
        refresh()
      }
    },

    save: async () => {
      const ok = await projectStore.save()
      if (ok) ui.toast('Project saved', 'success', { timeout: 1500 })
      else ui.toast(`Saving failed: ${projectStore.saveError ?? 'unknown error'}`, 'error')
    },

    split: () => {
      const project = projectStore.project
      if (!project) return
      const t = snapToFrame(now(), fps())
      const selectedUnderPlayhead = editor.selection.filter((id) => {
        const loc = locateItem(project, id)
        return loc && loc.item.start < t - EPSILON && loc.item.start + loc.item.duration > t + EPSILON
      })
      const created = projectStore.split(t, selectedUnderPlayhead.length ? selectedUnderPlayhead : undefined)
      if (created.length === 0) ui.toast('Nothing to split at the playhead', 'info', { timeout: 1800 })
      else if (selectedUnderPlayhead.length) editor.select(created)
    },

    deleteSelection: () => {
      if (!editor.selection.length) return
      const removed = projectStore.deleteItems(editor.selection)
      if (removed === 0) ui.toast('Selected clips are on a locked track', 'info')
      editor.select([])
      refresh()
    },

    duplicateSelection: () => {
      if (!editor.selection.length) return
      const created = projectStore.duplicateItems(editor.selection)
      if (created.length) editor.select(created)
    },

    selectAll: () => {
      const project = projectStore.project
      if (!project) return
      editor.select(project.tracks.filter((t) => !t.locked).flatMap((t) => t.items.map((i) => i.id)))
    },

    clearSelection: () => editor.select([]),

    markIn: () => {
      editor.markIn = snapToFrame(now(), fps())
      if (editor.markOut !== null && editor.markOut <= editor.markIn) editor.markOut = null
    },
    markOut: () => {
      editor.markOut = snapToFrame(now(), fps())
      if (editor.markIn !== null && editor.markIn >= editor.markOut) editor.markIn = null
    },
    clearMarks: () => {
      editor.markIn = null
      editor.markOut = null
    },
    deleteRange: (ripple = true) => {
      const { markIn, markOut } = editor
      if (markIn === null || markOut === null || markOut - markIn < EPSILON) {
        ui.toast('Set an In point (I) and an Out point (O) first', 'info')
        return
      }
      projectStore.deleteRange(markIn, markOut, ripple)
      editor.markIn = null
      editor.markOut = null
      editor.select([])
      seek(markIn)
    },

    /** Adds a text clip at the playhead and opens its properties. */
    addText: () => {
      const id = projectStore.addTextItem({ start: snapToFrame(now(), fps()), duration: 3 })
      if (id) {
        editor.select([id])
        editor.focusProperties()
        refresh()
      }
      return id
    },

    zoom: (factor) => editor.setZoom(editor.zoom * factor),

    addTrack: (kind) => projectStore.addTrack(kind),

    removeTrack: async (trackId) => {
      const track = projectStore.project?.tracks.find((t) => t.id === trackId)
      if (!track) return
      if (track.items.length > 0) {
        const ok = await ui.confirm({
          title: `Delete "${track.name}"?`,
          message: `The track contains ${track.items.length} clip${track.items.length === 1 ? '' : 's'}. You can undo this.`,
          confirmLabel: 'Delete track',
          danger: true,
        })
        if (!ok) return
      }
      projectStore.removeTrack(trackId)
      pruneSelection()
      refresh()
    },

    openExport: () => {
      if (projectStore.duration <= 0) {
        ui.toast('Add some media to the timeline before exporting', 'info')
        return
      }
      editor.engine?.pause()
      editor.exportOpen = true
    },
  }

  function pruneSelection() {
    const project = projectStore.project
    if (!project) return
    const ids = new Set(project.tracks.flatMap((t) => t.items.map((i) => i.id)))
    const kept = editor.selection.filter((id) => ids.has(id))
    if (kept.length !== editor.selection.length) editor.select(kept)
  }

  return commands
}
