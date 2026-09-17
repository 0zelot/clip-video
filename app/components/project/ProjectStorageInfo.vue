<script setup>
import { HardDrive, ShieldCheck } from 'lucide-vue-next'
import { getStorageInfo, requestPersistentStorage } from '~/services/storage/mediaRepository'
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()
const info = ref(null)

function formatBytes(bytes) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

async function load() {
  info.value = await getStorageInfo()
}

async function persist() {
  const ok = await requestPersistentStorage()
  ui.toast(
    ok ? 'Storage is now persistent' : 'The browser declined persistent storage. Data may be removed when the device runs low on space.',
    ok ? 'success' : 'warning',
  )
  await load()
}

onMounted(load)
</script>

<template>
  <div v-if="info?.supported" class="flex items-center gap-2 text-xs text-muted">
    <HardDrive class="size-3.5" />
    <span>{{ formatBytes(info.usage) }} used of {{ formatBytes(info.quota) }}</span>
    <span v-if="info.persisted" v-tooltip="'The browser will not evict your projects'" class="flex items-center gap-1 text-ok">
      <ShieldCheck class="size-3.5" /> persistent
    </span>
    <button v-else type="button" class="text-accent hover:underline" @click="persist">Make persistent</button>
  </div>
</template>
