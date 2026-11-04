import { DEFAULT_IMAGE_DURATION, createBlurItem, createId, createItemFromAsset } from '~/core/model/defaults'
import { locateItem } from '~/core/model/queries'
import { resolveItemAt } from '~/core/render/animate'
import { EPSILON, snapToFrame } from '~/core/time'
import { renderSticker } from '~/services/elements/stickers'
import { useMediaStore } from '~/stores/media'
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

    /**
     * Places a photo / video / sticker as an overlay at the playhead (above the
     * main video), ready to be moved and scaled on the preview.
     */
    addOverlay: (asset, options = {}) => {
      if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) return null
      const item = createItemFromAsset(asset, snapToFrame(now(), fps()))
      if (asset.kind === 'image') item.duration = options.duration ?? DEFAULT_IMAGE_DURATION
      item.transform.scale = options.scale ?? 0.45
      const id = projectStore.insertOverlay(item, 'Add overlay')
      if (id) {
        editor.select([id])
        refresh()
      }
      return id
    },

    /** Draws a built-in sticker, imports it once and adds it as an overlay. */
    addSticker: async (def) => {
      const project = projectStore.project
      if (!project) return null
      const media = useMediaStore()
      const file = await renderSticker(def)
      let asset = Object.values(project.assets).find((a) => !a.removed && a.kind === 'image' && a.name === file.name)
      if (!asset) [asset] = await media.importFiles([file])
      return asset ? commands.addOverlay(asset, { scale: def.value ? 0.3 : 0.4 }) : null
    },

    /** Adds a blur / pixelate region (or a background blur) at the playhead. */
    addBlur: (options = {}) => {
      const item = createBlurItem({ ...options, start: snapToFrame(now(), fps()), duration: Math.max(1, Math.min(5, projectStore.duration - now() || 3)) })
      const id = projectStore.insertOverlay(item, 'Add blur', { directlyAboveMain: true })
      if (id) {
        editor.select([id])
        editor.focusProperties('blur')
        refresh()
      }
      return id
    },

    /** Inserts a 2-second still of the current frame of the selected (or top) video clip. */
    freezeFrame: async (seconds = 2) => {
      const project = projectStore.project
      if (!project) return
      const t = snapToFrame(now(), fps())
      const selected = editor.selection.length === 1 ? locateItem(project, editor.selection[0]) : null
      let target = selected?.item.type === 'video' && selected.item.start <= t && selected.item.start + selected.item.duration > t ? selected.item : null
      if (!target) {
        for (const track of project.tracks) {
          if (track.kind !== 'visual' || track.hidden) continue
          const hit = track.items.find((i) => i.type === 'video' && i.start <= t && i.start + i.duration > t)
          if (hit) target = hit
        }
      }
      if (!target) {
        ui.toast('Put the playhead over a video clip first', 'info')
        return
      }
      editor.engine?.pause()
      seek(t)
      await new Promise((r) => setTimeout(r, 350))
      const video = editor.engine?.media.getVideo(target.id)
      if (!video || video.readyState < 2 || !video.videoWidth) {
        ui.toast('The frame is not ready yet - try again', 'info')
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) return
      const media = useMediaStore()
      const file = new File([blob], `Freeze ${t.toFixed(2)}s.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
      const [asset] = await media.importFiles([file])
      if (!asset) return
      const look = resolveItemAt(target, t - target.start)
      const still = {
        ...createItemFromAsset(asset, t),
        duration: seconds,
        name: 'Freeze frame',
        transform: { ...look.transform },
        fit: target.fit,
        crop: { ...target.crop },
        effects: { ...target.effects },
        opacity: look.opacity,
      }
      const id = projectStore.insertFreezeFrame(target.id, t, still)
      if (id) {
        editor.select([id])
        refresh()
        ui.toast(`Freeze frame added (${seconds}s)`, 'success')
      }
    },

    /** Adds a marker at the playhead (or removes the one that is there). */
    toggleMarker: () => {
      const project = projectStore.project
      if (!project) return
      const t = snapToFrame(now(), fps())
      const existing = (project.markers ?? []).find((m) => Math.abs(m.t - t) < 0.5 / fps())
      if (existing) projectStore.removeMarker(existing.id)
      else projectStore.addMarker({ id: createId(), t, label: '', color: '#ffb547' })
    },
    jumpMarker: (direction) => {
      const list = projectStore.project?.markers ?? []
      const t = now()
      const target = direction < 0 ? [...list].reverse().find((m) => m.t < t - 1e-3) : list.find((m) => m.t > t + 1e-3)
      if (target) seek(target.t)
    },

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
