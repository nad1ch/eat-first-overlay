<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ADMIN_KEY } from '../config/access.js'
import {
  rollFieldValue,
  rollKeysIntoCharacter,
  rollRandomIntoCharacter,
} from '../data/randomPools.js'
import { scenarioIds, getScenarioLabel, getScenarioHint } from '../data/scenarios.js'
import {
  GAME_TITLE,
  characterState,
  CORE_FIELD_KEYS,
  fieldConfig,
  applyRemoteCharacterData,
  snapshotCharacter,
} from '../characterState'
import { pickRandomActiveCardTemplate } from '../data/activeCards.js'
import { applyActiveCardEffect } from '../services/activeCardEffects.js'
import {
  saveCharacter,
  fetchCharacter,
  subscribeToGameRoom,
  subscribeToPlayers,
  saveGameRoom,
  applyGlobalAction,
  startSpeakingTimer,
  clearSpeakingTimer,
  pauseSpeakingTimer,
  resumeSpeakingTimer,
  resetGameRoomControls,
  setGamePhase,
  regenerateAllPlayersRandom,
} from '../services/gameService'
import { millisFromFirestore } from '../utils/firestoreTime.js'
import ShowDeskHeader from '../components/showdesk/ShowDeskHeader.vue'
import ShowDeskHostTools from '../components/showdesk/ShowDeskHostTools.vue'
import ShowPlayersRoster from '../components/showdesk/ShowPlayersRoster.vue'

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
  if (isAdmin.value) return 'Ведучий'
  return 'Гравець'
})

const overlayHrefGlobal = computed(() => ({
  path: '/overlay',
  query: { game: gameId.value },
}))

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
const PHASE_OPTIONS = ['intro', 'discussion', 'voting', 'final']

const selectedScenario = ref('classic_crash')
const timerSpeakerSlot = ref('p1')
const speakingDuration = ref(30)
const globalFieldPick = ref('profession')
const adminTab = ref('live')

const gameRoom = ref({})
const allPlayers = ref([])
let unsubGameRoom = null
let unsubPlayers = null

const toast = ref('')
let toastTimer = null

const tick = ref(Date.now())
let tickTimer = null

onMounted(() => {
  tickTimer = window.setInterval(() => {
    tick.value = Date.now()
  }, 250)
})

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
  }, 2400)
}

async function copyPersonal() {
  try {
    await navigator.clipboard.writeText(personalUrlAbsolute.value)
    showToast('Скопійовано')
  } catch {
    showToast('Помилка копіювання')
  }
}

async function copyGlobal() {
  try {
    await navigator.clipboard.writeText(globalUrlAbsolute.value)
    showToast('Скопійовано')
  } catch {
    showToast('Помилка копіювання')
  }
}

function cleanupSubs() {
  if (unsubGameRoom) {
    unsubGameRoom()
    unsubGameRoom = null
  }
  if (unsubPlayers) {
    unsubPlayers()
    unsubPlayers = null
  }
}

watch(
  [gameId, adminAccessDenied, isAdmin],
  () => {
    cleanupSubs()
    if (adminAccessDenied.value) {
      gameRoom.value = {}
      allPlayers.value = []
      return
    }
    unsubGameRoom = subscribeToGameRoom(gameId.value, (d) => {
      gameRoom.value = d && typeof d === 'object' ? d : {}
    })
    if (isAdmin.value) {
      unsubPlayers = subscribeToPlayers(gameId.value, (list) => {
        allPlayers.value = list
      })
    } else {
      allPlayers.value = []
    }
  },
  { immediate: true },
)

const aliveCount = computed(
  () => allPlayers.value.filter((p) => p.eliminated !== true).length,
)

watch(
  () => gameRoom.value?.activeScenario,
  (a) => {
    if (typeof a === 'string' && a && scenarioIds.includes(a) && selectedScenario.value !== a) {
      selectedScenario.value = a
    }
  },
)

watch(
  () => String(gameRoom.value?.currentSpeaker ?? '').trim(),
  (c) => {
    if (c && PLAYER_SLOTS.includes(c)) timerSpeakerSlot.value = c
  },
  { immediate: true },
)

const scenarioForRolls = computed(
  () => String(gameRoom.value?.activeScenario || selectedScenario.value || 'classic_crash'),
)

