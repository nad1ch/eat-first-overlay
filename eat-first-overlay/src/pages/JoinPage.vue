<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { subscribeToGameRoom, subscribeToPlayers } from '../services/gameService'
import { normalizeGameRoomPayload } from '../utils/gameRoomNormalize.js'
import AppPageLoader from '../components/ui/AppPageLoader.vue'

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
const gameRoomJoin = ref({})
let unsub = null
let unsubRoom = null

const joinGotPlayers = ref(false)
const joinGotRoom = ref(false)
const joinLobbyReady = ref(false)

watch(
  gameId,
  (gid) => {
    joinGotPlayers.value = false
    joinGotRoom.value = false
    joinLobbyReady.value = false
    if (unsub) {
      unsub()
      unsub = null
    }
    if (unsubRoom) {
      unsubRoom()
      unsubRoom = null
    }
    unsub = subscribeToPlayers(gid, (list) => {
      players.value = Array.isArray(list) ? list : []
      joinGotPlayers.value = true
    })
    unsubRoom = subscribeToGameRoom(gid, (d) => {
      gameRoomJoin.value = normalizeGameRoomPayload(d && typeof d === 'object' ? d : {})
      joinGotRoom.value = true
    })
  },
  { immediate: true },
)

watch(
  [joinGotPlayers, joinGotRoom],
  () => {
    if (joinGotPlayers.value && joinGotRoom.value) joinLobbyReady.value = true
  },
  { flush: 'post' },
)

onUnmounted(() => {
  if (unsub) unsub()
  if (unsubRoom) unsubRoom()
})

const SLOT_IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']

