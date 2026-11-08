<script setup>
import { Gauge, Timer } from 'lucide-vue-next'
import { MAX_SPEED, MIN_SPEED, SPEED_PRESETS } from '~/core/model/defaults'
import { durationForRamp, formatDuration, sourceRange as rangeOf, speedForDuration } from '~/core/time'
import { setItemSpeed } from '~/core/operations/items'
import { useEditorStore } from '~/stores/editor'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const editor = useEditorStore()
const ui = useUiStore()

const fps = computed(() => projectStore.project?.settings.fps ?? 30)
const speed = computed(() => props.item.speed)
/** Length of the used source media (does not change with speed). */
const sourceRange = computed(() => rangeOf(props.item))
const ramp = computed(() => props.item.speedRamp ?? null)
const fmt = (v) => `${Number(v.toFixed(3))}×`
const speedLabel = computed(() => fmt(speed.value))

function setSpeed(value) {
  const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, value))
  projectStore.setItemSpeed(props.item.id, next)
  editor.engine?.refresh()
}

/** "This part should last N seconds" - the speed follows. */
function setTargetDuration(seconds) {
  let next = speedForDuration(sourceRange.value, seconds)
  if (next !== null && ramp.value) {
    // With a ramp the relation is not linear: find the main speed by bisection.
    const r = ramp.value
    let lo = MIN_SPEED
    let hi = MAX_SPEED
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      const d = durationForRamp(sourceRange.value, mid, r.from, r.rampIn, r.rampOut).duration
      if (d > seconds) lo = mid
      else hi = mid
    }
    next = (lo + hi) / 2
  }
  if (next === null) return
  if (next < MIN_SPEED || next > MAX_SPEED) {
    ui.toast(`That needs ${Number(next.toFixed(2))}× - speed is limited to ${MIN_SPEED}×–${MAX_SPEED}×`, 'warning')
  }
  setSpeed(next)
}

// The slider is logarithmic so that 0.1×–1× gets as much room as 1×–16×.
const LOG_MIN = Math.log(MIN_SPEED)
const LOG_MAX = Math.log(MAX_SPEED)
const sliderValue = computed(() => (Math.log(speed.value) - LOG_MIN) / (LOG_MAX - LOG_MIN))
function onSlider(v) {
  let next = Math.exp(LOG_MIN + v * (LOG_MAX - LOG_MIN))
  next = Math.round(next * 100) / 100
  // Gentle snap to 1× and common presets.
  for (const preset of SPEED_PRESETS) if (Math.abs(next - preset) / preset < 0.025) next = preset
  setSpeed(next)
}

const NUDGES = [-0.1, -0.01, 0.01, 0.1]
function nudge(delta) {
  setSpeed(Math.round((speed.value + delta) * 1000) / 1000)
}

const hasRange = computed(() => editor.markIn !== null && editor.markOut !== null && editor.markOut > editor.markIn)

// ----- smooth ramps -----------------------------------------------------------

const rangeEase = ref(0.5)

function setRamp(patch) {
  const current = ramp.value ?? { from: 1, rampIn: 0.5, rampOut: 0.5 }
  const next = { ...current, ...patch }
  projectStore.setSpeedRamp(props.item.id, speed.value, next.rampIn > 0 || next.rampOut > 0 ? next : null)
  editor.engine?.refresh()
}

function toggleRamp(on) {
  if (on) setRamp({ from: 1, rampIn: 0.5, rampOut: 0.5 })
  else projectStore.setSpeedRamp(props.item.id, speed.value, null)
  editor.engine?.refresh()
}

/**
 * Splits the clip at the In/Out marks and changes the speed of only that
 * part - easing into and out of the new speed instead of jumping.
 */
function applyToRange(value) {
  if (!hasRange.value) {
    ui.toast('Set an In point (I) and an Out point (O) on the timeline first', 'info')
    return
  }
  const from = speed.value
  const ease = rangeEase.value
  const ids = projectStore.applyToRange(
    editor.markIn,
    editor.markOut,
    [props.item.id],
    (draft, id) => setItemSpeed(draft, id, value, { ramp: ease > 0 ? { from, rampIn: ease, rampOut: ease } : null }),
    `Speed ${Number(value.toFixed(3))}×`,
  )
  if (ids.length) {
    editor.select(ids)
    editor.markIn = null
    editor.markOut = null
    ui.toast(`${fmt(value)} on the range${ease > 0 ? ` with ${ease}s easing` : ''} - adjust it here`, 'success')
    editor.engine?.refresh()
  }
}
</script>

