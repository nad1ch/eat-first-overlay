<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ADMIN_KEY } from '../config/access.js'
import { rollRandomIntoCharacter } from '../data/randomPools.js'
import { characterState, fieldConfig, applyRemoteCharacterData, snapshotCharacter } from '../characterState'
import { saveCharacter, fetchCharacter, subscribeToGameRoom, saveGameRoom } from '../services/gameService'

const route = useRoute()
const router = useRouter()

const wantsAdmin = computed(() => String(route.query.role ?? '').toLowerCase() === 'admin')
const urlKey = computed(() => String(route.query.key ?? '').trim())
const adminKeyOk = computed(() => urlKey.value === ADMIN_KEY)
const isAdmin = computed(() => wantsAdmin.value && adminKeyOk.value)
const adminAccessDenied = computed(() => wantsAdmin.value && !adminKeyOk.value)

const gameId = computed(() => String(route.query.game ?? 'test1'))
const playerId = computed(() => String(route.query.player ?? 'p1'))

const modeLabel = computed(() => {
  if (adminAccessDenied.value) return 'Access denied'
  if (isAdmin.value) return 'Admin mode'
  return 'Player mode'
})

/** Ведучий: усі гравці в сітці. */
const overlayHrefGlobal = computed(() => ({
  path: '/overlay',
  query: { game: gameId.value },
}))

/** Стрімер поточного слота: тільки цей player. */
const overlayHrefPersonal = computed(() => ({
  path: '/overlay',
  query: { game: gameId.value, player: playerId.value },
}))

const syncing = ref(false)
const loadError = ref(null)

const newPlayerId = ref('')
const draftGameId = ref('')

watch(
  gameId,
  (g) => {
    draftGameId.value = g
  },
  { immediate: true },
)

const PLAYER_SLOTS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']

const gameRoom = ref({})
let unsubGameRoom = null

const toast = ref('')
let toastTimer = null

const personalUrlAbsolute = computed(() => {
  const h = router.resolve(overlayHrefPersonal.value).href
  if (typeof window === 'undefined') return h
  return new URL(h, window.location.origin).href
})

const globalUrlAbsolute = computed(() => {
  const h = router.resolve(overlayHrefGlobal.value).href
  if (typeof window === 'undefined') return h
  return new URL(h, window.location.origin).href
})

function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2200)
}

async function copyPersonal() {
  try {
    await navigator.clipboard.writeText(personalUrlAbsolute.value)
    showToast('Скопійовано')
  } catch {
    showToast('Не вдалося скопіювати')
  }
}

async function copyGlobal() {
  try {
    await navigator.clipboard.writeText(globalUrlAbsolute.value)
    showToast('Скопійовано')
  } catch {
    showToast('Не вдалося скопіювати')
  }
}

watch(
  [gameId, adminAccessDenied],
  () => {
    if (unsubGameRoom) {
      unsubGameRoom()
      unsubGameRoom = null
    }
    if (adminAccessDenied.value) {
      gameRoom.value = {}
      return
    }
    unsubGameRoom = subscribeToGameRoom(gameId.value, (d) => {
      gameRoom.value = d && typeof d === 'object' ? d : {}
    })
  },
  { immediate: true },
)

async function setSpotlightPlayer(slot) {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    if (slot === '' || slot == null) {
      await saveGameRoom(gameId.value, { activePlayer: '' })
      return
    }
    const cur = String(gameRoom.value?.activePlayer ?? '').trim()
    const next = cur === slot ? '' : slot
    await saveGameRoom(gameId.value, { activePlayer: next })
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

let saveTimer = null

function controlQuery(overrides) {
  const base = { ...route.query, ...overrides }
  if (isAdmin.value) {
    base.role = 'admin'
    base.key = urlKey.value
  } else {
    delete base.role
    delete base.key
  }
  return base
}

function navigateQuery(overrides) {
  router.replace({
    path: '/control',
    query: controlQuery(overrides),
  })
}

function goToPlayer(id) {
  if (!isAdmin.value) return
  navigateQuery({ player: String(id).trim() || 'p1' })
}

function applyNewGame() {
  if (!isAdmin.value) return
  const g = String(draftGameId.value).trim() || 'test1'
  navigateQuery({ game: g })
}

function createAndGoToPlayer() {
  if (!isAdmin.value) return
  const id = newPlayerId.value.trim()
  if (!id) return
  newPlayerId.value = ''
  navigateQuery({ player: id })
}

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      loadError.value = null
      await saveCharacter(gameId.value, playerId.value, snapshotCharacter(characterState))
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e)
    }
  }, 400)
}