const slotsForGrid = computed(() => {
  const map = new Map(players.value.map((p) => [String(p.id), p]))
  return SLOT_IDS.map((id) => map.get(id) || { id, name: '', eliminated: false })
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

function openPlayerControl(pid) {
  router.push({ path: '/control', query: { game: gameId.value, player: String(pid).trim() } })
}

function scrollToPlayerSlots() {
  requestAnimationFrame(() => {
    document.getElementById('player-slots')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function goGlobalOverlay() {
  router.push({ path: '/overlay', query: { game: gameId.value } })
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

const TRAIT_KEYS = ['profession', 'health', 'phobia', 'luggage', 'fact', 'quirk']

function slotOverlayOpen(p) {
  if (!p || p.eliminated === true) return false
  if (p.identityRevealed === true) return true
  return TRAIT_KEYS.some((k) => {
    const c = p[k]
    return c && typeof c === 'object' && c.revealed === true
  })
}

function handUpJoin(pid) {
  const h = gameRoomJoin.value?.hands
  if (!h || typeof h !== 'object') return false
  return h[String(pid)] === true
}
</script>

<template>
  <div class="join">
    <AppPageLoader
      :visible="!joinLobbyReady"
      label="Підключаємось до кімнати…"
    />
    <div class="join-bg" aria-hidden="true" />

    <header class="join-hero anim-slide-up">
      <p class="eyebrow">Live show</p>
      <h1 class="title">Кого ми з’їмо першим</h1>
      <p class="lead">
        Лобі кімнати: персональні камери глядачі бачать через оверлей кожного стрімера — глобальна сітка лише
        допоміжна.
      </p>
    </header>

    <ol class="join-steps anim-slide-up" style="animation-delay: 40ms">
      <li><span class="join-steps__n">1</span> Введи game id і обери <strong>свій</strong> слот нижче</li>
      <li><span class="join-steps__n">2</span> Відкрий свій overlay у OBS (кнопка «Оверлей» у слоті)</li>
      <li><span class="join-steps__n">3</span> Керуй картками з панелі гравця («Моя панель»)</li>
    </ol>

    <div class="game-bar anim-slide-up" style="animation-delay: 80ms">
      <label class="lbl" for="gid">Game id</label>
      <div class="game-row">
        <input id="gid" v-model="gameInput" type="text" class="inp" autocomplete="off" />
        <button type="button" class="btn-go" @click="applyGameFromInput">OK</button>
      </div>
    </div>

    <section class="roles roles--clean" aria-labelledby="roles-title">
      <h2 id="roles-title" class="roles-title">Хто ти зараз?</h2>
      <p class="roles-hint">Ведучий і OBS — окремі входи. Гравець обирає слот у блоці нижче.</p>
      <div class="cta-grid anim-stagger">
        <button type="button" class="cta cta--play" style="--stagger-index: 0" @click="scrollToPlayerSlots">
          <span class="cta-ico" aria-hidden="true">🎤</span>
          <span class="cta-t">Я гравець</span>
          <span class="cta-d">Прокрутити до вибору слоту · потім «Моя панель»</span>
        </button>
        <button type="button" class="cta cta--host" style="--stagger-index: 1" @click="goAdmin">
          <span class="cta-ico" aria-hidden="true">🎮</span>
          <span class="cta-t">Я ведучий</span>
          <span class="cta-d">Пульт шоу · таймер · фази (ключ доступу)</span>
        </button>
        <button type="button" class="cta cta--obs" style="--stagger-index: 2" @click="goGlobalOverlay">
          <span class="cta-ico" aria-hidden="true">🎥</span>
          <span class="cta-t">OBS · оверлей</span>
          <span class="cta-d">Глобальна сітка або джерело для сцени</span>
        </button>
      </div>
    </section>

    <section class="obs-hint anim-slide-up" style="animation-delay: 0.12s" aria-labelledby="obs-hint-title">
      <h2 id="obs-hint-title" class="obs-hint__title">OBS · швидкий старт</h2>
      <ol class="obs-hint__list">
        <li>Джерело: <strong>Browser</strong> (або Browser Source).</li>
        <li>Встав URL з кнопки «OBS оверлей» у своєму слоті або глобальний — залежно від сцени.</li>
        <li>Розмір: на весь кадр джерела; у властивостях увімкни прозорість фону, якщо є.</li>
        <li>Оновлення: за потреби ввімкни «Refresh browser when scene becomes active».</li>
      </ol>
      <p class="obs-hint__url">
        <span class="obs-hint__url-label">Приклад глобального URL</span>
        <code class="obs-hint__code">{{ globalOverlayUrl }}</code>
      </p>
    </section>

    <section id="player-slots" class="cards-wrap anim-slide-up" style="animation-delay: 0.16s" aria-labelledby="slots-title">
      <h2 id="slots-title" class="sec-title">Обери свій слот</h2>
      <p class="sec-sub sec-sub--emph">
        Натисни <strong>свій</strong> номер (як оголосив ведучий). «Моя панель» — тільки твої карти; не заходь у чужий
        слот.
      </p>
      <div class="cards">
        <div
          v-for="p in slotsForGrid"
          :key="p.id"
          class="pcard anim-scale-in"
          :class="{ elim: p.eliminated === true, 'pcard--empty': !(p.name && String(p.name).trim()) }"
        >
          <span class="num">Слот {{ slotNum(p.id) }}</span>
          <span class="nm">{{ (p.name && String(p.name).trim()) || 'Ще без імені в кімнаті' }}</span>
          <span v-if="p.eliminated" class="badge">вибув</span>
          <div class="pcard-status-row">
            <span
              class="pcard-ov"
              :class="{ 'pcard-ov--open': slotOverlayOpen(p) }"
              :title="slotOverlayOpen(p) ? 'Є відкриті дані на оверлеї' : 'Дані для глядачів закриті'"
            >
              {{ slotOverlayOpen(p) ? 'Оверлей: відкрито' : 'Оверлей: закрито' }}
            </span>
            <span v-if="handUpJoin(p.id)" class="pcard-hand" title="Піднята рука">✋</span>
          </div>
          <div class="pcard-actions">
            <button type="button" class="pcard-btn pcard-btn--primary" @click="openPlayerControl(p.id)">
              Моя панель
            </button>
            <button type="button" class="pcard-btn" @click="openPersonalOverlay(p.id)">OBS оверлей</button>
          </div>
        </div>
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
  max-width: min(75rem, 100%);
  margin: 0 auto;
  font-family: var(--font-body);
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
.cards-wrap,
.obs-hint {
  position: relative;
  z-index: 1;
}

.join-hero {
  margin-bottom: clamp(1.5rem, 4vw, 2.5rem);
  text-align: center;
}

.game-bar,
.roles,
.cards-wrap,
.obs-hint {
  margin-top: clamp(1.35rem, 3.8vw, 2.15rem);
}

.join-steps {
  list-style: none;
  margin: 0 auto;
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
  font-family: var(--font-display);
  color: var(--text-heading);
  background: var(--accent-fill);
  border: 1px solid var(--border-strong);
}

.roles {
  margin-bottom: 0;
}

.roles--clean {
  border: none;
  box-shadow: none;
  background: transparent;
  padding: 0;
}

.roles-title {
  margin: 0 0 0.35rem;
  text-align: center;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-family: var(--font-display);
  color: var(--text-muted);
}

.roles-hint {
  margin: 0 0 1rem;
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.4;
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
  font-family: var(--font-display);
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
  margin-bottom: 0;
  padding: 1.1rem 1.25rem;
  border-radius: 16px;
  background: var(--bg-card-solid);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-card, 0 0 24px var(--accent-glow));
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

/* «Хто ти зараз?»: на широкому екрані — 3 картки в один ряд */
.cta-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.85rem;
}

@media (min-width: 560px) {
  .cta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .cta-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.obs-hint {
  margin-bottom: 0;
  padding: 1.2rem 1.3rem 1.35rem;
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

.cards-wrap {
  padding: 1.15rem 1.2rem 1.3rem;
  border-radius: 18px;
  border: 1px solid var(--border-strong);
  background: var(--bg-card-solid);
  box-shadow: var(--shadow-card, none);
}

.sec-title {
  margin: 0 0 0.65rem;
  font-size: 0.9rem;
  font-weight: 700;
  font-family: Orbitron, sans-serif;
  color: var(--text-heading);
}

.sec-sub {
  margin: 0 0 1.15rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.45;
}

.sec-sub--emph {
  color: var(--text-secondary);
  max-width: 40rem;
}

.sec-sub--emph strong {
  color: var(--text-heading);
}

.empty {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* «Обери свій слот»: на великому екрані — 5×2 (два рядки), далі адаптивно */
.cards {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (min-width: 520px) {
  .cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 720px) {
  .cards {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .cards {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.pcard {
  text-align: left;
  padding: 0.95rem 1rem 0.85rem;
  border-radius: 14px;
  border: 1px solid var(--border-panel);
  background: var(--pcard-bg);
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: var(--shadow-card, none);
}

.pcard--empty .nm {
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.78rem;
}

.pcard-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  flex-wrap: wrap;
  min-height: 1.35rem;
}

.pcard-ov {
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.22rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.22);
}

.pcard-ov--open {
  border-color: var(--reveal-on-border);
  color: var(--reveal-on-text);
  background: var(--reveal-on-bg);
}

.pcard-hand {
  font-size: 0.9rem;
  line-height: 1;
  filter: drop-shadow(0 0 6px rgba(251, 191, 36, 0.35));
}

.pcard-actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.25rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--border-subtle);
}

.pcard-btn {
  width: 100%;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--border-input);
  background: var(--bg-muted);
  color: var(--text-body);
  transition:
    transform 0.12s ease,
    border-color 0.15s ease;
}

.pcard-btn:hover {
  transform: scale(1.02);
  border-color: var(--border-strong);
}

.pcard-btn--primary {
  border-color: var(--border-strong);
  background: var(--accent-fill);
  color: var(--text-title);
  font-weight: 800;
}

.pcard.elim {
  opacity: 0.55;
  border-color: rgba(185, 28, 28, 0.35);
}

.pcard.elim .pcard-btn {
  opacity: 0.5;
  pointer-events: none;
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