<template>
  <PropertiesSection title="Speed" :icon="Gauge">
    <div class="flex items-end justify-between gap-2">
      <p class="font-mono text-2xl font-semibold tabular-nums text-accent">{{ speedLabel }}</p>
      <p class="text-right text-[11px] text-muted">
        {{ formatDuration(sourceRange) }} of source<br />
        plays in <span class="font-mono text-fg">{{ formatDuration(item.duration) }}</span>
      </p>
    </div>

    <UiSlider
      :model-value="sliderValue"
      :min="0"
      :max="1"
      :step="0.001"
      aria-label="Speed"
      @update:model-value="onSlider"
    />
    <div class="-mt-1 flex justify-between font-mono text-[10px] text-subtle">
      <span>0.1×</span><span>1×</span><span>16×</span>
    </div>

    <div class="grid grid-cols-6 gap-1">
      <button
        v-for="preset in SPEED_PRESETS"
        :key="preset"
        type="button"
        class="h-8 rounded-lg border text-[11px] font-medium coarse:h-10"
        :class="Math.abs(speed - preset) < 0.0005 ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
        @click="setSpeed(preset)"
      >
        {{ preset }}×
      </button>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <UiNumberField
        :model-value="speed"
        label="Exact speed"
        :min="MIN_SPEED"
        :max="MAX_SPEED"
        :step="0.01"
        :precision="3"
        suffix="×"
        @commit="setSpeed"
      />
      <div class="grid grid-cols-4 items-end gap-1">
        <button
          v-for="delta in NUDGES"
          :key="delta"
          type="button"
          class="h-8 rounded-md border border-line px-0 font-mono text-[10px] text-muted hover:border-accent hover:text-accent coarse:h-10"
          :aria-label="`Change speed by ${delta}`"
          @click="nudge(delta)"
        >
          {{ delta > 0 ? '+' : '−' }}{{ Math.abs(delta) }}
        </button>
      </div>
    </div>

    <div class="rounded-xl border border-line bg-panel-2/60 p-2.5">
      <div class="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
        <Timer class="size-3.5 text-accent" /> Fit to duration
      </div>
      <UiTimeField
        :model-value="item.duration"
        label="This clip should last"
        :fps="fps"
        :min="1 / fps"
        @commit="setTargetDuration"
      />
      <p class="mt-1.5 text-[11px] text-muted">Type a length (e.g. <span class="font-mono">7.5</span> or <span class="font-mono">0:12.10</span>) and the speed is calculated for you.</p>
    </div>

    <!-- smooth ramp of this clip -->
    <div class="rounded-xl border border-line bg-panel-2/60 p-2.5">
      <UiSwitch :model-value="!!ramp" label="Ease in / out (speed ramp)" @update:model-value="toggleRamp" />
      <template v-if="ramp">
        <p class="mb-2 font-mono text-[11px] text-accent">{{ fmt(ramp.from) }} → {{ speedLabel }} → {{ fmt(ramp.from) }}</p>
        <div class="grid grid-cols-3 gap-2">
          <UiNumberField :model-value="ramp.from" label="Edge speed" :min="MIN_SPEED" :max="MAX_SPEED" :step="0.05" :precision="2" suffix="×" @commit="(v) => setRamp({ from: v })" />
          <UiNumberField :model-value="ramp.rampIn" label="Ease in" :min="0" :max="10" :step="0.1" :precision="2" suffix="s" @commit="(v) => setRamp({ rampIn: v })" />
          <UiNumberField :model-value="ramp.rampOut" label="Ease out" :min="0" :max="10" :step="0.1" :precision="2" suffix="s" @commit="(v) => setRamp({ rampOut: v })" />
        </div>
        <p class="mt-1.5 text-[11px] text-muted">The clip starts at the edge speed, glides to {{ speedLabel }} and glides back.</p>
      </template>
    </div>

    <!-- part of the clip -->
    <div class="rounded-xl border border-line bg-panel-2/60 p-2.5">
      <p class="mb-1.5 text-xs font-medium">Only a part of the clip</p>
      <UiSlider v-model="rangeEase" label="Gradual change" :min="0" :max="2" :step="0.05" :format="(v) => (v > 0 ? `${v.toFixed(2)} s` : 'instant')" />
      <UiButton size="sm" block class="mt-1" :disabled="!hasRange" @click="applyToRange(speed === 1 ? 2 : speed)">
        {{ speed === 1 ? '2×' : speedLabel }} on the In→Out range
      </UiButton>
      <p class="mt-1.5 text-[11px] text-muted">
        {{ hasRange ? 'The range becomes its own clip that speeds up gradually and slows back down - fine-tune it afterwards.' : 'Mark a range with In and Out on the timeline first.' }}
        Pitch stays natural.
      </p>
    </div>
  </PropertiesSection>
</template>
