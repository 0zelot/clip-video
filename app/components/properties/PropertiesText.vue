<script setup>
import { Bold, Italic, Sparkles, Type, Upload } from 'lucide-vue-next'
import { CAPTION_HIGHLIGHTS, SYSTEM_FONTS, TEXT_ANIMATIONS, TEXT_EFFECTS, TEXT_PRESETS } from '~/core/model/defaults'
import { textPreviewStyle } from '~/composables/useTextPreview'
import { useCaptionsStore } from '~/stores/captions'
import { useEditorStore } from '~/stores/editor'
import { useMediaStore } from '~/stores/media'
import { useProjectStore } from '~/stores/project'
import { useUiStore } from '~/stores/ui'

const props = defineProps({ item: { type: Object, required: true } })
const projectStore = useProjectStore()
const captions = useCaptionsStore()
const media = useMediaStore()
const editor = useEditorStore()
const ui = useUiStore()

const style = computed(() => props.item.style)
const isCaption = computed(() => props.item.type === 'caption')
const fonts = computed(() => [...SYSTEM_FONTS.map((f) => ({ id: f.id, label: f.label })), ...media.customFonts()])

function setStyle(patch, key) {
  projectStore.setTextStyle(props.item.id, patch, key)
  if (isCaption.value) captions.style = { ...captions.style, ...patch }
  editor.engine?.refresh()
}

function setNested(group, patch, key) {
  setStyle({ [group]: { ...style.value[group], ...patch } }, key)
}

function setText(value) {
  if (isCaption.value) projectStore.setCaptionText(props.item.id, value)
  else projectStore.setTextContent(props.item.id, value)
  editor.engine?.refresh()
}

function usePreset(preset) {
  projectStore.setTextStyle(props.item.id, preset.style)
  projectStore.setTextAnimation(props.item.id, preset.animation)
  editor.engine?.refresh()
}

function setAnimation(which, patch) {
  projectStore.setTextAnimation(props.item.id, { [which]: patch })
  editor.engine?.refresh()
}

async function importFont() {
  const [file] = await pickFiles({ multiple: false, accept: '.ttf,.otf,.woff,.woff2,font/*' })
  if (!file) return
  const asset = await media.importFont(file)
  if (asset?.fontFamily) setStyle({ fontFamily: asset.fontFamily })
}

function applyToAllCaptions() {
  captions.style = { ...style.value }
  captions.animation = { in: { ...props.item.animation.in }, out: { ...props.item.animation.out } }
  captions.position = { x: props.item.transform.x, y: props.item.transform.y }
  captions.applyPreset({ style: captions.style, animation: captions.animation, position: captions.position })
  ui.toast('Applied this look to every caption', 'success')
}

const ANIMATIONS = TEXT_ANIMATIONS
const HIGHLIGHTS = CAPTION_HIGHLIGHTS
</script>

