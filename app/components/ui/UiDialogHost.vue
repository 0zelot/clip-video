<script setup>
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()
const promptValue = ref('')
const promptInput = ref(null)

watch(
  () => ui.promptState,
  async (state) => {
    if (!state) return
    promptValue.value = state.value ?? ''
    await nextTick()
    promptInput.value?.focus()
    promptInput.value?.select()
  },
)
</script>

<template>
  <UiDialog :open="!!ui.confirmState" :title="ui.confirmState?.title" @close="ui.resolveConfirm(false)">
    <p v-if="ui.confirmState?.message" class="text-sm leading-relaxed text-muted">{{ ui.confirmState.message }}</p>
    <template #footer>
      <UiButton variant="ghost" @click="ui.resolveConfirm(false)">{{ ui.confirmState?.cancelLabel ?? 'Cancel' }}</UiButton>
      <UiButton :variant="ui.confirmState?.danger ? 'danger' : 'primary'" autofocus @click="ui.resolveConfirm(true)">
        {{ ui.confirmState?.confirmLabel ?? 'Confirm' }}
      </UiButton>
    </template>
  </UiDialog>

  <UiDialog :open="!!ui.promptState" :title="ui.promptState?.title" @close="ui.resolvePrompt(null)">
    <form id="clip-prompt" @submit.prevent="ui.resolvePrompt(promptValue)">
      <label v-if="ui.promptState?.label" class="label" for="clip-prompt-input">{{ ui.promptState.label }}</label>
      <input id="clip-prompt-input" ref="promptInput" v-model="promptValue" class="field" maxlength="120" />
    </form>
    <template #footer>
      <UiButton variant="ghost" @click="ui.resolvePrompt(null)">Cancel</UiButton>
      <UiButton variant="primary" type="submit" form="clip-prompt" @click="ui.resolvePrompt(promptValue)">
        {{ ui.promptState?.confirmLabel ?? 'Save' }}
      </UiButton>
    </template>
  </UiDialog>
</template>
