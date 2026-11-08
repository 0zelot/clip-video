/**
 * Registers the service worker that makes Clip work offline after the first
 * load. Skipped in development, in the native Android app and in the desktop
 * app, where the bundle is already served from the device.
 */
import { isDesktopApp, isNativeApp } from '~/services/platform/platform'

export default defineNuxtPlugin(() => {
  if (import.meta.dev || isNativeApp() || isDesktopApp() || !('serviceWorker' in navigator)) return
  const register = () =>
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[clip] service worker registration failed', error)
    })
  if (document.readyState === 'complete') void register()
  else window.addEventListener('load', () => void register(), { once: true })
})
