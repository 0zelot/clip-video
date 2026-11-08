<script setup>
import { useStockStore } from '~/stores/stock'

// The stock video catalogue is refreshed in the background at start-up, so the
// Stock tab is ready when it is opened. Failures are silent by design.
onMounted(() => {
  const stock = useStockStore()
  const start = () => void stock.prefetch()
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 4000 })
  else setTimeout(start, 1500)
})
</script>

<template>
  <div class="h-full">
    <NuxtPage />
    <UiToasts />
    <UiDialogHost />
  </div>
</template>
