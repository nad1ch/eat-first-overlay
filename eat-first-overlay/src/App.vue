<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTheme } from './composables/useTheme.js'
import { hostControlChromeStore } from './composables/hostControlChrome.js'
import HostControlChromeBar from './components/showdesk/HostControlChromeBar.vue'
import AppHeaderNav from './ui/molecules/AppHeaderNav.vue'
import AppHeaderToolbar from './ui/organisms/AppHeaderToolbar.vue'
import AppSiteFooter from './ui/organisms/AppSiteFooter.vue'
import { persistLocale, LOCALE_OPTIONS } from './i18n'
import { useSeoCanonical } from './composables/useSeoCanonical.js'
import { adminControlTransitionInstant } from './router.js'

const localeMenuOptions = LOCALE_OPTIONS.map((o) => ({ value: o.code, label: o.label }))

useSeoCanonical()

const route = useRoute()
const { t, locale } = useI18n()
const { theme, toggleTheme } = useTheme()

/** Не включаємо `player` у ключ: інакше кожна зміна слота в URL повністю перемонтовує ControlPage (блимання, скидання вибору в ростері). */
const routeViewKey = computed(() => {
  if (route.path === '/control') {
    const q = route.query
    return ['control', String(q.game ?? ''), String(q.host ?? '')].join('|')
  }
  return route.fullPath
})

const showChrome = computed(() => route.path !== '/overlay')
const hostChromeOn = computed(() => hostControlChromeStore.active === true)
const votingGlow = computed(() => Boolean(hostControlChromeStore.gameRoom?.voting?.active))
const routeTransition = computed(() => {
  if (route.path === '/overlay') return 'route-fade'
  if (adminControlTransitionInstant.value) return 'route-none'
  return 'route-slide'
})
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
        <div class="app-shell-header__start">
          <AppHeaderNav />
          <span class="app-shell-brand">{{
            hostChromeOn ? t('app.brandHost') : t('game.title')
          }}</span>
        </div>
        <AppHeaderToolbar
          :locale-menu-options="localeMenuOptions"
          :model-locale="locale"
          :theme-icon="themeIcon"
          :theme-label="themeLabel"
          @update:locale="persistLocale"
          @toggle-theme="toggleTheme"
        />
      </div>
      <div v-if="hostChromeOn" class="app-shell-header__host-stack">
        <p
          v-if="hostControlChromeStore.summaryLine"
          class="app-shell-host-summary"
          role="status"
          :title="hostControlChromeStore.summaryLine"
        >
          <span class="app-shell-host-summary__inner">{{ hostControlChromeStore.summaryLine }}</span>
        </p>
        <HostControlChromeBar />
      </div>
    </header>
    <main class="app-shell-main" :class="{ 'app-shell-main--full': !showChrome }">
      <div
        class="app-shell-main__viewport"
        :class="{ 'app-shell-main__viewport--chrome': showChrome }"
      >
        <RouterView v-slot="{ Component }">
          <Transition :name="routeTransition">
            <component :is="Component" :key="routeViewKey" />
          </Transition>
        </RouterView>
      </div>
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
