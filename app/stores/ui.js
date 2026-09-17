import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * @typedef {'info' | 'success' | 'warning' | 'error'} ToastKind
 * @typedef {{ id: number, kind: ToastKind, message: string, action?: { label: string, run: () => void } }} Toast
 *
 * @typedef {object} ConfirmOptions
 * @property {string} title
 * @property {string} [message]
 * @property {string} [confirmLabel]
 * @property {string} [cancelLabel]
 * @property {boolean} [danger]
 *
 * @typedef {object} PromptOptions
 * @property {string} title
 * @property {string} [label]
 * @property {string} [value]
 * @property {string} [confirmLabel]
 */

let nextToastId = 1

export const useUiStore = defineStore('ui', () => {
  /** @type {import('vue').Ref<Toast[]>} */
  const toasts = ref([])
  const confirmState = ref(null)
  const promptState = ref(null)
  const shortcutsOpen = ref(false)

  /**
   * @param {string} message
   * @param {ToastKind} [kind]
   * @param {{ timeout?: number, action?: Toast['action'] }} [options]
   */
  function toast(message, kind = 'info', options = {}) {
    const id = nextToastId++
    toasts.value = [...toasts.value.slice(-4), { id, kind, message, action: options.action }]
    const timeout = options.timeout ?? (kind === 'error' ? 8000 : kind === 'warning' ? 6000 : 3000)
    if (timeout > 0) setTimeout(() => dismiss(id), timeout)
    return id
  }

  function dismiss(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  /**
   * @param {ConfirmOptions} options
   * @returns {Promise<boolean>}
   */
  function confirm(options) {
    confirmState.value?.resolve(false)
    return new Promise((resolve) => {
      confirmState.value = { ...options, resolve }
    })
  }

  function resolveConfirm(ok) {
    const state = confirmState.value
    confirmState.value = null
    state?.resolve(ok)
  }

  /**
   * @param {PromptOptions} options
   * @returns {Promise<string | null>}
   */
  function prompt(options) {
    promptState.value?.resolve(null)
    return new Promise((resolve) => {
      promptState.value = { ...options, resolve }
    })
  }

  function resolvePrompt(value) {
    const state = promptState.value
    promptState.value = null
    state?.resolve(value)
  }

  return { toasts, confirmState, promptState, shortcutsOpen, toast, dismiss, confirm, resolveConfirm, prompt, resolvePrompt }
})
