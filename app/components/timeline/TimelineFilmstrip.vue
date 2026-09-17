<script setup>
import { sourceTimeAt } from '~/core/time'
import { mediaAnalysis } from '~/services/media/analysis'

const props = defineProps({
  /** @type {import('vue').PropType<import('~/core/model/types').VideoItem>} */
  item: { type: Object, required: true },
})
const timeline = useTimeline()

const { canvas, container, requestRender } = useStripCanvas(
  computed(() => props.item),
  (ctx, geo, _dpr, height) => {
    const strip = mediaAnalysis.getFilmstrip(props.item.assetId)
    if (!strip || strip.times.length === 0) return
    const tileWidth = Math.max(24, (strip.width / strip.height) * height)
    const pps = timeline.pxPerSecond.value
    for (let x = 0; x < geo.width; x += tileWidth) {
      const time = geo.startTime + x / pps
      const source = sourceTimeAt(props.item, time)
      let index = Math.round(source / Math.max(strip.interval, 1e-3))
      index = Math.min(strip.bitmaps.length - 1, Math.max(0, index))
      // Fall back to the closest decoded thumbnail while the strip is still loading.
      let bitmap = strip.bitmaps[index]
      if (!bitmap) {
        for (let d = 1; d < strip.bitmaps.length && !bitmap; d++) {
          bitmap = strip.bitmaps[index - d] ?? strip.bitmaps[index + d] ?? null
        }
      }
      if (bitmap) ctx.drawImage(bitmap, x, 0, tileWidth, height)
    }
  },
)

let off = null
onMounted(() => {
  off = mediaAnalysis.onUpdate((assetId, kind) => {
    if (assetId === props.item.assetId && kind === 'filmstrip') requestRender()
  })
})
onBeforeUnmount(() => off?.())
</script>

<template>
  <div ref="container" class="pointer-events-none overflow-hidden">
    <canvas ref="canvas" class="absolute top-0 left-0 h-full opacity-85" />
  </div>
</template>
