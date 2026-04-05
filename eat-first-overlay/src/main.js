import { createApp } from 'vue'

/** Діагностика: після deploy у DevTools → Console має бути wss://…, не undefined/порожній рядок. */
console.log('LIVEKIT_URL:', import.meta.env.VITE_LIVEKIT_URL)

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
import { callableApiEnabled } from './services/callableApi.js'
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
  if (callableApiEnabled()) {
    await ensureAnonymousAuth().catch((e) => {
      const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : ''
      console.warn(
        '[auth] Anonymous sign-in не вдався (потрібно для Cloud Functions). ' +
          'У Firebase Console: Authentication → почати/увімкнути провайдер Anonymous. ' +
          'Якщо Functions не використовуєш — прибери VITE_FUNCTIONS_REGION з env.',
        code || e,
      )
    })
  }
  app.mount('#app')
})()
