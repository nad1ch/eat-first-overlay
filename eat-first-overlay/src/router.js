import { createRouter, createWebHistory } from 'vue-router'
import { trackPageView } from './analytics/bootstrap.js'

const JoinPage = () => import('./pages/JoinPage.vue')
const AdminGatePage = () => import('./pages/AdminGatePage.vue')
const OverlayPage = () => import('./pages/OverlayPage.vue')
const ControlPage = () => import('./pages/ControlPage.vue')

const routes = [
  { path: '/join', name: 'join', component: JoinPage },
  { path: '/admin', name: 'admin', component: AdminGatePage },
  { path: '/overlay', name: 'overlay', component: OverlayPage },
  { path: '/control', name: 'control', component: ControlPage },
  { path: '/', redirect: '/join' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0, left: 0 }
  },
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
