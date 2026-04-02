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

const themeIcon = computed(() => (theme.value === 'dark' ? '☀️' : '🌙'))
const themeLabel = computed(() => (theme.value === 'dark' ? 'Світла тема' : 'Темна тема'))
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
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
}

.app-shell-main--full {
  min-height: 100vh;
}
</style>