async function hydrate() {
  syncing.value = true
  loadError.value = null
  try {
    const data = await fetchCharacter(gameId.value, playerId.value)
    applyRemoteCharacterData(characterState, data)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    syncing.value = false
  }
}

watch(characterState, () => {
  if (syncing.value || adminAccessDenied.value) return
  scheduleSave()
}, { deep: true })

watch([gameId, playerId], () => {
  if (adminAccessDenied.value) return
  hydrate()
})

onMounted(() => {
  if (adminAccessDenied.value) return
  hydrate()
})

onUnmounted(() => {
  clearTimeout(saveTimer)
  clearTimeout(toastTimer)
  if (unsubGameRoom) {
    unsubGameRoom()
    unsubGameRoom = null
  }
})

const playerRevealLocked = computed(
  () => !isAdmin.value && Boolean(characterState.eliminated),
)

function toggle(key) {
  if (playerRevealLocked.value) return
  characterState[key].revealed = !characterState[key].revealed
}

function toggleEliminated() {
  if (!isAdmin.value) return
  characterState.eliminated = !characterState.eliminated
}

function generateRandomCharacter() {
  if (!isAdmin.value) return
  rollRandomIntoCharacter(characterState)
}
</script>

<template>
  <div v-if="adminAccessDenied" class="access-denied">
    <h1 class="denied-title">Access denied</h1>
    <p class="denied-text">Невірний або відсутній параметр <code>key</code> для режиму адміністратора.</p>
    <p class="denied-hint">Гравці відкривають панель без <code>role=admin</code> — ключ не потрібен.</p>
  </div>

  <div v-else class="control">
    <div class="mode-bar" :class="{ admin: isAdmin, player: !isAdmin }">
      <span class="mode-text">{{ modeLabel }}</span>
      <span v-if="!isAdmin && !playerRevealLocked" class="mode-hint">Тільки відкриття карт; текст змінює адмін.</span>
      <span v-if="!isAdmin && playerRevealLocked" class="mode-hint warn">Вибув: відкриття карт вимкнено.</span>
    </div>

    <header class="header">
      <h1 class="app-title">Eat First</h1>
      <p class="sub">Панель керування оверлеєм (Firestore)</p>
      <p class="ids">
        <span class="id-pill">game={{ gameId }}</span>
        <span class="id-pill">player={{ playerId }}</span>
      </p>
      <p class="hint">
        Адмін (збережи в приватних закладках):
        <code>?game=test1&amp;player=p1&amp;role=admin&amp;key=…</code>
        · Гравець:
        <code>?game=test1&amp;player=p1</code>
        · Overlay глобальний:
        <code>/overlay?game=test1</code>
        · Overlay стрімера:
        <code>/overlay?game=test1&amp;player=p1</code>
      </p>

      <section v-if="isAdmin" class="admin-tools panel-inline">
        <h2 class="tools-title">Гра та гравці</h2>
        <div class="tool-row">
          <label class="field-label" for="game-id">game (id кімнати)</label>
          <div class="row-controls">
            <input
              id="game-id"
              v-model="draftGameId"
              type="text"
              class="input"
              placeholder="test1"
              autocomplete="off"
            />
            <button type="button" class="btn-secondary" @click="applyNewGame">Застосувати</button>
          </div>
        </div>
        <div class="tool-row">
          <span class="field-label">Швидко: гравці</span>
          <div class="chip-row">
            <button
              v-for="slot in PLAYER_SLOTS"
              :key="slot"
              type="button"
              class="chip"
              :class="{ active: playerId === slot }"
              @click="goToPlayer(slot)"
            >
              {{ slot }}
            </button>
          </div>
        </div>
        <div class="tool-row">
          <span class="field-label">Активний гравець (spotlight на overlay)</span>
          <p class="spotlight-hint">
            Зараз:
            <strong>{{ String(gameRoom.activePlayer || '').trim() || '—' }}</strong>
          </p>
          <div class="chip-row">
            <button
              v-for="slot in PLAYER_SLOTS"
              :key="'sp-' + slot"
              type="button"
              class="chip chip-spotlight"
              :class="{ active: String(gameRoom.activePlayer || '') === slot }"
              @click="setSpotlightPlayer(slot)"
            >
              {{ slot }}
            </button>
            <button type="button" class="btn-secondary" @click="setSpotlightPlayer('')">
              Вимкнути
            </button>
          </div>
        </div>
        <div class="tool-row">
          <label class="field-label" for="new-player">Новий персонаж (id гравця)</label>
          <div class="row-controls">
            <input
              id="new-player"
              v-model="newPlayerId"
              type="text"
              class="input"
              placeholder="наприклад p9 або streamer_name"
              autocomplete="off"
              @keydown.enter.prevent="createAndGoToPlayer"
            />
            <button type="button" class="btn-secondary" @click="createAndGoToPlayer">Створити / відкрити</button>
          </div>
        </div>
      </section>

      <nav class="nav nav-overlays">
        <RouterLink :to="overlayHrefGlobal" class="link" target="_blank">Overlay — усі гравці</RouterLink>
        <RouterLink :to="overlayHrefPersonal" class="link link-accent" target="_blank">Overlay — тільки цей гравець</RouterLink>
      </nav>

      <section class="panel copy-panel" aria-label="Посилання для OBS">
        <h2 class="panel-title">Посилання для стріму (OBS)</h2>
        <div class="copy-line">
          <div class="copy-info">
            <span class="copy-emoji">🎥</span>
            <div>
              <span class="copy-label">Твій overlay</span>
              <p class="copy-url">{{ personalUrlAbsolute }}</p>
            </div>
          </div>
          <button type="button" class="btn-copy" @click="copyPersonal">Копіювати</button>
        </div>
        <div class="copy-line">
          <div class="copy-info">
            <span class="copy-emoji">🎬</span>
            <div>
              <span class="copy-label">Overlay усіх гравців</span>
              <p class="copy-url">{{ globalUrlAbsolute }}</p>
            </div>
          </div>
          <button type="button" class="btn-copy" @click="copyGlobal">Копіювати</button>
        </div>
      </section>

      <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>
    </header>

    <Teleport to="body">
      <div v-if="toast" class="toast" role="status">{{ toast }}</div>
    </Teleport>

    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title">Персонаж</h2>
        <button
          v-if="isAdmin"
          type="button"
          class="btn-generate"
          @click="generateRandomCharacter"
        >
          🎲 Generate
        </button>
      </div>
      <label class="field-label" :for="isAdmin ? 'char-name' : 'char-name-ro'">Ім’я</label>
      <input
        v-if="isAdmin"
        id="char-name"
        v-model="characterState.name"
        type="text"
        class="input"
        placeholder="Введіть ім’я"
        autocomplete="off"
      />
      <p v-else id="char-name-ro" class="readonly">{{ characterState.name.trim() || '—' }}</p>
      <div class="meta-row">
        <div class="meta-field">
          <label class="field-label" :for="isAdmin ? 'char-age' : 'char-age-ro'">Вік</label>
          <input
            v-if="isAdmin"
            id="char-age"
            v-model="characterState.age"
            type="text"
            class="input"
            placeholder="напр. 27"
            autocomplete="off"
          />
          <p v-else id="char-age-ro" class="readonly readonly-sm">{{ characterState.age.trim() || '—' }}</p>
        </div>
        <div class="meta-field">
          <label class="field-label" :for="isAdmin ? 'char-gender' : 'char-gender-ro'">Гендер</label>
          <input
            v-if="isAdmin"
            id="char-gender"
            v-model="characterState.gender"
            type="text"
            class="input"
            placeholder="напр. жін."
            autocomplete="off"
          />
          <p v-else id="char-gender-ro" class="readonly readonly-sm">{{ characterState.gender.trim() || '—' }}</p>
        </div>
      </div>
      <div v-if="isAdmin" class="elim-block">
        <button
          type="button"
          class="btn-elim"
          :class="{ on: characterState.eliminated }"
          @click="toggleEliminated"
        >
          {{ characterState.eliminated ? 'Повернути в гру' : 'Вибув' }}
        </button>
        <span class="elim-note">На overlay — затемнення та «ВИБУВ»; гравець не відкриває карти.</span>
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-title">Характеристики</h2>
      <div class="fields">
        <div v-for="row in fieldConfig" :key="row.key" class="row">
          <label class="field-label" :for="isAdmin ? `f-${row.key}` : undefined">{{ row.label }}</label>
          <div class="row-controls">
            <input
              v-if="isAdmin"
              :id="`f-${row.key}`"
              v-model="characterState[row.key].value"
              type="text"
              class="input"
              placeholder="Текст…"
              autocomplete="off"
            />
            <p v-else class="readonly input-like">{{ characterState[row.key].value.trim() || '—' }}</p>
            <button
              type="button"
              class="toggle"
              :class="{ on: characterState[row.key].revealed }"
              :disabled="playerRevealLocked"
              @click="toggle(row.key)"
            >
              {{ characterState[row.key].revealed ? 'Закрити' : 'Відкрити' }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mode-bar {
  padding: 0.65rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mode-bar.admin {
  background: linear-gradient(90deg, rgba(99, 102, 241, 0.2), rgba(30, 35, 50, 0.5));
}

.mode-bar.player {
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.12), rgba(30, 35, 50, 0.5));
}

