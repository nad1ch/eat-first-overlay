import { createApp } from 'vue'
import './styles/theme.css'
import './styles/motion.css'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { initAnalytics, trackTechnicalEvent } from './analytics/bootstrap.js'
import { ensureMetaDescription } from './constants/seo.js'

ensureMetaDescription()
initAnalytics()

if (typeof window !== 'undefined') {
  window.addEventListener('eat-first:listener-error', (ev) => {
    const d = ev.detail || {}
    trackTechnicalEvent('FirestoreListenerError', {
      scope: String(d.scope ?? ''),
      code: String(d.code ?? ''),
    })
  })
}

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null
let initialTheme = saved === 'light' || saved === 'dark' ? saved : 'dark'
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme)
}

const app = createApp(App)
app.use(i18n)
app.use(router)
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('lang', i18n.global.locale.value)
}
app.mount('#app')
