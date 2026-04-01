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
  <div class="gate">
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
  min-height: 100vh;
  box-sizing: border-box;
  padding: 2rem 1.25rem;
  max-width: 400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-family: Inter, system-ui, sans-serif;
  color: #e2e8f0;
  background: radial-gradient(100% 60% at 50% 0%, rgba(88, 28, 135, 0.4), transparent),
    #050308;
}

.eyebrow {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.45);
}

.title {
  margin: 0.4rem 0 0.5rem;
  font-family: Orbitron, sans-serif;
  font-size: 1.5rem;
  font-weight: 800;
  color: #faf5ff;
}

.hint {
  margin: 0 0 1.25rem;
  font-size: 0.85rem;
  color: rgba(186, 181, 200, 0.9);
}

.hint strong {
  color: #e9d5ff;
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
  color: rgba(196, 181, 253, 0.45);
}

.inp {
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(8, 6, 20, 0.92);
  color: #f1f5f9;
  font-size: 0.95rem;
}

.err {
  margin: 0;
  font-size: 0.8rem;
  color: #fecaca;
}

.btn {
  margin-top: 0.35rem;
  padding: 0.7rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(168, 85, 247, 0.5);
  background: rgba(88, 28, 135, 0.45);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.link-back {
  margin-top: 1.5rem;
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: rgba(196, 181, 253, 0.55);
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.link-back:hover {
  color: #e9d5ff;
}
</style>
