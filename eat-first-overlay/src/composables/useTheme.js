import { ref } from 'vue'

function readStoredTheme() {
  if (typeof localStorage === 'undefined') return 'dark'
  const s = localStorage.getItem('theme')
  if (s === 'light' || s === 'dark') return s
  return 'dark'
}

const theme = ref(readStoredTheme())

function setTheme(t) {
  const next = t === 'light' ? 'light' : 'dark'
  theme.value = next
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', next)
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('theme', next)
  }
}

function toggleTheme() {
  setTheme(theme.value === 'dark' ? 'light' : 'dark')
}

export function useTheme() {
  return { theme, toggleTheme, setTheme }
}
