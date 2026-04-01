<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { subscribeToPlayers } from '../services/gameService'

const route = useRoute()
const router = useRouter()

const gameInput = ref('test1')

watch(
  () => route.query.game,
  (g) => {
    if (g != null && String(g).trim()) gameInput.value = String(g).trim()
  },
  { immediate: true },
)

const gameId = computed(() => {
  const g = String(gameInput.value ?? '').trim()
  return g || 'test1'
})

const players = ref([])
let unsub = null

watch(
  gameId,
  (gid) => {
    if (unsub) {
      unsub()
      unsub = null
    }
    unsub = subscribeToPlayers(gid, (list) => {
      players.value = Array.isArray(list) ? list : []
    })
  },
  { immediate: true },
)

onUnmounted(() => {
  if (unsub) unsub()
})

const sortedPlayers = computed(() => {
  const list = [...players.value]
  list.sort((a, b) => {
    const na = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0
    const nb = parseInt(String(b.id).replace(/\D/g, ''), 10) || 0
    return na - nb
  })
  return list
})

function slotNum(id) {
  const s = String(id ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

function openOverlay(pid) {
  router.push({ path: '/overlay', query: { game: gameId.value, player: String(pid).trim() } })
}

function goAdmin() {
  router.push({ path: '/admin', query: { game: gameId.value } })
}

function applyGameFromInput() {
  router.replace({ path: '/join', query: { game: gameId.value } })
}
</script>

<template>
  <div class="join">
    <header class="join-head">
      <p class="eyebrow">Лобі</p>
      <h1 class="title">Кого ми з’їмо першим</h1>
      <p class="sub">Обери слот — відкриється персональний оверлей для OBS.</p>
    </header>

    <div class="game-bar">
      <label class="lbl" for="gid">Game id</label>
      <div class="game-row">
        <input id="gid" v-model="gameInput" type="text" class="inp" autocomplete="off" />
        <button type="button" class="btn-go" @click="applyGameFromInput">OK</button>
      </div>
    </div>

    <section class="cards-wrap">
      <h2 class="sec-title">Гравці</h2>
      <p v-if="sortedPlayers.length === 0" class="empty">Немає гравців у цій кімнаті (ще).</p>
      <div v-else class="cards">
        <button
          v-for="p in sortedPlayers"
          :key="p.id"
          type="button"
          class="pcard"
          :class="{ elim: p.eliminated === true }"
          @click="openOverlay(p.id)"
        >
          <span class="num">{{ slotNum(p.id) }}</span>
          <span class="nm">{{ (p.name && String(p.name).trim()) || '—' }}</span>
          <span v-if="p.eliminated" class="badge">вибув</span>
        </button>
      </div>
    </section>

    <footer class="join-foot">
      <button type="button" class="btn-admin" @click="goAdmin">Admin</button>
    </footer>
  </div>
</template>

<style scoped>
.join {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 1.5rem 1.25rem 2.5rem;
  max-width: 640px;
  margin: 0 auto;
  font-family: Inter, system-ui, sans-serif;
  color: #e2e8f0;
  background: radial-gradient(120% 80% at 50% 0%, rgba(88, 28, 135, 0.35), transparent),
    linear-gradient(180deg, #0a0614 0%, #050308 100%);
}

.join-head {
  margin-bottom: 1.5rem;
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
  margin: 0.35rem 0 0.25rem;
  font-family: Orbitron, sans-serif;
  font-size: 1.35rem;
  font-weight: 800;
  color: #faf5ff;
  line-height: 1.2;
}

.sub {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: rgba(186, 181, 200, 0.85);
}

.game-bar {
  margin-bottom: 1.75rem;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  background: rgba(10, 8, 22, 0.75);
  border: 1px solid rgba(168, 85, 247, 0.2);
}

.lbl {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.45);
}

.game-row {
  display: flex;
  gap: 0.5rem;
}

.inp {
  flex: 1;
  padding: 0.55rem 0.7rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(8, 6, 20, 0.9);
  color: #f1f5f9;
  font-size: 0.9rem;
}

.btn-go {
  padding: 0.55rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(168, 85, 247, 0.45);
  background: rgba(88, 28, 135, 0.4);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.sec-title {
  margin: 0 0 0.65rem;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: Orbitron, sans-serif;
  color: #ede9fe;
}

.empty {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(196, 181, 253, 0.5);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.55rem;
}

.pcard {
  text-align: left;
  padding: 0.75rem 0.85rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 8, 24, 0.88);
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.pcard:hover {
  border-color: rgba(168, 85, 247, 0.45);
  box-shadow: 0 0 18px rgba(168, 85, 247, 0.15);
}

.pcard.elim {
  opacity: 0.55;
  border-color: rgba(185, 28, 28, 0.35);
}

.num {
  font-family: Orbitron, sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  color: rgba(196, 181, 253, 0.55);
}

.nm {
  font-size: 0.9rem;
  font-weight: 700;
  color: #f5f3ff;
}

.badge {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fecaca;
  align-self: flex-start;
}

.join-foot {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.btn-admin {
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.35);
  color: rgba(226, 232, 240, 0.85);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-admin:hover {
  border-color: rgba(168, 85, 247, 0.4);
  color: #fff;
}
</style>
