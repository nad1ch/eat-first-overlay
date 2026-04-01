import { createRouter, createWebHistory } from 'vue-router'
import OverlayPage from './pages/OverlayPage.vue'
import ControlPage from './pages/ControlPage.vue'

const routes = [
  { path: '/overlay', name: 'overlay', component: OverlayPage },
  { path: '/control', name: 'control', component: ControlPage },
  { path: '/', redirect: '/control' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
