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

function goGlobalOverlay() {
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

const globalOverlayUrl = computed(() => {
  const h = router.resolve({ path: '/overlay', query: { game: gameId.value } }).href
  if (typeof window === 'undefined') return h
  return new URL(h, window.location.origin).href
})
</script>

<template>
  <div class="join">
    <div class="join-bg" aria-hidden="true" />

    <header class="join-hero">
      <p class="eyebrow">Live show</p>
      <h1 class="title">Кого ми з’їмо першим</h1>
      <p class="lead">
        Лобі кімнати: персональні камери глядачі бачать через оверлей кожного стрімера — глобальна сітка лише
        допоміжна.
      </p>
    </header>

    <ol class="join-steps">
      <li><span class="join-steps__n">1</span> Обери свою роль</li>
      <li><span class="join-steps__n">2</span> Відкрий свій overlay</li>
      <li><span class="join-steps__n">3</span> Встав у OBS / virtual camera</li>
    </ol>

    <div class="game-bar">
      <label class="lbl" for="gid">Game id</label>
      <div class="game-row">
        <input id="gid" v-model="gameInput" type="text" class="inp" autocomplete="off" />
        <button type="button" class="btn-go" @click="applyGameFromInput">OK</button>
      </div>
    </div>

    <section class="roles" aria-labelledby="roles-title">
      <h2 id="roles-title" class="roles-title">Хто ти зараз?</h2>
      <p class="roles-hint">Три входи — без зайвого тексту в ефірі.</p>
      <div class="cta-grid">
        <button type="button" class="cta cta--play" @click="goPlayerControl">
          <span class="cta-ico" aria-hidden="true">🎤</span>
          <span class="cta-t">Я гравець</span>
          <span class="cta-d">Панель слоту · карти · активна карта</span>
        </button>
        <button type="button" class="cta cta--host" @click="goAdmin">
          <span class="cta-ico" aria-hidden="true">🎮</span>
          <span class="cta-t">Я ведучий</span>
          <span class="cta-d">Пульт шоу · таймер · фази (ключ доступу)</span>
        </button>
        <button type="button" class="cta cta--obs" @click="goGlobalOverlay">
          <span class="cta-ico" aria-hidden="true">🎥</span>
          <span class="cta-t">OBS · оверлей</span>
          <span class="cta-d">Глобальна сітка або джерело для сцени</span>
        </button>
      </div>
    </section>

    <section class="obs-hint" aria-labelledby="obs-hint-title">
      <h2 id="obs-hint-title" class="obs-hint__title">OBS · швидкий старт</h2>
      <ol class="obs-hint__list">
        <li>Джерело: <strong>Browser</strong> (або Browser Source).</li>
        <li>Встав URL персонального оверлею (знизу, по слоту) або глобального — залежно від сцени.</li>
        <li>Розмір: на весь кадр джерела; у властивостях увімкни прозорість фону, якщо є.</li>
        <li>Оновлення: за потреби ввімкни «Refresh browser when scene becomes active».</li>
      </ol>
      <p class="obs-hint__url">
        <span class="obs-hint__url-label">Приклад глобального URL</span>
        <code class="obs-hint__code">{{ globalOverlayUrl }}</code>
      </p>
    </section>

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
  padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 3vw, 1.75rem) 3.5rem;
  max-width: min(52rem, 100%);
  margin: 0 auto;
  font-family: Inter, system-ui, sans-serif;
  color: var(--text-body);
  overflow-x: hidden;
}

.join-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  background: var(--bg-body);
  pointer-events: none;
}

.join-hero,
.join-steps,
.game-bar,
.roles,
.cards-wrap {
  position: relative;
  z-index: 1;
}

.join-steps {
  list-style: none;
  margin: 0 auto 1.35rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  max-width: 26rem;
  box-sizing: border-box;
}

.join-steps li {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  margin: 0;
  padding: 0.35rem 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-body);
  border-bottom: 1px solid var(--join-step-border);
}

.join-steps li:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.join-steps__n {
  flex-shrink: 0;
  width: 1.35rem;
  height: 1.35rem;
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  font-size: 0.68rem;
  font-weight: 800;
  font-family: Orbitron, sans-serif;
  color: var(--text-heading);
  background: var(--accent-fill);
  border: 1px solid var(--border-strong);
}

