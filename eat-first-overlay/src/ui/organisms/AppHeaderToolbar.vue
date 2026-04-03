<script setup>
import { useI18n } from 'vue-i18n'
import StreamerBrandLink from '../atoms/StreamerBrandLink.vue'
import ThemeToggleButton from '../atoms/ThemeToggleButton.vue'
import UiMenuSelect from '../molecules/UiMenuSelect.vue'

defineProps({
  localeMenuOptions: { type: Array, required: true },
  modelLocale: { type: String, required: true },
  themeIcon: { type: String, required: true },
  themeLabel: { type: String, required: true },
})

defineEmits(['update:locale', 'toggle-theme'])

const { t } = useI18n()
</script>

<template>
  <div class="app-shell-header__end">
    <StreamerBrandLink :aria-label="t('app.twitchAria')" />
    <UiMenuSelect
      :model-value="modelLocale"
      :options="localeMenuOptions"
      :aria-label="t('app.langAria')"
      variant="header"
      @update:model-value="$emit('update:locale', $event)"
    />
    <ThemeToggleButton :label="themeLabel" :icon="themeIcon" @click="$emit('toggle-theme')" />
  </div>
</template>
