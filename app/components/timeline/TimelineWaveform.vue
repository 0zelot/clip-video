<script setup>
import { sourceTimeAt } from '~/core/time'
import { mediaAnalysis } from '~/services/media/analysis'

const props = defineProps({
  /** @type {import('vue').PropType<import('~/core/model/types').AudioItem | import('~/core/model/types').VideoItem>} */
  item: { type: Object, required: true },
})
const timeline = useTimeline()

const { canvas, container, requestRender } = useStripCanvas(
  computed(() => props.item),
  (ctx, geo, _dpr, height) => {
    const peaks = mediaAnalysis.getPeaks(props.item.assetId)
    if (!peaks) return
    const pps = timeline.pxPerSecond.value
    const mid = height / 2
    const muted = props.item.audio.muted || props.item.audio.volume === 0
    ctx.fillStyle = muted ? 'rgba(255,255,255,0.18)' : props.item.type === 'audio' ? 'rgba(160,255,225,0.75)' : 'rgba(255,255,255,0.45)'
    const gain = Math.min(1.5, muted ? 1 : props.item.audio.volume)
    for (let x = 0; x < geo.width; x++) {
      const time = geo.startTime + x / pps
      const source = sourceTimeAt(props.item, time)
      const bucket = Math.floor(source * peaks.bucketsPerSecond)
      const value = peaks.data[bucket] ?? 0
      const h = Math.max(1, Math.min(height, value * gain * height))
      ctx.fillRect(x, mid - h / 2, 1, h)
    }
  },
)

let off = null
onMounted(() => {
  off = mediaAnalysis.onUpdate((assetId, kind) => {
    if (assetId === props.item.assetId && kind === 'peaks') requestRender()
  })
})
onBeforeUnmount(() => off?.())
watch(() => [props.item.audio.volume, props.item.audio.muted], requestRender)
</script>

<template>
  <div ref="container" class="pointer-events-none overflow-hidden">
    <canvas ref="canvas" class="absolute top-0 left-0 h-full" />
  </div>
</template>
