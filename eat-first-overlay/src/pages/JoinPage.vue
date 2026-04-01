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

function openPersonalOverlay(pid) {
  router.push({ path: '/overlay', query: { game: gameId.value, player: String(pid).trim() } })
}

function goObsGlobal() {
  router.push({ path: '/overlay', query: { game: gameId.value } })
}

function goPlayerControl() {
  router.push({ path: '/control', query: { game: gameId.value, player: 'p1' } })
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
    <div class="join-bg" aria-hidden="true" />

    <header class="join-hero">
      <p class="eyebrow">Live show</p>
      <h1 class="title">Кого ми з’їмо першим</h1>
      <p class="lead">Лобі кімнати · підключи OBS, зайди як гравець або відкрий пульт ведучого.</p>
    </header>

    <div class="game-bar">
      <label class="lbl" for="gid">Game id</label>
      <div class="game-row">
        <input id="gid" v-model="gameInput" type="text" class="inp" autocomplete="off" />
        <button type="button" class="btn-go" @click="applyGameFromInput">OK</button>
      </div>
    </div>

    <div class="cta-grid">
      <button type="button" class="cta cta--obs" @click="goObsGlobal">
        <span class="cta-ico">🎥</span>
        <span class="cta-t">OBS overlay</span>
        <span class="cta-d">Загальний екран для всіх гравців</span>
      </button>
      <button type="button" class="cta cta--play" @click="goPlayerControl">
        <span class="cta-ico">🎮</span>
        <span class="cta-t">Увійти в гру</span>
        <span class="cta-d">Панель гравця · картки та карта</span>
      </button>
      <button type="button" class="cta cta--host" @click="goAdmin">
        <span class="cta-ico">🔐</span>
        <span class="cta-t">Ведучий</span>
        <span class="cta-d">Пульт з ключем доступу</span>
      </button>
    </div>

    <section class="cards-wrap">
      <h2 class="sec-title">Персональні оверлеї</h2>
      <p class="sec-sub">Клік по слоту — тільки цей гравець у OBS (камера + HUD).</p>
      <p v-if="sortedPlayers.length === 0" class="empty">Ще немає гравців у Firestore для цієї кімнати.</p>
      <div v-else class="cards">
        <button
          v-for="p in sortedPlayers"
          :key="p.id"
          type="button"
          class="pcard"
          :class="{ elim: p.eliminated === true }"
          @click="openPersonalOverlay(p.id)"
        >
          <span class="num">Гравець {{ slotNum(p.id) }}</span>
          <span class="nm">{{ (p.name && String(p.name).trim()) || '—' }}</span>
          <span v-if="p.eliminated" class="badge">вибув</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.join {
  position: relative;
  min-height: 100vh;
  box-sizing: border-box;
  padding: 1.75rem 1.25rem 3rem;
  max-width: 720px;
  margin: 0 auto;
  font-family: Inter, system-ui, sans-serif;
  color: #e2e8f0;
  overflow-x: hidden;
}

.join-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(ellipse 100% 80% at 50% -20%, rgba(168, 85, 247, 0.28), transparent 55%),
    linear-gradient(180deg, #070510 0%, #020108 100%);
  pointer-events: none;
}

.join-hero,
.game-bar,
.cta-grid,
.cards-wrap {
  position: relative;
  z-index: 1;
}

.join-hero {
  margin-bottom: 1.5rem;
  text-align: center;
}

.eyebrow {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.5);
}

.title {
  margin: 0.5rem 0 0.4rem;
  font-family: Orbitron, sans-serif;
  font-size: clamp(1.4rem, 4.5vw, 1.85rem);
  font-weight: 800;
  color: #faf5ff;
  line-height: 1.15;
}

.lead {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.5;
  color: rgba(186, 181, 200, 0.88);
  max-width: 34rem;
  margin-inline: auto;
}

.game-bar {
  margin-bottom: 1.5rem;
  padding: 1rem 1.15rem;
  border-radius: 16px;
  background: rgba(10, 8, 22, 0.82);
  border: 1px solid rgba(168, 85, 247, 0.2);
  backdrop-filter: blur(10px);
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
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(8, 6, 20, 0.92);
  color: #f1f5f9;
  font-size: 0.9rem;
}

.btn-go {
  padding: 0.6rem 1.1rem;
  border-radius: 12px;
  border: 1px solid rgba(168, 85, 247, 0.45);
  background: rgba(88, 28, 135, 0.45);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.btn-go:hover {
  transform: scale(1.04);
}

.cta-grid {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-bottom: 2rem;
}

.cta {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 0.85rem;
  row-gap: 0.15rem;
  padding: 1rem 1.15rem;
  text-align: left;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 8, 24, 0.75);
  color: inherit;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.18s,
    box-shadow 0.18s;
}

.cta:hover {
  transform: scale(1.02);
  border-color: rgba(168, 85, 247, 0.45);
  box-shadow: 0 0 28px rgba(168, 85, 247, 0.22);
}

.cta--obs:hover {
  box-shadow: 0 0 32px rgba(56, 189, 248, 0.18);
  border-color: rgba(56, 189, 248, 0.35);
}

.cta--play:hover {
  box-shadow: 0 0 32px rgba(74, 222, 128, 0.15);
  border-color: rgba(74, 222, 128, 0.3);
}

.cta--host:hover {
  box-shadow: 0 0 32px rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.35);
}

.cta-ico {
  grid-row: span 2;
  font-size: 1.65rem;
  line-height: 1;
  align-self: center;
}

.cta-t {
  font-size: 0.95rem;
  font-weight: 700;
  font-family: Orbitron, sans-serif;
  color: #f5f3ff;
}

.cta-d {
  font-size: 0.78rem;
  color: rgba(186, 181, 200, 0.82);
  line-height: 1.35;
}

.sec-title {
  margin: 0 0 0.35rem;
  font-size: 0.9rem;
  font-weight: 700;
  font-family: Orbitron, sans-serif;
  color: #ede9fe;
}

.sec-sub {
  margin: 0 0 1rem;
  font-size: 0.78rem;
  color: rgba(196, 181, 253, 0.45);
  line-height: 1.4;
}

.empty {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(196, 181, 253, 0.5);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 0.65rem;
}

.pcard {
  text-align: left;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 6, 22, 0.88);
  color: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transition:
    transform 0.18s ease,
    border-color 0.18s,
    box-shadow 0.18s;
}

.pcard:hover {
  transform: translateY(-2px) scale(1.02);
  border-color: rgba(168, 85, 247, 0.5);
  box-shadow: 0 8px 32px rgba(168, 85, 247, 0.2);
}

.pcard.elim {
  opacity: 0.55;
  border-color: rgba(185, 28, 28, 0.35);
}

.pcard.elim:hover {
  box-shadow: 0 8px 24px rgba(185, 28, 28, 0.15);
}

.num {
  font-family: Orbitron, sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  color: rgba(196, 181, 253, 0.55);
}

.nm {
  font-size: 0.92rem;
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
</style>
