<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ADMIN_KEY } from '../config/access.js'

const route = useRoute()
const router = useRouter()

const keyInput = ref('')
const err = ref('')

const gameId = computed(() => {
  const g = String(route.query.game ?? '').trim()
  return g || 'test1'
})

watch(
  () => route.query.game,
  () => {
    err.value = ''
  },
)

function submit() {
  err.value = ''
  if (String(keyInput.value).trim() !== ADMIN_KEY) {
    err.value = 'Невірний ключ доступу.'
    return
  }
  router.replace({
    path: '/control',
    query: { game: gameId.value, role: 'admin', key: ADMIN_KEY },
  })
}

function backJoin() {
  router.push({ path: '/join', query: { game: gameId.value } })
}
</script>

<template>
  <div class="gate anim-fade-in">
    <p class="eyebrow">Ведучий</p>
    <h1 class="title">Admin</h1>
    <p class="hint">Кімната: <strong>{{ gameId }}</strong></p>

    <form class="form" @submit.prevent="submit">
      <label class="lbl" for="k">Ключ</label>
      <input id="k" v-model="keyInput" type="password" class="inp" autocomplete="off" />
      <p v-if="err" class="err">{{ err }}</p>
      <button type="submit" class="btn">Увійти в control</button>
    </form>

    <button type="button" class="link-back" @click="backJoin">← До лобі</button>
  </div>
</template>

<style scoped>
.gate {
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  padding: clamp(1.5rem, 4vh, 2.5rem) 1.25rem;
  max-width: 22rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-family: var(--font-body);
  color: var(--text-body);
  background: transparent;
}

.eyebrow {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.title {
  margin: 0.4rem 0 0.5rem;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text-title);
}

.hint {
  margin: 0 0 1.25rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.hint strong {
  color: var(--text-heading);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.lbl {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.inp {
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--border-input);
  background: var(--bg-input);
  color: var(--text-body);
  font-size: 0.95rem;
}

.err {
  margin: 0;
  font-size: 0.8rem;
  color: var(--error-text);
}

.btn {
  margin-top: 0.35rem;
  padding: 0.7rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: var(--accent-fill);
  color: var(--text-main);
  font-weight: 700;
  cursor: pointer;
}

.link-back {
  margin-top: 1.5rem;
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.link-back:hover {
  color: var(--text-heading);
}
</style>
