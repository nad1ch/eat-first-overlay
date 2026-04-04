import { createApp } from 'vue'
import './styles/theme.css'
import './styles/motion.css'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'

/** Паралельне підвантаження chunk поточного шляху під час ініціалізації — швидший LCP на lazy-маршрутах. */
if (typeof window !== 'undefined') {
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/'
  const prefetchers = {
    '/join': () => import('./pages/JoinPage.vue'),
    '/admin': () => import('./pages/AdminGatePage.vue'),
    '/control': () => import('./pages/ControlPage.vue'),
    '/overlay': () => import('./pages/OverlayPage.vue'),
  }
  const run = prefetchers[path]
  if (run) void run()
}
import { initAnalytics, trackTechnicalEvent } from './analytics/bootstrap.js'
import { ensureMetaDescription } from './constants/seo.js'
import { ensureAnonymousAuth } from './services/authBootstrap.js'

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

;(async () => {
  await ensureAnonymousAuth().catch((e) => console.warn('[auth bootstrap]', e))
  app.mount('#app')
})()
