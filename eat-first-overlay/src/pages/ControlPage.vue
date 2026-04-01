<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ADMIN_KEY } from '../config/access.js'
import {
  rollFieldValue,
  rollKeysIntoCharacter,
  rollRandomIntoCharacter,
  ages,
  genders,
  pickNameForGender,
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
  setNominatedPlayer,
  setRoomVoting,
  setGameHandRaised,
  subscribeToVotes,
  clearAllVotes,
  deleteVoteDoc,
  nextRoomRound,
  resetRoomRoundCounter,
  setRoomRound,
  clearAllHands,
} from '../services/gameService'
import { millisFromFirestore } from '../utils/firestoreTime.js'
import ShowDeskHeader from '../components/showdesk/ShowDeskHeader.vue'
import ShowDeskHostTools from '../components/showdesk/ShowDeskHostTools.vue'
import ShowDeskHandsPanel from '../components/showdesk/ShowDeskHandsPanel.vue'
import ShowDeskVotingPanel from '../components/showdesk/ShowDeskVotingPanel.vue'
import ShowDeskRoundPanel from '../components/showdesk/ShowDeskRoundPanel.vue'
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

const gameRoom = ref({})
const allPlayers = ref([])
const votes = ref([])
let unsubGameRoom = null
let unsubPlayers = null
let unsubVotes = null

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
  if (unsubVotes) {
    unsubVotes()
    unsubVotes = null
  }
  votes.value = []
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
      unsubVotes = subscribeToVotes(gameId.value, (list) => {
        votes.value = list
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

const roomRoundLive = computed(() =>
  Math.min(8, Math.max(1, Math.floor(Number(gameRoom.value?.round) || 1))),
)

const votesLiveRound = computed(() =>
  votes.value.filter((v) => Number(v.round) === roomRoundLive.value),
)

const allPlayersVoted = computed(
  () =>
    Boolean(gameRoom.value?.voting?.active) &&
    aliveCount.value > 0 &&
    votesLiveRound.value.length === aliveCount.value,
)

const nominatedPlayerActive = computed(() =>
  Boolean(String(gameRoom.value?.nominatedPlayer ?? '').trim()),
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

watch(hostTimerRemaining, async (left, prev) => {
  if (gameRoom.value?.timerPaused === true) return
  if (left !== 0) return
  if (prev === null || prev === undefined || prev === 0) return
  const gr = gameRoom.value
  if (!(Number(gr?.speakingTimer) > 0)) return
  try {
    await clearSpeakingTimer(gameId.value)
  } catch (e) {
    console.error('[autoClearSpeaker]', e)
  }
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

function eliminatedBySlot() {
  const m = Object.create(null)
  for (const p of allPlayers.value) {
    m[String(p.id)] = p.eliminated === true
  }
  return m
}

/** Наступний живий у порядку p1…p10 + старт таймера 30s */
const myHandRaised = computed(() => gameRoom.value?.hands?.[playerId.value] === true)

async function toggleMyHand() {
  try {
    loadError.value = null
    const next = !myHandRaised.value
    await setGameHandRaised(gameId.value, playerId.value, next)
    showToast(next ? '✋ Руку піднято' : 'Руку опущено')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostNominate(slot) {
  if (!isAdmin.value) return
  const s = String(slot ?? '').trim()
  try {
    loadError.value = null
    const cur = String(gameRoom.value?.nominatedPlayer ?? '').trim()
    const next = s === '' || cur === s ? '' : s
    const byHostSlot = next ? String(playerId.value ?? '').trim() : ''
    await setNominatedPlayer(gameId.value, next, byHostSlot)
    showToast(next ? `Номінація: ${next}` : 'Номінацію знято')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostVotingTarget(slot) {
  if (!isAdmin.value) return
  const s = String(slot ?? '').trim()
  if (!s) return
  try {
    loadError.value = null
    const active = Boolean(gameRoom.value?.voting?.active)
    await setRoomVoting(gameId.value, active, s)
    showToast(`Голосування → ${s}`)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostVotingToggle() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    const v = gameRoom.value?.voting
    const curActive = Boolean(v?.active)
    const tp = String(v?.targetPlayer ?? '').trim() || 'p1'
    await setRoomVoting(gameId.value, !curActive, !curActive ? tp : '')
    showToast(!curActive ? 'Голосування увімкнено' : 'Голосування вимкнено')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostStopVoting() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await setRoomVoting(gameId.value, false, '')
    showToast('Голосування зупинено')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostClearVotes() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await clearAllVotes(gameId.value)
    showToast('Голоси очищено')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostRemoveVote(voterId) {
  if (!isAdmin.value) return
  const v = String(voterId ?? '').trim()
  if (!v) return
  try {
    loadError.value = null
    await deleteVoteDoc(gameId.value, v)
    showToast(`Голос ${v} знято`)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostNextRound() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await nextRoomRound(gameId.value)
    showToast('Наступний раунд')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostResetRound() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await resetRoomRoundCounter(gameId.value)
    showToast('Раунд 1 · голоси очищено')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostSetRound(n) {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await setRoomRound(gameId.value, n)
    showToast(`Раунд ${Math.min(8, Math.max(1, Math.floor(Number(n) || 1)))}`)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostClearHands() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await clearAllHands(gameId.value)
    showToast('Руки скинуто')
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function adminNextSpeaker() {
  if (!isAdmin.value) return
  const elim = eliminatedBySlot()
  const slots = PLAYER_SLOTS
  const cur = String(gameRoom.value?.currentSpeaker ?? '').trim()
  let from = 0
  if (cur && slots.includes(cur)) from = slots.indexOf(cur) + 1

  for (let step = 0; step < slots.length; step++) {
    const slot = slots[(from + step) % slots.length]
    if (elim[slot] !== true) {
      try {
        loadError.value = null
        speakingDuration.value = 30
        timerSpeakerSlot.value = slot
        await startSpeakingTimer(gameId.value, slot, 30)
        showToast(`Next: ${slot} · 30s`)
      } catch (e) {
        loadError.value = e instanceof Error ? e.message : String(e)
      }
      return
    }
  }
  showToast('Немає активних гравців')
}

function rerollSingleTrait(fieldKey) {
  if (!isAdmin.value) return
  characterState[fieldKey].value = rollFieldValue(fieldKey, scenarioForRolls.value)
}

function toggleRevealAdmin(fieldKey) {
  if (!isAdmin.value) return
  characterState[fieldKey].revealed = !characterState[fieldKey].revealed
}

function rerollIdentity() {
  if (!isAdmin.value) return
  const g = genders[Math.floor(Math.random() * genders.length)]
  characterState.gender = g
  characterState.name = pickNameForGender(g)
  characterState.age = ages[Math.floor(Math.random() * ages.length)]
  characterState.identityRevealed = false
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
      <section class="admin-zone admin-zone--live" aria-label="Live">
        <h2 class="zone-kicker zone-kicker--section">LIVE</h2>
        <div class="desk-sticky-bar">
          <ShowDeskHostTools
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
            @next-speaker="adminNextSpeaker"
          />
        </div>
        <ShowDeskHandsPanel
          :game-room="gameRoom"
          :player-slots="PLAYER_SLOTS"
          @clear-hands="hostClearHands"
        />
        <ShowDeskHeader
          class="admin-zone__header"
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
      </section>

      <section class="admin-zone admin-zone--generate" aria-label="Генерація">
        <h2 class="zone-kicker zone-kicker--soft zone-kicker--gen-title">ГЕНЕРАЦІЯ</h2>
        <div class="gen-bar gen-bar--actions gen-bar--compact">
          <button type="button" class="btn-neon btn-neon--compact" @click="generateRandomCharacter">
            Generate Player
          </button>
          <button type="button" class="btn-neon btn-neon--soft btn-neon--compact" @click="generateCoreOnly">
            Усі 6 карт
          </button>
          <button type="button" class="btn-neon btn-neon--wide btn-neon--compact" @click="regenerateAllPlayers">
            Усі гравці
          </button>
        </div>
        <p class="hint-sc hint-sc--tight hint-sc--muted">{{ getScenarioHint(selectedScenario) }}</p>
        <div class="scenario-row">
          <label class="field-label field-label--inline">Сценарій</label>
          <select v-model="selectedScenario" class="input select select--compact" @change="persistScenarioChoice">
            <option v-for="sid in scenarioIds" :key="sid" :value="sid">{{ getScenarioLabel(sid) }}</option>
          </select>
        </div>
        <h3 class="sub-kicker sub-kicker--soft">Глобально всім</h3>
        <div class="global-btns global-btns--compact">
          <button type="button" class="gbtn" @click="globalRollField('profession')">Професія</button>
          <button type="button" class="gbtn" @click="globalRollField('health')">Здоров’я</button>
          <button type="button" class="gbtn" @click="globalRollField('phobia')">Фобія</button>
          <button type="button" class="gbtn" @click="globalChaos">Chaos</button>
        </div>
        <div class="pick-row pick-row--compact">
          <label class="field-label">Поле всім</label>
          <select v-model="globalFieldPick" class="input select select--compact">
            <option v-for="row in fieldConfig" :key="row.key" :value="row.key">{{ row.label }}</option>
          </select>
          <button type="button" class="btn-primary btn-primary--compact" @click="globalRollSelected">OK</button>
        </div>
      </section>

      <section
        class="admin-zone admin-zone--players"
        :class="{ 'admin-zone--nominated-active': nominatedPlayerActive }"
        aria-label="Гравці"
      >
        <h2 class="zone-kicker">ГРАВЦІ</h2>
        <ShowPlayersRoster
          :players="allPlayers"
          :hands-map="gameRoom.hands || {}"
          :current-player-id="playerId"
          :spotlight-player-id="String(gameRoom.activePlayer || '')"
          :speaker-id="String(gameRoom.currentSpeaker || '')"
          @select="goToPlayer"
        />
        <aside class="side-tools side-tools--inline">
          <label class="field-label">Game id</label>
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
      </section>

      <section
        class="admin-zone admin-zone--voting"
        :class="{ 'admin-zone--glow': gameRoom.voting?.active }"
        aria-label="Голосування"
      >
        <ShowDeskVotingPanel
          :game-room="gameRoom"
          :player-slots="PLAYER_SLOTS"
          :votes-live="votesLiveRound"
          :all-players-voted="allPlayersVoted"
          @nominate="hostNominate"
          @voting-target="hostVotingTarget"
          @voting-toggle="hostVotingToggle"
          @clear-votes="hostClearVotes"
          @remove-vote="hostRemoveVote"
          @stop-voting="hostStopVoting"
        />
      </section>

      <section class="admin-zone admin-zone--round" aria-label="Раунд">
        <ShowDeskRoundPanel
          :game-room="gameRoom"
          @next-round="hostNextRound"
          @reset-round="hostResetRound"
          @set-round="hostSetRound"
        />
      </section>
    </template>

    <div v-else class="player-hero">
      <h1 class="player-title">{{ GAME_TITLE }}</h1>
      <p class="player-phase">Фаза: {{ String(gameRoom.gamePhase || 'intro') }}</p>
      <button type="button" class="btn-hand" :class="{ up: myHandRaised }" @click="toggleMyHand">
        {{ myHandRaised ? '✋ Опустити руку' : '✋ Підняти руку' }}
      </button>
    </div>

    <p v-if="loadError" class="error">{{ loadError }}</p>

    <section class="panel editor-panel">
      <h2 class="panel-kicker">{{ isAdmin ? `Редактор: ${playerId}` : 'Твій персонаж' }}</h2>

      <div v-if="isAdmin" class="trait-block trait-block--identity">
        <div class="trait-toolbar">
          <span class="trait-label">Профіль (оверлей)</span>
          <div class="trait-actions">
            <button type="button" class="icon-btn" title="Перегенерувати" @click="rerollIdentity">🎲</button>
            <button
              type="button"
              class="icon-btn"
              :class="{ active: characterState.identityRevealed }"
              title="Показати на оверлеї"
              @click="characterState.identityRevealed = !characterState.identityRevealed"
            >
              👁
            </button>
          </div>
        </div>
        <div class="meta-grid">
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
      </div>

      <div v-else class="trait-block trait-block--player trait-block--identity">
        <div class="trait-toolbar">
          <span class="trait-label">Профіль</span>
        </div>
        <template v-if="characterState.identityRevealed">
          <p class="pv-line"><span class="mk">Ім’я</span> {{ characterState.name || '—' }}</p>
          <p class="pv-line"><span class="mk">Вік · гендер</span> {{ characterState.age || '—' }} · {{ characterState.gender || '—' }}</p>
        </template>
        <p v-else class="pv-hidden">••••••</p>
      </div>

      <div v-if="isAdmin" class="traits-stack">
        <div v-for="row in fieldConfig" :key="row.key" class="trait-block">
          <div class="trait-toolbar">
            <span class="trait-label">{{ row.label }}</span>
            <div class="trait-actions">
              <button type="button" class="icon-btn" title="Перегенерувати поле" @click="rerollSingleTrait(row.key)">🎲</button>
              <button
                type="button"
                class="icon-btn"
                :class="{ active: characterState[row.key].revealed }"
                title="На оверлеї"
                @click="toggleRevealAdmin(row.key)"
              >
                👁
              </button>
            </div>
          </div>
          <input v-model="characterState[row.key].value" type="text" class="input trait-value-input" />
        </div>
      </div>

      <div v-else class="traits-stack traits-stack--player">
        <div v-for="row in fieldConfig" :key="row.key" class="trait-block trait-block--player">
          <div class="trait-toolbar">
            <span class="trait-label">{{ row.label }}</span>
            <button
              v-if="!playerRevealLocked"
              type="button"
              class="icon-btn"
              :class="{ active: characterState[row.key].revealed }"
              @click="toggle(row.key)"
            >
              👁
            </button>
          </div>
          <p class="trait-value-preview">
            {{ characterState[row.key].revealed ? (characterState[row.key].value || '—') : '••••••' }}
          </p>
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

.desk-sticky-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  margin: 0 -1.25rem 1rem;
  padding: 0.5rem 1.25rem 0.65rem;
  background: rgba(3, 2, 10, 0.94);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(168, 85, 247, 0.2);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.desk-sticky-bar :deep(.cc) {
  margin-bottom: 0;
  border: 1px solid rgba(168, 85, 247, 0.28);
  box-shadow: none;
}

.admin-zone {
  margin-bottom: 1.1rem;
}

.admin-zone--live .admin-zone__header {
  margin-top: 0.35rem;
}

.zone-kicker--section {
  margin-bottom: 0.45rem;
  color: rgba(196, 181, 253, 0.48);
}

.admin-zone--voting.admin-zone--glow {
  border-radius: 16px;
  padding: 0.15rem;
  border: 1px solid rgba(56, 189, 248, 0.35);
  box-shadow: 0 0 28px rgba(56, 189, 248, 0.14);
  background: linear-gradient(
    135deg,
    rgba(56, 189, 248, 0.1) 0%,
    rgba(168, 85, 247, 0.07) 100%
  );
}

.admin-zone--round {
  margin-bottom: 1.25rem;
}

.admin-zone--nominated-active {
  border-radius: 16px;
  padding: 0.65rem 0.5rem 0.85rem;
  border: 1px solid rgba(248, 113, 113, 0.28);
  box-shadow: 0 0 22px rgba(220, 38, 38, 0.12);
  background: rgba(40, 10, 14, 0.2);
}

.zone-kicker {
  margin: 0 0 0.55rem;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.42);
  font-family: 'Orbitron', sans-serif;
}

.admin-zone--generate {
  padding: 0.85rem 1rem 1rem;
  border-radius: 14px;
  background: rgba(4, 3, 14, 0.52);
  border: 1px solid rgba(255, 255, 255, 0.04);
  margin-bottom: 1.2rem;
}

.zone-kicker--soft {
  color: rgba(196, 181, 253, 0.3);
  letter-spacing: 0.16em;
}

.gen-bar--compact {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
}

.gen-bar--compact .btn-neon--wide {
  width: auto;
  flex: 1 1 160px;
}

.btn-neon--compact {
  padding: 0.4rem 0.7rem;
  font-size: 0.7rem;
}

.hint-sc--muted {
  color: rgba(186, 181, 200, 0.5);
  font-size: 0.66rem;
  line-height: 1.45;
}

.scenario-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin: 0.25rem 0 0.45rem;
}

.field-label--inline {
  margin: 0;
}

.select--compact {
  padding: 0.38rem 0.5rem;
  font-size: 0.76rem;
  flex: 1 1 12rem;
  min-width: 10rem;
  max-width: 22rem;
}

.sub-kicker--soft {
  margin: 0.55rem 0 0.35rem;
  color: rgba(196, 181, 253, 0.26);
}

.global-btns--compact .gbtn {
  padding: 0.32rem 0.5rem;
  font-size: 0.7rem;
}

.pick-row--compact {
  margin-top: 0.45rem;
  align-items: center;
}

.btn-primary--compact {
  padding: 0.38rem 0.7rem;
  font-size: 0.76rem;
}

.zone-kicker--gen-title {
  letter-spacing: 0.2em;
  font-size: 0.68rem;
  color: rgba(196, 181, 253, 0.36);
}

.sub-kicker {
  margin: 0.85rem 0 0.45rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.38);
}

.hint-sc--tight {
  margin: 0.4rem 0 0.5rem;
}

.gen-bar--actions {
  margin-bottom: 0.5rem;
}

.scenario-actions--top {
  margin: 0 0 0.35rem;
}

.editor-panel {
  --editor-space: 0.7rem;
}

.editor-panel .trait-block {
  margin-bottom: var(--editor-space);
}

.editor-panel .traits-stack .trait-block:last-child {
  margin-bottom: 0;
}

.editor-panel .trait-block--identity {
  margin-bottom: 1rem;
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

.btn-hand {
  margin-top: 1rem;
  padding: 0.55rem 1rem;
  border-radius: 12px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgba(251, 191, 36, 0.35);
  background: rgba(60, 40, 8, 0.4);
  color: #fef3c7;
  transition:
    transform 0.12s ease,
    border-color 0.12s ease;
}

.btn-hand:hover {
  transform: scale(1.03);
  border-color: rgba(251, 191, 36, 0.55);
}

.btn-hand.up {
  border-color: rgba(74, 222, 128, 0.45);
  background: rgba(22, 101, 52, 0.35);
  color: #bbf7d0;
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

.gen-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.btn-neon {
  padding: 0.5rem 0.95rem;
  border-radius: 12px;
  border: 1px solid rgba(168, 85, 247, 0.55);
  background: linear-gradient(180deg, rgba(139, 92, 246, 0.38), rgba(88, 28, 135, 0.52));
  color: #faf5ff;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.04em;
  transition:
    transform 0.12s ease,
    box-shadow 0.15s;
}

.btn-neon:hover {
  transform: scale(1.02);
  box-shadow: 0 0 22px rgba(168, 85, 247, 0.35);
}

.btn-neon--soft {
  border-color: rgba(196, 181, 253, 0.38);
  background: rgba(0, 0, 0, 0.42);
}

.btn-neon--wide {
  width: 100%;
  box-sizing: border-box;
}

.trait-block {
  padding: 0.85rem 1rem;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(168, 85, 247, 0.16);
  margin-bottom: 0.65rem;
}

.trait-block--identity {
  margin-bottom: 1rem;
}

.trait-block--identity .meta-grid {
  margin-bottom: 0;
}

.trait-block--player {
  border-color: rgba(255, 255, 255, 0.08);
}

.trait-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.trait-label {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.55);
}

.trait-actions {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.icon-btn {
  width: 2.15rem;
  height: 2.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.4);
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s,
    transform 0.12s;
}

.icon-btn:hover {
  transform: scale(1.06);
  border-color: rgba(168, 85, 247, 0.45);
}

.icon-btn.active {
  border-color: rgba(168, 85, 247, 0.6);
  box-shadow: 0 0 16px rgba(168, 85, 247, 0.35);
  background: rgba(88, 28, 135, 0.35);
}

.traits-stack {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 1rem;
}

.trait-value-input {
  margin-top: 0;
}

.pv-line {
  margin: 0.35rem 0 0;
  color: #e2e8f0;
}

.pv-line:first-of-type {
  margin-top: 0.15rem;
}

.pv-hidden {
  margin: 0.35rem 0 0;
  letter-spacing: 0.25em;
  font-size: 1.1rem;
  color: rgba(196, 181, 253, 0.35);
}

.trait-value-preview {
  margin: 0;
  padding: 0.45rem 0 0.15rem;
  font-size: 0.92rem;
  font-weight: 600;
  color: #e2e8f0;
  line-height: 1.4;
}

.traits-stack--player .trait-block--player {
  margin-bottom: 0.5rem;
}

.side-tools--inline {
  margin-bottom: 1.1rem;
  padding: 0.85rem 1rem;
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