const myStatusLabel = computed(() => {
  if (characterState.eliminated) return 'ВИБУВ'
  const sp = String(gameRoom.value?.currentSpeaker ?? '').trim()
  if (sp && sp === playerId.value) return 'ГОВОРИШ'
  const ap = String(gameRoom.value?.activePlayer ?? '').trim()
  if (ap && ap === playerId.value) return 'SPOTLIGHT'
  return 'ЧЕКАЄШ'
})

const hostTimerRemaining = computed(() => {
  const gr = gameRoom.value
  if (gr?.timerPaused === true) {
    const f = Number(gr?.timerRemainingFrozen)
    if (Number.isFinite(f) && f >= 0) return f
    return null
  }
  const start = millisFromFirestore(gr?.timerStartedAt)
  const total = Number(gr?.speakingTimer) || 0
  if (start == null || total <= 0) return null
  const elapsed = Math.floor((tick.value - start) / 1000)
  return Math.max(0, total - elapsed)
})

async function persistScenarioChoice() {
  if (!isAdmin.value) return
  try {
    await saveGameRoom(gameId.value, { activeScenario: selectedScenario.value })
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function controlStartRound() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await setGamePhase(gameId.value, 'discussion')
    showToast('Фаза: discussion')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function controlPauseShow() {
  if (!isAdmin.value) return
  const r = hostTimerRemaining.value
  try {
    loadError.value = null
    if (r != null && r >= 0 && gameRoom.value?.timerPaused !== true) {
      await pauseSpeakingTimer(gameId.value, r)
      showToast('Таймер на паузі')
    } else if (gameRoom.value?.timerPaused === true) {
      showToast('Уже на паузі')
    } else {
      showToast('Таймер не активний')
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function controlReset() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await resetGameRoomControls(gameId.value)
    showToast('Кімнату скинуто')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function adminStartSpeakingTimer() {
  if (!isAdmin.value) return
  const slot = String(timerSpeakerSlot.value || 'p1').trim() || 'p1'
  const sec = Number(speakingDuration.value) || 30
  try {
    loadError.value = null
    await startSpeakingTimer(gameId.value, slot, sec)
    showToast(`${slot} · ${sec}s`)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function adminPauseTimerOnly() {
  const r = hostTimerRemaining.value
  if (r == null) {
    showToast('Немає активного таймера')
    return
  }
  try {
    await pauseSpeakingTimer(gameId.value, r)
    showToast('Пауза')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function adminResumeTimer() {
  try {
    await resumeSpeakingTimer(gameId.value)
    showToast('Продовжено')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function adminClearTimer() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await clearSpeakingTimer(gameId.value)
    showToast('Таймер знято')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function setPhase(ph) {
  if (!isAdmin.value) return
  try {
    await setGamePhase(gameId.value, ph)
    showToast(`Фаза: ${ph}`)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

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

async function setRoomSpeaker(slot) {
  if (!isAdmin.value) return
  const s = String(slot ?? '').trim()
  if (!s) return
  try {
    loadError.value = null
    timerSpeakerSlot.value = s
    await saveGameRoom(gameId.value, { currentSpeaker: s })
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function onRosterPick(id, opts = {}) {
  const sid = String(id ?? '').trim()
  if (!sid) return
  try {
    loadError.value = null
    if (opts.shiftKey) {
      await setSpotlightPlayer(sid)
      goToPlayer(sid)
      showToast('Spotlight')
      return
    }
    timerSpeakerSlot.value = sid
    await saveGameRoom(gameId.value, { currentSpeaker: sid })
    const sec = Number(speakingDuration.value) || 30
    await startSpeakingTimer(gameId.value, sid, sec)
    goToPlayer(sid)
    showToast(`${sid} · ${sec}s`)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

function generateRandomCharacter() {
  if (!isAdmin.value) return
  rollRandomIntoCharacter(characterState, { scenarioId: selectedScenario.value })
}

function generateCoreOnly() {
  if (!isAdmin.value) return
  rollKeysIntoCharacter(characterState, CORE_FIELD_KEYS, selectedScenario.value)
}

async function globalRollField(fieldKey) {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    const sid = scenarioForRolls.value
    await applyGlobalAction(gameId.value, fieldKey, () => rollFieldValue(fieldKey, sid))
    showToast(`Усім: ${fieldKey}`)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function globalChaos() {
  const k = CORE_FIELD_KEYS[Math.floor(Math.random() * CORE_FIELD_KEYS.length)]
  await globalRollField(k)
}

async function globalRollSelected() {
  await globalRollField(globalFieldPick.value)
}

async function regenerateAllPlayers() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await regenerateAllPlayersRandom(gameId.value, selectedScenario.value)
    showToast('Усіх перегенеровано')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function confirmActiveCardEffect() {
  if (!isAdmin.value) return
  const eid = String(characterState.activeCard?.effectId || '')
  if (!eid) {
    showToast('Немає effectId у карти')
    return
  }
  try {
    loadError.value = null
    const res = await applyActiveCardEffect(
      gameId.value,
      playerId.value,
      eid,
      scenarioForRolls.value,
    )
    if (!res.ok) {
      showToast(res.message)
      return
    }
    const fresh = await fetchCharacter(gameId.value, playerId.value)
    syncing.value = true
    applyRemoteCharacterData(characterState, fresh)
    characterState.activeCard.used = true
    characterState.activeCardRequest = false
    syncing.value = false
    await saveCharacter(gameId.value, playerId.value, snapshotCharacter(characterState))
    showToast(res.message)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function clearCardRequest() {
  if (!isAdmin.value) return
  characterState.activeCardRequest = false
  await saveCharacter(gameId.value, playerId.value, snapshotCharacter(characterState))
  showToast('Запит знято')
}

function requestCardFromHost() {
  if (isAdmin.value) return
  if (characterState.activeCard.used) return
  characterState.activeCardRequest = true
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
  cleanupSubs()
  if (tickTimer != null) {
    window.clearInterval(tickTimer)
    tickTimer = null
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

function rerollActiveCardOnly() {
  if (!isAdmin.value) return
  const t = pickRandomActiveCardTemplate()
  characterState.activeCard = {
    title: t.title,
    description: t.description,
    used: false,
    effectId: t.effectId,
    templateId: t.templateId,
  }
}
</script>

<template>
  <div v-if="adminAccessDenied" class="access-denied">
    <h1 class="denied-title">Access denied</h1>
    <p class="denied-text">Невірний або відсутній <code>key</code> для ведучого.</p>
  </div>

  <div v-else class="desk">
    <div class="mode-strip" :class="{ admin: isAdmin, player: !isAdmin }">
      <span class="mode-label">{{ modeLabel }}</span>
      <span v-if="!isAdmin" class="status-pill" :data-s="myStatusLabel">{{ myStatusLabel }}</span>
    </div>

    <template v-if="isAdmin">
      <ShowDeskHeader
        :game-title="GAME_TITLE"
        :game-id="gameId"
        :game-phase="String(gameRoom.gamePhase || 'intro')"
        :scenario-label="getScenarioLabel(selectedScenario)"
        :alive-count="aliveCount"
        :personal-url="personalUrlAbsolute"
        :global-url="globalUrlAbsolute"
        @copy-personal="copyPersonal"
        @copy-global="copyGlobal"
      />

      <nav class="admin-tabs" aria-label="Режим пульта">
        <button
          type="button"
          class="admin-tab"
          :class="{ on: adminTab === 'live' }"
          @click="adminTab = 'live'"
        >
          LIVE
        </button>
        <button
          type="button"
          class="admin-tab"
          :class="{ on: adminTab === 'settings' }"
          @click="adminTab = 'settings'"
        >
          SETTINGS
        </button>
      </nav>

      <ShowDeskHostTools
        :mode="adminTab"
        :game-room="gameRoom"
        :player-slots="PLAYER_SLOTS"
        v-model:speaking-duration="speakingDuration"
        :phase-options="PHASE_OPTIONS"
        @start-round="controlStartRound"
        @pause-show="controlPauseShow"
        @reset-room="controlReset"
        @set-phase="setPhase"
        @set-speaker="setRoomSpeaker"
        @start-timer="adminStartSpeakingTimer"
        @pause-timer="adminPauseTimerOnly"
        @resume-timer="adminResumeTimer"
        @clear-timer="adminClearTimer"
        @spotlight="setSpotlightPlayer"
        @spotlight-clear="setSpotlightPlayer('')"
      />

      <div v-if="adminTab === 'live'" class="admin-row">
        <ShowPlayersRoster
          :players="allPlayers"
          :current-player-id="playerId"
          :spotlight-player-id="String(gameRoom.activePlayer || '')"
          :speaker-id="String(gameRoom.currentSpeaker || '')"
          @pick="onRosterPick"
          @set-spotlight="setSpotlightPlayer"
        />
      </div>

      <div v-if="adminTab === 'settings'" class="settings-stack">
        <aside class="side-tools">
          <label class="field-label">game id</label>
          <div class="inline">
            <input v-model="draftGameId" type="text" class="input" />
            <button type="button" class="btn-soft btn-lift" @click="applyNewGame">OK</button>
          </div>
          <label class="field-label mt">Новий player id</label>
          <div class="inline">
            <input v-model="newPlayerId" type="text" class="input" placeholder="p11" />
            <button type="button" class="btn-soft btn-lift" @click="createAndGoToPlayer">+</button>
          </div>
        </aside>
      </div>
    </template>

    <div v-else class="player-hero">
      <h1 class="player-title">{{ GAME_TITLE }}</h1>
      <p class="player-phase">Фаза: {{ String(gameRoom.gamePhase || 'intro') }}</p>
    </div>

    <p v-if="loadError" class="error">{{ loadError }}</p>

    <section class="panel editor-panel">
      <h2 class="panel-kicker">{{ isAdmin ? `Редактор: ${playerId}` : 'Твій персонаж' }}</h2>

      <div v-if="isAdmin" class="meta-grid">
        <div>
          <label class="field-label">Ім’я</label>
          <input v-model="characterState.name" type="text" class="input" />
        </div>
        <div>
          <label class="field-label">Вік</label>
          <input v-model="characterState.age" type="text" class="input" />
        </div>
        <div>
          <label class="field-label">Гендер</label>
          <input v-model="characterState.gender" type="text" class="input" />
        </div>
      </div>
      <div v-else class="player-meta">
        <template v-if="characterState.identityRevealed">
          <p><span class="mk">Ім’я</span> {{ characterState.name || '—' }}</p>
          <p><span class="mk">Вік · гендер</span> {{ characterState.age || '—' }} · {{ characterState.gender || '—' }}</p>
        </template>
        <p v-else class="meta-locked">Профіль на шоу ще закритий — ведучий відкриє пізніше.</p>
      </div>

      <div v-if="isAdmin" class="traits-grid">
        <div v-for="row in fieldConfig" :key="row.key" class="trait-field">
          <label class="field-label">{{ row.label }}</label>
          <input v-model="characterState[row.key].value" type="text" class="input" />
        </div>
      </div>
      <div v-else class="traits-read">
        <div v-for="row in fieldConfig" :key="row.key" class="trait-row">
          <span class="t-label">{{ row.label }}</span>
          <span class="t-val" :class="{ hidden: !characterState[row.key].revealed }">
            {{ characterState[row.key].revealed ? (characterState[row.key].value || '—') : '❓' }}
          </span>
        </div>
      </div>

      <div class="active-card-box">
        <h3 class="ac-title">Активна карта</h3>
        <template v-if="isAdmin">
          <div v-if="characterState.activeCardRequest" class="card-request-host">
            <p class="card-request-host__text">Гравець хоче використати карту на шоу.</p>
            <button
              type="button"
              class="btn-confirm-card"
              :disabled="characterState.activeCard.used"
              @click="confirmActiveCardEffect"
            >
              ПІДТВЕРДИТИ КАРТУ
            </button>
          </div>
          <input v-model="characterState.activeCard.title" type="text" class="input" placeholder="Заголовок" />
          <textarea v-model="characterState.activeCard.description" class="textarea" rows="3" placeholder="Опис" />
          <p class="ac-meta">effectId: <code>{{ characterState.activeCard.effectId || '—' }}</code></p>
          <div class="ac-actions">
            <button type="button" class="btn-soft" @click="rerollActiveCardOnly">Нова карта (random)</button>
            <button
              v-if="characterState.activeCardRequest"
              type="button"
              class="btn-soft"
              @click="clearCardRequest"
            >
              Зняти запит гравця
            </button>
            <button
              v-if="!characterState.activeCardRequest"
              type="button"
              class="btn-primary"
              :disabled="characterState.activeCard.used"
              @click="confirmActiveCardEffect"
            >
              Застосувати ефект (без запиту)
            </button>
          </div>
        </template>
        <template v-else>
          <p class="ac-t">{{ characterState.activeCard.title || '—' }}</p>
          <p class="ac-d">{{ characterState.activeCard.description || '—' }}</p>
          <p v-if="characterState.activeCard.used" class="ac-used">Використано</p>
          <p v-else-if="characterState.activeCardRequest" class="ac-pending">
            Очікує підтвердження ведучого
          </p>
          <button
            v-else
            type="button"
            class="btn-request"
            @click="requestCardFromHost"
          >
            Використати карту
          </button>
        </template>
      </div>

      <div v-if="isAdmin" class="elim-row">
        <button
          type="button"
          class="btn-elim"
          :class="{ on: characterState.eliminated }"
          @click="toggleEliminated"
        >
          {{ characterState.eliminated ? 'Повернути в гру' : 'Вибув' }}
        </button>
      </div>
    </section>

    <section v-if="isAdmin" class="panel reveal-panel">
      <h2 class="panel-kicker">Відкриття на оверлеї</h2>
      <p class="reveal-hint">Клік по чіпу — відкрити / сховати значення та анімацію reveal.</p>
      <div class="reveal-chips">
        <button
          type="button"
          class="reveal-chip"
          :class="{ on: characterState.identityRevealed }"
          @click="characterState.identityRevealed = !characterState.identityRevealed"
        >
          Ім’я / вік / гендер <span class="chip-mark">{{ characterState.identityRevealed ? '✔' : '❌' }}</span>
        </button>
        <button
          v-for="row in fieldConfig"
          :key="'rv-' + row.key"
          type="button"
          class="reveal-chip"
          :class="{ on: characterState[row.key].revealed }"
          @click="characterState[row.key].revealed = !characterState[row.key].revealed"
        >
          {{ row.label }} <span class="chip-mark">{{ characterState[row.key].revealed ? '✔' : '❌' }}</span>
        </button>
      </div>
    </section>

    <section v-if="isAdmin && adminTab === 'settings'" class="panel globals-panel">
      <h2 class="panel-kicker">Глобальні дії</h2>
      <div class="global-btns">
        <button type="button" class="gbtn" @click="globalRollField('profession')">Професія всім</button>
        <button type="button" class="gbtn" @click="globalRollField('health')">Здоров’я всім</button>
        <button type="button" class="gbtn" @click="globalRollField('phobia')">Фобія всім</button>
        <button type="button" class="gbtn" @click="globalChaos">Random chaos</button>
      </div>
      <div class="pick-row">
        <label class="field-label">Перегенерувати поле всім</label>
        <select v-model="globalFieldPick" class="input select">
          <option v-for="row in fieldConfig" :key="row.key" :value="row.key">{{ row.label }}</option>
        </select>
        <button type="button" class="btn-primary" @click="globalRollSelected">Застосувати</button>
      </div>
    </section>

    <section v-if="isAdmin && adminTab === 'settings'" class="panel scenario-panel">
      <h2 class="panel-kicker">Сценарій</h2>
      <p class="hint-sc">{{ getScenarioHint(selectedScenario) }}</p>
      <select v-model="selectedScenario" class="input select" @change="persistScenarioChoice">
        <option v-for="sid in scenarioIds" :key="sid" :value="sid">{{ getScenarioLabel(sid) }}</option>
      </select>
      <div class="scenario-actions">
        <button type="button" class="btn-primary" @click="generateRandomCharacter">Generate поточного</button>
        <button type="button" class="btn-soft" @click="generateCoreOnly">Тільки 6 карт</button>
        <button type="button" class="btn-amber" @click="regenerateAllPlayers">Усіх у кімнаті</button>
      </div>
    </section>

    <section v-if="!isAdmin" class="panel reveal-player">
      <h2 class="panel-kicker">Твої картки</h2>
      <div class="reveal-chips">
        <button
          v-for="row in fieldConfig"
          :key="'pv-' + row.key"
          type="button"
          class="reveal-chip"
          :class="{ on: characterState[row.key].revealed }"
          :disabled="playerRevealLocked"
          @click="toggle(row.key)"
        >
          {{ row.label }} <span class="chip-mark">{{ characterState[row.key].revealed ? '✔' : '❌' }}</span>
        </button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Teleport>
  </div>
</template>

<style scoped>
.desk {
  max-width: 920px;
  margin: 0 auto;
  padding: 0 1.25rem 3.5rem;
  box-sizing: border-box;
}

.mode-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.mode-strip.admin {
  border-color: rgba(124, 58, 237, 0.2);
}

.mode-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c4b5fd;
}

.status-pill {
  font-size: 0.78rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: rgba(88, 28, 135, 0.25);
  border: 1px solid rgba(167, 139, 250, 0.3);
  color: #f5f3ff;
}

.status-pill[data-s='ГОВОРИШ'] {
  border-color: rgba(251, 191, 36, 0.55);
  background: rgba(120, 53, 15, 0.28);
}

.status-pill[data-s='SPOTLIGHT'] {
  border-color: rgba(168, 85, 247, 0.55);
}

.status-pill[data-s='ВИБУВ'] {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(80, 20, 30, 0.35);
}

.player-hero {
  text-align: center;
  padding: 1.5rem 0 1rem;
}

.player-title {
  margin: 0;
  font-size: 1.5rem;
  font-family: 'Orbitron', sans-serif;
  color: #f5f3ff;
}

.player-phase {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: rgba(196, 181, 253, 0.55);
}

.admin-tabs {
  display: flex;
  gap: 0.4rem;
  margin: 0 0 0.85rem;
}

.admin-tab {
  flex: 1;
  padding: 0.55rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.32);
  color: rgba(148, 163, 184, 0.95);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  cursor: pointer;
  font-family: 'Orbitron', sans-serif;
  transition:
    transform 0.15s ease,
    border-color 0.15s,
    color 0.15s,
    background 0.15s;
}

.admin-tab:hover {
  transform: scale(1.02);
}

.admin-tab.on {
  border-color: rgba(168, 85, 247, 0.55);
  color: #faf5ff;
  background: rgba(88, 28, 135, 0.38);
}

.settings-stack {
  margin-bottom: 1.25rem;
}

.admin-row {
  display: block;
  margin-bottom: 0.25rem;
}

.side-tools {
  padding: 1rem;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.inline {
  display: flex;
  gap: 0.35rem;
}

.field-label {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.45);
}

.field-label.mt {
  margin-top: 0.75rem;
}

.input,
.textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.7rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(8, 6, 20, 0.85);
  color: #f1f5f9;
  font-size: 0.9rem;
}

.select {
  max-width: 280px;
}

.panel {
  padding: 1.25rem 1.35rem;
  margin-bottom: 1.25rem;
  border-radius: 20px;
  background: rgba(10, 8, 22, 0.75);
  border: 1px solid rgba(124, 58, 237, 0.15);
}

.panel-kicker {
  margin: 0 0 1rem;
  font-size: 1rem;
  font-weight: 700;
  color: #ede9fe;
  font-family: 'Orbitron', sans-serif;
}

.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

@media (max-width: 640px) {
  .meta-grid {
    grid-template-columns: 1fr;
  }
}

.traits-grid {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.player-meta p {
  margin: 0.25rem 0;
  color: #e2e8f0;
}

.meta-locked {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: rgba(196, 181, 253, 0.65);
}

.ac-pending {
  margin: 0.65rem 0 0;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #fde68a;
}

.card-request-host {
  margin-bottom: 1rem;
  padding: 1rem 1.1rem;
  border-radius: 14px;
  border: 1px solid rgba(168, 85, 247, 0.45);
  background: rgba(88, 28, 135, 0.22);
}

.card-request-host__text {
  margin: 0 0 0.75rem;
  font-size: 0.88rem;
  color: #e9d5ff;
}

.btn-confirm-card {
  width: 100%;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1px solid rgba(168, 85, 247, 0.55);
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.45), rgba(88, 28, 135, 0.55));
  color: #fff;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  cursor: pointer;
}

.btn-confirm-card:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mk {
  display: inline-block;
  min-width: 4.5rem;
  font-size: 0.72rem;
  color: rgba(196, 181, 253, 0.5);
}

.traits-read {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.trait-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.65rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.t-label {
  font-size: 0.75rem;
  color: rgba(196, 181, 253, 0.55);
}

.t-val.hidden {
  font-size: 1rem;
}

.active-card-box {
  padding: 1rem;
  border-radius: 16px;
  background: rgba(88, 28, 135, 0.12);
  border: 1px solid rgba(167, 139, 250, 0.25);
  margin-bottom: 1rem;
}

.ac-title {
  margin: 0 0 0.65rem;
  font-size: 0.85rem;
  color: #e9d5ff;
}

.ac-meta {
  font-size: 0.75rem;
  color: rgba(196, 181, 253, 0.65);
}

.ac-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.65rem;
}

.ac-t {
  margin: 0 0 0.35rem;
  font-weight: 700;
  color: #f5f3ff;
}

.ac-d {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: #cbd5e1;
}

.ac-used {
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #c4b5fd;
}

.btn-request {
  margin-top: 0.75rem;
  padding: 0.55rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(167, 139, 250, 0.45);
  background: rgba(88, 28, 135, 0.35);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.btn-request:disabled {
  opacity: 0.55;
  cursor: default;
}

.elim-row {
  margin-top: 0.5rem;
}

.btn-elim {
  padding: 0.45rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(80, 20, 30, 0.35);
  color: #fecaca;
  font-weight: 600;
  cursor: pointer;
}

.btn-elim.on {
  border-color: rgba(74, 222, 128, 0.4);
  background: rgba(22, 101, 52, 0.3);
  color: #bbf7d0;
}

.reveal-hint {
  margin: -0.35rem 0 0.75rem;
  font-size: 0.72rem;
  color: rgba(196, 181, 253, 0.5);
  line-height: 1.35;
}

.reveal-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.reveal-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.28);
  color: #e2e8f0;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.15s ease;
}

.reveal-chip:not(:disabled):hover {
  transform: scale(1.03);
}

.reveal-chip.on {
  border-color: rgba(168, 85, 247, 0.5);
  background: rgba(88, 28, 135, 0.3);
}

.reveal-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chip-mark {
  font-size: 0.85rem;
}

.reveal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}

.reveal-tile {
  text-align: left;
  padding: 0.65rem 0.75rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.25);
  color: #e2e8f0;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.reveal-tile.on {
  border-color: rgba(167, 139, 250, 0.45);
  background: rgba(88, 28, 135, 0.25);
}

.reveal-tile:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.rt-label {
  display: block;
  font-size: 0.72rem;
  color: rgba(196, 181, 253, 0.55);
  margin-bottom: 0.25rem;
}

.rt-state {
  font-size: 0.82rem;
  font-weight: 700;
}

.global-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 1rem;
}

.gbtn {
  padding: 0.5rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
  color: #e2e8f0;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.15s,
    transform 0.15s ease;
}

.gbtn:hover {
  border-color: rgba(167, 139, 250, 0.35);
  transform: scale(1.03);
}

.pick-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.65rem;
}

.hint-sc {
  font-size: 0.8rem;
  color: rgba(186, 181, 200, 0.85);
  margin: 0 0 0.65rem;
  line-height: 1.4;
}

.scenario-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.btn-primary {
  padding: 0.5rem 0.9rem;
  border-radius: 12px;
  border: 1px solid rgba(167, 139, 250, 0.45);
  background: rgba(88, 28, 135, 0.4);
  color: #f5f3ff;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.btn-primary:not(:disabled):hover {
  transform: scale(1.03);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-soft {
  padding: 0.5rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.35);
  color: #e2e8f0;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.btn-soft.btn-lift:hover {
  transform: scale(1.03);
}

.btn-amber {
  padding: 0.5rem 0.85rem;
  border-radius: 12px;
  border: 1px solid rgba(251, 191, 36, 0.35);
  background: rgba(120, 53, 15, 0.35);
  color: #fef3c7;
  font-weight: 600;
  cursor: pointer;
}

.error {
  padding: 0.65rem 0.85rem;
  border-radius: 12px;
  background: rgba(80, 20, 30, 0.4);
  border: 1px solid rgba(248, 113, 113, 0.35);
  color: #fecaca;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.access-denied {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: #e2e8f0;
}

.denied-title {
  color: #fecaca;
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
  border: 1px solid rgba(74, 222, 128, 0.45);
  color: #ecfdf5;
  font-size: 0.88rem;
  font-weight: 600;
  pointer-events: none;
}

body {
  background: radial-gradient(ellipse 100% 60% at 50% -10%, rgba(55, 25, 95, 0.35), transparent),
    #06040f;
}
</style>