.roles {
  margin-bottom: 1.75rem;
}

.roles-title {
  margin: 0 0 0.35rem;
  text-align: center;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-family: Orbitron, sans-serif;
  color: var(--text-muted);
}

.roles-hint {
  margin: 0 0 1rem;
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.4;
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
  color: var(--text-muted);
}

.title {
  margin: 0.5rem 0 0.4rem;
  font-family: Orbitron, sans-serif;
  font-size: clamp(1.4rem, 4.5vw, 1.85rem);
  font-weight: 800;
  color: var(--text-title);
  line-height: 1.15;
}

.lead {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--text-secondary);
  max-width: 34rem;
  margin-inline: auto;
}

.game-bar {
  margin-bottom: 1.5rem;
  padding: 1rem 1.15rem;
  border-radius: 16px;
  background: var(--bg-card-solid);
  border: 1px solid var(--border-strong);
  box-shadow: 0 0 24px var(--accent-glow);
}

.lbl {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.game-row {
  display: flex;
  gap: 0.5rem;
}

.inp {
  flex: 1;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--border-input);
  background: var(--bg-input);
  color: var(--text-body);
  font-size: 0.9rem;
}

.btn-go {
  padding: 0.6rem 1.1rem;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: var(--accent-fill);
  color: var(--text-main);
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.btn-go:hover {
  transform: scale(1.04);
}

.cta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15.5rem, 1fr));
  gap: 0.75rem;
}

.obs-hint {
  position: relative;
  z-index: 1;
  margin-bottom: 2rem;
  padding: 1.1rem 1.2rem 1.2rem;
  border-radius: 16px;
  border: 1px solid var(--border-cyan);
  background: var(--bg-obs-hint);
  box-shadow: 0 0 20px var(--glow-vote);
}

.obs-hint__title {
  margin: 0 0 0.65rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-cyan);
  font-family: Orbitron, sans-serif;
}

.obs-hint__list {
  margin: 0;
  padding-left: 1.15rem;
  font-size: 0.84rem;
  line-height: 1.55;
  color: var(--text-cyan-body);
}

.obs-hint__list li {
  margin-bottom: 0.35rem;
}

.obs-hint__list strong {
  color: var(--text-cyan-strong);
  font-weight: 600;
}

.obs-hint__url {
  margin: 1rem 0 0;
}

.obs-hint__url-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.obs-hint__code {
  display: block;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  font-size: 0.72rem;
  line-height: 1.4;
  word-break: break-all;
  background: var(--bg-code);
  border: 1px solid var(--border-subtle);
  color: var(--text-code);
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
  border: 1px solid var(--cta-border);
  background: var(--cta-bg);
  color: inherit;
  cursor: pointer;
  transition:
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.28s ease,
    box-shadow 0.28s ease;
}

.cta:hover {
  transform: translateY(-5px);
  border-color: var(--border-strong);
  box-shadow:
    0 10px 28px var(--shadow-deep),
    0 0 36px var(--glow-purple-lg);
}

.cta--obs:hover {
  box-shadow:
    0 10px 28px var(--shadow-deep),
    0 0 40px var(--glow-cyan-lg);
  border-color: var(--border-cyan-strong);
}

.cta--play:hover {
  box-shadow:
    0 10px 28px var(--shadow-deep),
    0 0 40px var(--glow-green-lg);
  border-color: rgba(74, 222, 128, 0.42);
}

.cta--host:hover {
  box-shadow:
    0 10px 28px var(--shadow-deep),
    0 0 40px var(--glow-amber-lg);
  border-color: rgba(251, 191, 36, 0.45);
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
  color: var(--text-title);
}

.cta-d {
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.35;
}

.sec-title {
  margin: 0 0 0.35rem;
  font-size: 0.9rem;
  font-weight: 700;
  font-family: Orbitron, sans-serif;
  color: var(--text-heading);
}

.sec-sub {
  margin: 0 0 1rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
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
  border: 1px solid var(--cta-border);
  background: var(--pcard-bg);
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
  border-color: var(--border-strong);
  box-shadow: 0 8px 32px var(--glow-purple-lg);
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
  color: var(--text-muted);
}

.nm {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-title);
}

.badge {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--error-text);
  align-self: flex-start;
}
</style>
