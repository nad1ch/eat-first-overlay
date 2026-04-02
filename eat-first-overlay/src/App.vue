<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme.js'
import { hostControlChromeStore } from './composables/hostControlChrome.js'
import HostControlChromeBar from './components/showdesk/HostControlChromeBar.vue'

const route = useRoute()
const { theme, toggleTheme } = useTheme()

const showChrome = computed(() => route.path !== '/overlay')

const hostChromeOn = computed(() => hostControlChromeStore.active === true)

const votingGlow = computed(() => Boolean(hostControlChromeStore.gameRoom?.voting?.active))

/** М’який перехід між сторінками (оверлей — лише fade). */
const routeTransition = computed(() => (route.path === '/overlay' ? 'route-fade' : 'route-slide'))

const themeIcon = computed(() => (theme.value === 'dark' ? '☀️' : '🌙'))
const themeLabel = computed(() => (theme.value === 'dark' ? 'Світла тема' : 'Темна тема'))

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
          hostChromeOn ? 'Ведучий · пульт' : 'Кого ми з’їмо першим'
        }}</span>
        <button
          type="button"
          class="theme-toggle"
          :title="themeLabel"
          :aria-label="themeLabel"
          @click="toggleTheme"
        >
          {{ themeIcon }}
        </button>
      </div>
      <HostControlChromeBar v-if="hostChromeOn" />
    </header>
    <main class="app-shell-main" :class="{ 'app-shell-main--full': !showChrome }">
      <RouterView v-slot="{ Component }">
        <Transition :name="routeTransition" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </main>

    <footer v-if="showChrome" class="app-site-footer">
      <div class="app-site-footer__inner">
        <div class="app-site-footer__logo-wrap">
          <img
            class="app-site-footer__logo"
            src="/brand-nad1ch.png"
            width="44"
            height="44"
            alt="Логотип nad1ch"
          />
        </div>
        <div class="app-site-footer__meta">
          <span class="app-site-footer__nick">nad1ch</span>
          <p class="app-site-footer__copy">
            © {{ footerYear }} nad1ch. Усі права захищено. «Кого ми з’їмо першим» — оригінальний
            інтерфейс шоу.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app-shell-main--full {
  flex: 1;
  min-height: 100vh;
}
</style>