<template>
  <PropertiesSection :title="isCaption ? 'Caption text' : 'Text'" :icon="Type">
    <textarea
      :value="item.text"
      rows="3"
      class="field h-auto py-1.5 leading-snug"
      :placeholder="isCaption ? 'Caption text' : 'Your text'"
      @input="setText($event.target.value)"
    />

    <div v-if="!isCaption">
      <span class="label">Presets</span>
      <div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          v-for="preset in TEXT_PRESETS"
          :key="preset.id"
          type="button"
          class="flex w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-lg border border-line bg-[#2a2a36] p-1 text-[10px] text-muted hover:border-accent hover:text-accent"
          @click="usePreset(preset)"
        >
          <span class="grid h-9 w-full place-items-center overflow-hidden rounded-md text-base" :style="textPreviewStyle(preset.style)">Aa</span>
          <span class="w-full truncate text-center">{{ preset.label }}</span>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="block min-w-0">
        <span class="label">Font</span>
        <select class="field" :value="style.fontFamily" @change="setStyle({ fontFamily: $event.target.value })">
          <option v-for="font in fonts" :key="font.id" :value="font.id">{{ font.label }}</option>
        </select>
      </label>
      <UiNumberField
        :model-value="style.fontSize"
        label="Size"
        :min="0.01"
        :max="0.4"
        :step="1"
        :precision="1"
        :factor="1000"
        @update:model-value="(v) => setStyle({ fontSize: v }, `fs:${item.id}`)"
      />
    </div>

    <div class="flex flex-wrap gap-1.5">
      <UiButton size="sm" :icon="Bold" :variant="style.fontWeight >= 700 ? 'primary' : 'secondary'" @click="setStyle({ fontWeight: style.fontWeight >= 700 ? 400 : 800 })">
        Bold
      </UiButton>
      <UiButton size="sm" :icon="Italic" :variant="style.italic ? 'primary' : 'secondary'" @click="setStyle({ italic: !style.italic })">Italic</UiButton>
      <UiButton size="sm" :variant="style.uppercase ? 'primary' : 'secondary'" @click="setStyle({ uppercase: !style.uppercase })">AA</UiButton>
      <UiButton size="sm" :variant="style.outlineOnly ? 'primary' : 'secondary'" @click="setStyle({ outlineOnly: !style.outlineOnly })">Hollow</UiButton>
      <UiButton size="sm" :icon="Upload" @click="importFont">Font file</UiButton>
    </div>

    <div>
      <span class="label">Alignment</span>
      <div class="flex gap-1">
        <button
          v-for="align in ['left', 'center', 'right']"
          :key="align"
          type="button"
          class="h-8 flex-1 rounded-lg border text-xs capitalize coarse:h-10"
          :class="style.align === align ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
          @click="setStyle({ align })"
        >
          {{ align }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="block">
        <span class="label">Colour</span>
        <input type="color" class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2" :value="style.color" @input="setStyle({ color: $event.target.value }, `color:${item.id}`)" />
      </label>
      <div class="block">
        <span class="label flex items-center justify-between">
          <span>Gradient</span>
          <UiSwitch :model-value="!!style.gradientColor" aria-label="Gradient fill" @update:model-value="(on) => setStyle({ gradientColor: on ? '#5b8cff' : null })" />
        </span>
        <input
          type="color"
          class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2 disabled:opacity-30"
          :disabled="!style.gradientColor"
          :value="style.gradientColor ?? '#5b8cff'"
          @input="setStyle({ gradientColor: $event.target.value }, `grad:${item.id}`)"
        />
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <UiSlider
        :model-value="style.opacity"
        label="Opacity"
        :min="0"
        :max="1"
        :step="0.01"
        :format="(v) => `${Math.round(v * 100)}%`"
        @update:model-value="(v) => setStyle({ opacity: v }, `textop:${item.id}`)"
      />
    </div>

    <div class="grid grid-cols-3 gap-2">
      <UiNumberField :model-value="style.lineHeight" label="Line h." :min="0.6" :max="3" :step="0.05" :precision="2" @update:model-value="(v) => setStyle({ lineHeight: v }, `lh:${item.id}`)" />
      <UiNumberField :model-value="style.letterSpacing" label="Letter" :min="-0.2" :max="1" :step="0.01" :precision="2" @update:model-value="(v) => setStyle({ letterSpacing: v }, `ls:${item.id}`)" />
      <UiNumberField :model-value="style.maxWidth" label="Width" :min="0.1" :max="1" :step="1" :precision="0" :factor="100" suffix="%" @update:model-value="(v) => setStyle({ maxWidth: v }, `mw:${item.id}`)" />
    </div>
  </PropertiesSection>

  <PropertiesSection title="Effect" :icon="Sparkles">
    <div class="grid grid-cols-4 gap-1">
      <button
        v-for="option in TEXT_EFFECTS"
        :key="option.id"
        type="button"
        class="h-8 rounded-lg border text-[11px] coarse:h-10"
        :class="(style.effect ?? 'none') === option.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
        @click="setStyle({ effect: option.id })"
      >
        {{ option.label }}
      </button>
    </div>
    <p class="text-[11px] text-muted">3D uses the shadow colour for the extrusion.</p>
  </PropertiesSection>

  <PropertiesSection title="Outline, shadow & box" :icon="Sparkles" :default-open="false">
    <div class="grid grid-cols-2 gap-2">
      <label class="block">
        <span class="label">Stroke colour</span>
        <input type="color" class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2" :value="style.stroke.color" @input="setNested('stroke', { color: $event.target.value }, `sc:${item.id}`)" />
      </label>
      <UiSlider
        :model-value="style.stroke.width"
        label="Stroke"
        :min="0"
        :max="0.3"
        :step="0.005"
        :format="(v) => `${Math.round(v * 100)}`"
        @update:model-value="(v) => setNested('stroke', { width: v }, `sw:${item.id}`)"
      />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="block">
        <span class="label">2nd outline</span>
        <input type="color" class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2" :value="style.stroke2?.color ?? '#ffffff'" @input="setNested('stroke2', { color: $event.target.value }, `s2c:${item.id}`)" />
      </label>
      <UiSlider
        :model-value="style.stroke2?.width ?? 0"
        label="Outer width"
        :min="0"
        :max="0.3"
        :step="0.005"
        :format="(v) => `${Math.round(v * 100)}`"
        @update:model-value="(v) => setNested('stroke2', { width: v }, `s2w:${item.id}`)"
      />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="block">
        <span class="label">Shadow colour</span>
        <input type="color" class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2" :value="style.shadow.color" @input="setNested('shadow', { color: $event.target.value }, `shc:${item.id}`)" />
      </label>
      <UiSlider
        :model-value="style.shadow.opacity"
        label="Shadow"
        :min="0"
        :max="1"
        :step="0.01"
        :format="(v) => `${Math.round(v * 100)}%`"
        @update:model-value="(v) => setNested('shadow', { opacity: v }, `sho:${item.id}`)"
      />
    </div>
    <div class="grid grid-cols-3 gap-2">
      <UiNumberField :model-value="style.shadow.blur" label="Blur" :min="0" :max="2" :step="0.05" :precision="2" @update:model-value="(v) => setNested('shadow', { blur: v }, `shb:${item.id}`)" />
      <UiNumberField :model-value="style.shadow.offsetX" label="Off X" :min="-1" :max="1" :step="0.02" :precision="2" @update:model-value="(v) => setNested('shadow', { offsetX: v }, `shx:${item.id}`)" />
      <UiNumberField :model-value="style.shadow.offsetY" label="Off Y" :min="-1" :max="1" :step="0.02" :precision="2" @update:model-value="(v) => setNested('shadow', { offsetY: v }, `shy:${item.id}`)" />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="block">
        <span class="label">Background</span>
        <input type="color" class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2" :value="style.background.color" @input="setNested('background', { color: $event.target.value }, `bg:${item.id}`)" />
      </label>
      <UiSlider
        :model-value="style.background.opacity"
        label="Box opacity"
        :min="0"
        :max="1"
        :step="0.01"
        :format="(v) => `${Math.round(v * 100)}%`"
        @update:model-value="(v) => setNested('background', { opacity: v }, `bgo:${item.id}`)"
      />
    </div>
    <div class="grid grid-cols-2 gap-2">
      <UiNumberField :model-value="style.background.padding" label="Padding" :min="0" :max="2" :step="0.05" :precision="2" @update:model-value="(v) => setNested('background', { padding: v }, `bgp:${item.id}`)" />
      <UiNumberField :model-value="style.background.radius" label="Radius" :min="0" :max="2" :step="0.05" :precision="2" @update:model-value="(v) => setNested('background', { radius: v }, `bgr:${item.id}`)" />
    </div>
  </PropertiesSection>

  <PropertiesSection v-if="isCaption" title="Active word" :icon="Sparkles">
    <div class="grid grid-cols-3 gap-1">
      <button
        v-for="option in HIGHLIGHTS"
        :key="option.id"
        type="button"
        class="h-8 rounded-lg border text-[11px] coarse:h-10"
        :class="style.highlight === option.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:border-subtle'"
        @click="setStyle({ highlight: option.id })"
      >
        {{ option.label }}
      </button>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <label class="block">
        <span class="label">Active colour</span>
        <input type="color" class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2" :value="style.activeColor" @input="setStyle({ activeColor: $event.target.value }, `ac:${item.id}`)" />
      </label>
      <label class="block">
        <span class="label">Active box</span>
        <input type="color" class="h-9 w-full cursor-pointer rounded-lg border border-line bg-panel-2" :value="style.activeBackground" @input="setStyle({ activeBackground: $event.target.value }, `ab:${item.id}`)" />
      </label>
    </div>
    <UiSlider
      :model-value="style.activeScale"
      label="Active scale"
      :min="1"
      :max="1.8"
      :step="0.01"
      :format="(v) => `${Math.round(v * 100)}%`"
      @update:model-value="(v) => setStyle({ activeScale: v }, `as:${item.id}`)"
    />
    <UiButton size="sm" block @click="applyToAllCaptions">Apply this look to all captions</UiButton>
  </PropertiesSection>

  <PropertiesSection title="Animation" :icon="Sparkles" :default-open="false">
    <div class="grid grid-cols-2 gap-2">
      <label class="block">
        <span class="label">In</span>
        <select class="field" :value="item.animation.in.kind" @change="setAnimation('in', { kind: $event.target.value })">
          <option v-for="a in ANIMATIONS" :key="a.id" :value="a.id">{{ a.label }}</option>
        </select>
      </label>
      <UiNumberField
        :model-value="item.animation.in.duration"
        label="In time"
        :min="0"
        :max="2"
        :step="0.05"
        :precision="2"
        suffix="s"
        @update:model-value="(v) => setAnimation('in', { duration: v })"
      />
    </div>
    <div class="grid grid-cols-2 gap-2">
      <label class="block">
        <span class="label">Out</span>
        <select class="field" :value="item.animation.out.kind" @change="setAnimation('out', { kind: $event.target.value })">
          <option v-for="a in ANIMATIONS" :key="a.id" :value="a.id">{{ a.label }}</option>
        </select>
      </label>
      <UiNumberField
        :model-value="item.animation.out.duration"
        label="Out time"
        :min="0"
        :max="2"
        :step="0.05"
        :precision="2"
        suffix="s"
        @update:model-value="(v) => setAnimation('out', { duration: v })"
      />
    </div>
  </PropertiesSection>
</template>