.mode-bar.denied {
  background: linear-gradient(90deg, rgba(185, 28, 28, 0.25), rgba(30, 35, 50, 0.5));
}

.access-denied {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
  text-align: center;
  box-sizing: border-box;
}

.denied-title {
  margin: 0 0 0.75rem;
  font-size: 1.5rem;
  font-weight: 600;
  color: #fecaca;
}

.denied-text,
.denied-hint {
  margin: 0 0 0.5rem;
  max-width: 28rem;
  font-size: 0.95rem;
  color: rgba(203, 213, 225, 0.95);
  line-height: 1.5;
}

.denied-hint {
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.9);
}

.access-denied code {
  font-size: 0.8em;
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
}

.mode-text {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #e2e8f0;
}

.mode-hint {
  font-size: 0.78rem;
  color: rgba(148, 163, 184, 0.95);
}

.mode-hint.warn {
  color: #fecaca;
}

.control {
  max-width: 560px;
  margin: 0 auto;
  padding: 0 1.25rem 3rem;
  box-sizing: border-box;
}

.header {
  margin-bottom: 1.75rem;
  padding-top: 1.5rem;
}

.app-title {
  margin: 0 0 0.25rem;
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: #f8fafc;
}

.sub {
  margin: 0 0 0.65rem;
  font-size: 0.9rem;
  color: rgba(148, 163, 184, 0.95);
}

