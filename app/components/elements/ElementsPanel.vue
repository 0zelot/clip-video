<script setup>
import { Droplets, Grid3x3, ImagePlus, ScanFace } from 'lucide-vue-next'
import { EMOJI_STICKERS, SHAPES, renderSticker } from '~/services/elements/stickers'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'

const editor = useEditorStore()
const media = useMediaStore()
const commands = useEditorCommands()

const busy = ref(false)

async function addPhotoOverlay() {
  const files = await pickFiles({ accept: 'image/*,video/*', multiple: true })
  if (!files.length) return
  busy.value = true
  try {
    const assets = await media.importFiles(files)
    for (const asset of assets) commands.addOverlay(asset)
    if (assets.length) editor.mobilePanel = null
  } finally {
    busy.value = false
  }
}

async function addSticker(def) {
  busy.value = true
  try {
    await commands.addSticker(def)
    editor.mobilePanel = null
  } finally {
    busy.value = false
  }
}

function addBlur(options) {
  commands.addBlur(options)
}

/** Small previews of the shapes, drawn once. */
const previews = ref({})
onMounted(async () => {
  for (const def of SHAPES) {
    const file = await renderSticker(def, 96)
    previews.value = { ...previews.value, [def.id]: URL.createObjectURL(file) }
  }
})
onBeforeUnmount(() => {
  for (const url of Object.values(previews.value)) URL.revokeObjectURL(url)
})
</script>

<template>
  <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
    <section>
      <h3 class="panel-title mb-2">Overlay</h3>
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-xl border border-line bg-panel-2 p-3 text-left hover:border-accent"
        :disabled="busy"
        @click="addPhotoOverlay"
      >
        <ImagePlus class="size-5 shrink-0 text-accent" />
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium">Photo or video on top</span>
          <span class="block text-[11px] text-muted">Logos, screenshots, picture-in-picture - drag and pinch it on the preview.</span>
        </span>
      </button>
    </section>

    <section>
      <h3 class="panel-title mb-2">Blur & hide</h3>
      <div class="grid grid-cols-3 gap-1.5">
        <button type="button" class="flex flex-col items-center gap-1 rounded-xl border border-line bg-panel-2 p-2 text-[11px] hover:border-accent" @click="addBlur({ mode: 'blur' })">
          <ScanFace class="size-5 text-warn" /> Blur area
        </button>
        <button type="button" class="flex flex-col items-center gap-1 rounded-xl border border-line bg-panel-2 p-2 text-[11px] hover:border-accent" @click="addBlur({ mode: 'pixelate', shape: 'rect' })">
          <Grid3x3 class="size-5 text-warn" /> Pixelate
        </button>
        <button type="button" class="flex flex-col items-center gap-1 rounded-xl border border-line bg-panel-2 p-2 text-[11px] hover:border-accent" @click="addBlur({ mode: 'blur', invert: true })">
          <Droplets class="size-5 text-warn" /> Blur background
        </button>
      </div>
      <p class="mt-1.5 text-[11px] text-muted">Hide faces, plates or screens, or blur everything around your subject.</p>
    </section>

    <section>
      <h3 class="panel-title mb-2">Shapes</h3>
      <div class="grid grid-cols-4 gap-1.5">
        <button
          v-for="def in SHAPES"
          :key="def.id"
          type="button"
          class="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-line bg-[#2a2a36] p-1 text-[10px] text-muted hover:border-accent"
          :disabled="busy"
          @click="addSticker(def)"
        >
          <img v-if="previews[def.id]" :src="previews[def.id]" alt="" class="size-10 object-contain" />
          {{ def.label }}
        </button>
      </div>
    </section>

    <section>
      <h3 class="panel-title mb-2">Stickers</h3>
      <div class="grid grid-cols-7 gap-1">
        <button
          v-for="def in EMOJI_STICKERS"
          :key="def.id"
          type="button"
          class="grid aspect-square place-items-center rounded-lg text-2xl hover:bg-panel-3"
          :disabled="busy"
          :aria-label="`Add ${def.label} sticker`"
          @click="addSticker(def)"
        >
          {{ def.value }}
        </button>
      </div>
    </section>
  </div>
</template>
