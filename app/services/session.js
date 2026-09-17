/**
 * Small session helpers: remembering which project was open (for automatic
 * restore after a refresh / app restart) and handing files dropped on the
 * home screen over to the editor.
 */
const LAST_OPEN_KEY = 'clip:last-open'
const SESSION_KEY = 'clip:session'

function safe(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const session = {
  setLastOpen(projectId) {
    safe(() => localStorage.setItem(LAST_OPEN_KEY, projectId), undefined)
  },
  clearLastOpen() {
    safe(() => localStorage.removeItem(LAST_OPEN_KEY), undefined)
  },
  getLastOpen() {
    return safe(() => localStorage.getItem(LAST_OPEN_KEY), null)
  },
  /** True only for the first call in a browser tab / app launch. */
  isFreshStart() {
    return safe(() => {
      if (sessionStorage.getItem(SESSION_KEY)) return false
      sessionStorage.setItem(SESSION_KEY, '1')
      return true
    }, false)
  },
}

/** @type {File[]} */
let pendingFiles = []

export function setPendingImport(files) {
  pendingFiles = files
}

export function takePendingImport() {
  const files = pendingFiles
  pendingFiles = []
  return files
}