.ids {
  margin: 0 0 0.35rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.id-pill {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.15);
  color: #c7d2fe;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.hint {
  margin: 0 0 0.85rem;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.75);
  line-height: 1.4;
}

.hint code {
  font-size: 0.7rem;
  padding: 0.15rem 0.35rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
  display: inline-block;
  margin: 0.15rem 0.25rem 0 0;
}

.panel-inline {
  margin-bottom: 1rem;
  padding: 1rem 1.1rem;
  border-radius: 14px;
  background: rgba(30, 35, 50, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.tools-title {
  margin: 0 0 0.85rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #e2e8f0;
}

.tool-row {
  margin-bottom: 1rem;
}

.tool-row:last-child {
  margin-bottom: 0;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.35rem;
}

.chip {
  padding: 0.35rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(15, 18, 28, 0.85);
  color: #cbd5e1;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.chip:hover {
  background: rgba(51, 65, 85, 0.6);
}

.chip.active {
  border-color: rgba(129, 140, 248, 0.55);
  background: rgba(99, 102, 241, 0.25);
  color: #eef2ff;
}

.btn-secondary {
  flex-shrink: 0;
  padding: 0 0.9rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(51, 65, 85, 0.55);
  color: #e2e8f0;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.btn-secondary:hover {
  background: rgba(71, 85, 105, 0.75);
}

.error {
  margin: 0.75rem 0 0;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  font-size: 0.85rem;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border: 1px solid rgba(248, 113, 113, 0.35);
}

.nav-overlays {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.nav .link {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  font-size: 0.85rem;
  color: #a5b4fc;
  text-decoration: none;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
  transition: background 0.2s, border-color 0.2s;
}

.nav .link:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(129, 140, 248, 0.45);
}

.nav .link-accent {
  color: #fde68a;
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(251, 191, 36, 0.35);
}

.nav .link-accent:hover {
  background: rgba(245, 158, 11, 0.22);
  border-color: rgba(251, 191, 36, 0.5);
}

.spotlight-hint {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: rgba(148, 163, 184, 0.95);
}

.spotlight-hint strong {
  color: #c7d2fe;
}

.chip-spotlight.active {
  border-color: rgba(251, 191, 36, 0.55);
  background: rgba(245, 158, 11, 0.22);
  color: #fef3c7;
}

.copy-panel .panel-title {
  margin-bottom: 0.85rem;
}

.copy-line {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.copy-line:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.copy-info {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  min-width: 0;
  flex: 1;
}

.copy-emoji {
  font-size: 1.25rem;
  line-height: 1;
}

.copy-label {
  display: block;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
  margin-bottom: 0.25rem;
}

.copy-url {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: #cbd5e1;
  word-break: break-all;
}

.btn-copy {
  flex-shrink: 0;
  padding: 0.45rem 0.9rem;
  border-radius: 10px;
  border: 1px solid rgba(129, 140, 248, 0.45);
  background: rgba(99, 102, 241, 0.2);
  color: #e0e7ff;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-copy:hover {
  background: rgba(99, 102, 241, 0.35);
}

.panel {
  padding: 1.25rem 1.35rem;
  margin-bottom: 1.25rem;
  border-radius: 16px;
  background: rgba(30, 35, 50, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.panel-title {
  font-size: 1rem;
  font-weight: 600;
  color: #e2e8f0;
}

.panel-head .panel-title {
  margin: 0;
}

.panel > .panel-title {
  margin: 0 0 1rem;
}

.btn-generate {
  padding: 0.4rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(251, 191, 36, 0.4);
  background: rgba(245, 158, 11, 0.15);
  color: #fde68a;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-generate:hover {
  background: rgba(245, 158, 11, 0.28);
}

.elim-block {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.btn-elim {
  align-self: flex-start;
  padding: 0.45rem 1rem;
  border-radius: 10px;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-elim:hover {
  background: rgba(153, 27, 27, 0.45);
}

.btn-elim.on {
  border-color: rgba(74, 222, 128, 0.45);
  background: rgba(22, 101, 52, 0.35);
  color: #bbf7d0;
}

.elim-note {
  font-size: 0.72rem;
  color: rgba(148, 163, 184, 0.85);
  line-height: 1.35;
}

.meta-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-top: 1rem;
}

.meta-field .field-label {
  margin-bottom: 0.35rem;
}

.readonly-sm {
  min-height: 2.5rem;
  font-size: 0.88rem;
}

.field-label {
  display: block;
  margin-bottom: 0.4rem;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.readonly {
  margin: 0;
  padding: 0.65rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(15, 18, 28, 0.55);
  color: #cbd5e1;
  font-size: 0.95rem;
  min-height: 2.75rem;
  display: flex;
  align-items: center;
}

.readonly.input-like {
  flex: 1;
  min-width: 0;
  margin: 0;
  min-height: auto;
}

.input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.65rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 18, 28, 0.9);
  color: #f1f5f9;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input::placeholder {
  color: rgba(148, 163, 184, 0.45);
}

.input:focus {
  border-color: rgba(129, 140, 248, 0.55);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.row-controls {
  display: flex;
  gap: 0.6rem;
  align-items: stretch;
  margin-top: 0.35rem;
}

.row-controls .input {
  flex: 1;
  min-width: 0;
}

.toggle {
  flex-shrink: 0;
  padding: 0 1rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(51, 65, 85, 0.6);
  color: #e2e8f0;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
  white-space: nowrap;
}

.toggle:hover {
  background: rgba(71, 85, 105, 0.75);
}

.toggle.on {
  background: rgba(99, 102, 241, 0.35);
  border-color: rgba(129, 140, 248, 0.45);
  color: #eef2ff;
}

.toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>

<style>
.toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  padding: 0.55rem 1.2rem;
  border-radius: 12px;
  background: rgba(20, 83, 45, 0.95);
  border: 1px solid rgba(74, 222, 128, 0.5);
  color: #ecfdf5;
  font-size: 0.88rem;
  font-weight: 600;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
</style>
