import { ref } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { ADMIN_KEY, HOST_PANEL_QUERY_KEY, HOST_PANEL_QUERY_VALUE } from './config/access.js'
import { getValidatedPersistedHostKey } from './utils/persistedHostSession.js'
import { getPersistedGameId } from './utils/persistedGameId.js'
import { trackPageView } from './analytics/bootstrap.js'

/** Миттєвий перехід між /admin і /control — без «привиду» форми логіну під час анімації. */
export const adminControlTransitionInstant = ref(false)

function resolveAdminGateGameId(query) {
  const g = query?.game
  if (g != null && String(g).trim()) return String(g).trim()
  const p = getPersistedGameId()
  if (p) return p
  return 'test1'
}

const JoinPage = () => import('./pages/JoinPage.vue')
const AdminGatePage = () => import('./pages/AdminGatePage.vue')
const OverlayPage = () => import('./pages/OverlayPage.vue')
const ControlPage = () => import('./pages/ControlPage.vue')

const routes = [
  { path: '/join', name: 'join', component: JoinPage },
  {
    path: '/admin',
    name: 'admin',
    component: AdminGatePage,
    beforeEnter(to) {
      if (getValidatedPersistedHostKey(ADMIN_KEY)) {
        return {
          path: '/control',
          query: { game: resolveAdminGateGameId(to.query), [HOST_PANEL_QUERY_KEY]: HOST_PANEL_QUERY_VALUE },
        }
      }
    },
  },
  { path: '/overlay', name: 'overlay', component: OverlayPage },
  { path: '/control', name: 'control', component: ControlPage },
  { path: '/', redirect: '/join' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    // Той самий шлях, лише query (наприклад ?player= на /control) — зберегти позицію скролу.
    if (from.path && to.path === from.path) return false
    return { top: 0, left: 0 }
  },
})

router.beforeEach((to, from) => {
  const shell = ['/admin', '/control']
  adminControlTransitionInstant.value =
    Boolean(from.path) && shell.includes(from.path) && shell.includes(to.path)
})

const DOC_TITLE_BASE = 'Кого ми з’їмо першим'

router.afterEach((to) => {
  const byPath = {
    '/join': `${DOC_TITLE_BASE} · Лобі`,
    '/admin': `${DOC_TITLE_BASE} · Доступ ведучого`,
    '/control': `${DOC_TITLE_BASE} · Панель`,
    '/overlay': `${DOC_TITLE_BASE} · Overlay`,
  }
  document.title = byPath[to.path] ?? DOC_TITLE_BASE
  trackPageView(to.fullPath)
})
