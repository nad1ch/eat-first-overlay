import { createApp } from 'vue'
import './styles/theme.css'
import './styles/motion.css'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { initAnalytics } from './analytics/bootstrap.js'
import { ensureMetaDescription } from './constants/seo.js'

ensureMetaDescription()
initAnalytics()

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null
/** За замовчуванням dark. Опційно: без ключа можна підхопити ОС — розкоментуй наступний рядок і прибери 'dark'. */
let initialTheme = saved === 'light' || saved === 'dark' ? saved : 'dark'
// if (!saved && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) initialTheme = 'light'
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
