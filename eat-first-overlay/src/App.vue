<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTheme } from './composables/useTheme.js'
import { hostControlChromeStore } from './composables/hostControlChrome.js'
import HostControlChromeBar from './components/showdesk/HostControlChromeBar.vue'
import AppHeaderToolbar from './ui/organisms/AppHeaderToolbar.vue'
import AppSiteFooter from './ui/organisms/AppSiteFooter.vue'
import { persistLocale, LOCALE_OPTIONS } from './i18n'

const localeMenuOptions = LOCALE_OPTIONS.map((o) => ({ value: o.code, label: o.label }))

const route = useRoute()
const { t, locale } = useI18n()
const { theme, toggleTheme } = useTheme()

const routeViewKey = computed(() => {
  if (route.path === '/control') {
    const q = route.query
    return ['control', String(q.game ?? ''), String(q.role ?? ''), String(q.key ?? '')].join('|')
  }
  return route.fullPath
})

const showChrome = computed(() => route.path !== '/overlay')
const hostChromeOn = computed(() => hostControlChromeStore.active === true)
const votingGlow = computed(() => Boolean(hostControlChromeStore.gameRoom?.voting?.active))
const routeTransition = computed(() => (route.path === '/overlay' ? 'route-fade' : 'route-slide'))
const themeIcon = computed(() => (theme.value === 'dark' ? '☀️' : '🌙'))
const themeLabel = computed(() => (theme.value === 'dark' ? t('app.themeLight') : t('app.themeDark')))
const footerYear = new Date().getFullYear()
</script>

<template>
  <div class="app-layout">
    <header
      v-if="showChrome"
      class="app-shell-header"
      :class="{ 'app-shell-header--host': hostChromeOn, 'app-shell-header--vote-on': votingGlow }"
    >
      <div class="app-shell-header__top">
        <span class="app-shell-brand">{{
          hostChromeOn ? t('app.brandHost') : t('game.title')
        }}</span>
        <AppHeaderToolbar
          :locale-menu-options="localeMenuOptions"
          :model-locale="locale"
          :theme-icon="themeIcon"
          :theme-label="themeLabel"
          @update:locale="persistLocale"
          @toggle-theme="toggleTheme"
        />
      </div>
      <HostControlChromeBar v-if="hostChromeOn" />
    </header>
    <main class="app-shell-main" :class="{ 'app-shell-main--full': !showChrome }">
      <RouterView v-slot="{ Component }">
        <Transition :name="routeTransition" mode="out-in">
          <component :is="Component" :key="routeViewKey" />
        </Transition>
      </RouterView>
    </main>

    <AppSiteFooter v-if="showChrome" :year="footerYear" />
  </div>
</template>

<style scoped>
.app-shell-main--full {
  flex: 1;
  min-height: 100vh;
}
</style>
