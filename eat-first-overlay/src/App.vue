<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme.js'
import { hostControlChromeStore } from './composables/hostControlChrome.js'
import HostControlChromeBar from './components/showdesk/HostControlChromeBar.vue'

const route = useRoute()
const { theme, toggleTheme } = useTheme()

/** На /control не включаємо `player` у key — інакше Vue перемонтовує всю сторінку при зміні слота ведучим. */
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

/** М’який перехід між сторінками (оверлей — лише fade). */
const routeTransition = computed(() => (route.path === '/overlay' ? 'route-fade' : 'route-slide'))

const themeIcon = computed(() => (theme.value === 'dark' ? '☀️' : '🌙'))
const themeLabel = computed(() => (theme.value === 'dark' ? 'Світла тема' : 'Темна тема'))

const footerYear = new Date().getFullYear()

const streamerTwitchUrl = 'https://www.twitch.tv/nad1ch'
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
        <div class="app-shell-header__end">
          <a
            class="app-shell-mini-brand"
            :href="streamerTwitchUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Канал nad1ch на Twitch (відкриється в новій вкладці)"
          >
            <img
              class="app-shell-mini-brand__logo"
              src="/brand-nad1ch.png"
              width="32"
              height="32"
              alt=""
            />
            <span class="app-shell-mini-brand__nick">nad1ch</span>
          </a>
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

    <footer v-if="showChrome" class="app-site-footer">
      <div class="app-site-footer__inner">
        <a
          class="app-site-footer__brand-link"
          :href="streamerTwitchUrl"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Канал nad1ch на Twitch (відкриється в новій вкладці)"
        >
          <div class="app-site-footer__logo-wrap">
            <img
              class="app-site-footer__logo"
              src="/brand-nad1ch.png"
              width="44"
              height="44"
              alt=""
            />
          </div>
          <span class="app-site-footer__nick">nad1ch</span>
        </a>
        <div class="app-site-footer__meta">
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
