/**
 * Window-wide drag & drop of files from the operating system.
 * Internal drags (e.g. media library → timeline) are ignored.
 *
 * @param {(files: File[], event: DragEvent) => void} onFiles
 */
export function useFileDrop(onFiles) {
  const dragging = ref(false)
  let depth = 0

  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  function enter(e) {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth++
    dragging.value = true
  }
  function over(e) {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  function leave(e) {
    if (!hasFiles(e)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) dragging.value = false
  }
  function drop(e) {
    depth = 0
    dragging.value = false
    if (!hasFiles(e)) return
    e.preventDefault()
    // Drops handled by a more specific target (e.g. the timeline) call stopPropagation.
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length) onFiles(files, e)
  }

  onMounted(() => {
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('dragenter', enter)
    window.removeEventListener('dragover', over)
    window.removeEventListener('dragleave', leave)
    window.removeEventListener('drop', drop)
  })

  return { dragging }
}

/**
 * Opens the native file picker. On Android this also offers the gallery.
 * @param {{ accept?: string, multiple?: boolean }} [options]
 * @returns {Promise<File[]>}
 */
export function pickFiles(options = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = options.accept ?? ''
    input.multiple = options.multiple ?? true
    input.style.display = 'none'
    document.body.appendChild(input)
    let settled = false
    const finish = (files) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])))
    input.addEventListener('cancel', () => finish([]))
    input.click()
  })
}

export const MEDIA_ACCEPT =
  'video/*,audio/*,image/*,.mp4,.m4v,.webm,.mov,.mkv,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.png,.jpg,.jpeg,.webp,.gif,.avif'
