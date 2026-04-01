import { createRouter, createWebHistory } from 'vue-router'
import OverlayPage from './pages/OverlayPage.vue'
import ControlPage from './pages/ControlPage.vue'
import JoinPage from './pages/JoinPage.vue'
import AdminGatePage from './pages/AdminGatePage.vue'

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
})
