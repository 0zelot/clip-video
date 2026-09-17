/**
 * `v-tooltip="'Text'"` - lightweight tooltips for mouse users.
 * Touch devices do not show hover tooltips; buttons carry aria-labels instead.
 */
let tip = null
let showTimer = null

function ensureTip() {
  if (tip) return tip
  tip = document.createElement('div')
  tip.setAttribute('role', 'tooltip')
  tip.style.cssText =
    'position:fixed;z-index:1000;pointer-events:none;padding:4px 8px;border-radius:6px;background:#2a2a38;color:#ececf3;font-size:12px;line-height:1.3;max-width:260px;box-shadow:0 4px 16px rgba(0,0,0,.4);opacity:0;transition:opacity .12s;white-space:pre-line'
  document.body.appendChild(tip)
  return tip
}

function hide() {
  if (showTimer) clearTimeout(showTimer)
  showTimer = null
  if (tip) tip.style.opacity = '0'
}

const tooltip = {
  mounted(el, binding) {
    el.__tooltip = binding.value
    if (binding.value && !el.getAttribute('aria-label')) el.setAttribute('aria-label', binding.value)
    const enter = (e) => {
      if (e.pointerType !== 'mouse' || !el.__tooltip) return
      hide()
      showTimer = setTimeout(() => {
        const t = ensureTip()
        t.textContent = el.__tooltip ?? ''
        const r = el.getBoundingClientRect()
        const tr = t.getBoundingClientRect()
        let top = r.bottom + 6
        if (top + tr.height > window.innerHeight - 4) top = r.top - tr.height - 6
        const left = Math.min(window.innerWidth - tr.width - 4, Math.max(4, r.left + r.width / 2 - tr.width / 2))
        t.style.top = `${top}px`
        t.style.left = `${left}px`
        t.style.opacity = '1'
      }, 450)
    }
    el.addEventListener('pointerenter', enter)
    el.addEventListener('pointerleave', hide)
    el.addEventListener('pointerdown', hide)
    el.__tooltipCleanup = () => {
      el.removeEventListener('pointerenter', enter)
      el.removeEventListener('pointerleave', hide)
      el.removeEventListener('pointerdown', hide)
    }
  },
  updated(el, binding) {
    el.__tooltip = binding.value
  },
  beforeUnmount(el) {
    el.__tooltipCleanup?.()
    hide()
  },
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('tooltip', tooltip)
})
