<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ADMIN_KEY, HOST_PANEL_QUERY_KEY, HOST_PANEL_QUERY_VALUE } from '../config/access.js'
import {
  rollFieldValue,
  rollRandomIntoCharacter,
  randomPlayerAgeString,
  genders,
  pickNameForGender,
  createEmptyUsedState,
  mergePlayerDataIntoUsedState,
  traitExcludeSetFromPlayers,
  activeTemplateExcludeSetFromPlayers,
} from '../data/randomPools.js'
import { scenarioIds } from '../data/scenarios.js'
import {
  characterState,
  CORE_FIELD_KEYS,
  fieldConfig,
  applyRemoteCharacterData,
  snapshotCharacter,
} from '../characterState'
import { pickRandomActiveCardTemplateAvoiding } from '../data/activeCards.js'
import { applyActiveCardEffect } from '../services/activeCardEffects.js'
import {
  saveCharacter,
  fetchCharacter,
  subscribeToCharacter,
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
  regenerateAllPlayersActiveCards,
  createFirstNRandomPlayers,
  regeneratePlayerActiveCard,
  setGameNominations,
  nominationsFromRoom,
  nomineeTargetsInNominationOrder,
  setRoomVoting,
  setGameHandRaised,
  subscribeToVotes,
  clearAllVotes,
  deleteVoteDoc,
  setRoomRound,
  clearAllHands,
  setPlayerReady,
  saveVote,
  ensureGameRoomExists,
  seedMissingStandardPlayers,
  ensurePlayerCharacterExists,
  removePlayerFromGameRoomState,
  deletePlayerDocument,
  reviveAllEliminatedPlayers,
} from '../services/gameService'
import { millisFromFirestore } from '../utils/firestoreTime.js'
import ShowDeskHeader from '../components/showdesk/ShowDeskHeader.vue'
import ShowPlayersRoster from '../components/showdesk/ShowPlayersRoster.vue'
import { formatGenderDisplay } from '../utils/genderDisplay.js'
import { playRevealFlipSound, playVoteSubmitSound } from '../utils/voteUiSound.js'
import { syncHostControlChrome, clearHostControlChrome } from '../composables/hostControlChrome.js'
import { normalizeGameRoomPayload } from '../utils/gameRoomNormalize.js'
import { debugDelete } from '../utils/debugDelete.js'
import { normalizePlayerSlotId } from '../utils/playerSlot.js'
import { getPersistedGameId, setPersistedGameId } from '../utils/persistedGameId.js'
import {
  saveHostAccessSession,
  getValidatedPersistedHostKey,
  clearHostAccessSession,
} from '../utils/persistedHostSession.js'
import { getJoinSessionToken } from '../utils/joinSessionToken.js'
import {
  saveLastPlayerSlot,
  getValidatedLastPlayerSlot,
  routeHasExplicitPlayerSlot,
} from '../utils/persistedPlayerSlot.js'
import {
  loadHostSessionStats,
  saveHostSessionStats,
  clearHostSessionStats,
} from '../utils/hostSessionStatsStorage.js'
import { deleteField } from 'firebase/firestore'
import AppPageLoader from '../ui/molecules/AppPageLoader.vue'
import ConfirmDialog from '../ui/molecules/ConfirmDialog.vue'
import UiMenuSelect from '../ui/molecules/UiMenuSelect.vue'
import { callableApiEnabled } from '../services/callableApi.js'
import { ensureAnonymousAuth } from '../services/authBootstrap.js'
import { callLinkPlayerSlot } from '../services/callableClient.js'

const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()

/** Пульт ведучого: ?host=1 або застарілі закладки ?role=admin (без key у нових посиланнях). */
const hostModeRequested = computed(
  () =>
    String(route.query[HOST_PANEL_QUERY_KEY] ?? '').trim() === HOST_PANEL_QUERY_VALUE ||
    String(route.query.role ?? '').toLowerCase() === 'admin',
)
const urlKey = computed(() => {
  const q = String(route.query.key ?? '').trim()
  if (q !== '') return q
  if (hostModeRequested.value) {
    const p = getValidatedPersistedHostKey(ADMIN_KEY)
    return p ?? ''
  }
  return ''
})
const adminKeyOk = computed(() => urlKey.value === ADMIN_KEY)
const isAdmin = computed(() => hostModeRequested.value && adminKeyOk.value)
const adminAccessDenied = computed(() => hostModeRequested.value && !adminKeyOk.value)

const gameId = computed(() => {
  const q = route.query.game
  if (q != null && String(q).trim()) return String(q).trim()
  const p = getPersistedGameId()
  if (p) return p
  return 'test1'
})

/** `= # ? &` у значенні `?game=` ламають або плутають посилання (наприклад `test=4`). */
const GAME_ID_UNSAFE = /[=#?&]/
const gameIdHasUnsafeChars = computed(() => GAME_ID_UNSAFE.test(gameId.value))

const playerId = computed(() => normalizePlayerSlotId(route.query.player))

const modeLabel = computed(() => {
  if (adminAccessDenied.value) return t('control.accessDenied')
  if (isAdmin.value) return t('control.modeHost')
  return t('control.modePlayer')
})

const playerSlotAccessBlocked = computed(() => {
  if (isAdmin.value || adminAccessDenied.value) return false
  if (!playerJoinGateReady.value || !playerId.value) return false
  const st = playerDocJoinToken.value
  if (!st) return false
  const urlT = String(route.query.token ?? '').trim()
  const sess = getJoinSessionToken(gameId.value, playerId.value)
  return urlT !== st && sess !== st
})

/** Після deploy Callable: зв’язати anonymous uid зі слотом за joinToken (з URL або session). */
watch(
  () => ({
    gid: gameId.value,
    pid: playerId.value,
    adm: isAdmin.value,
    denied: adminAccessDenied.value,
    tokenQ: String(route.query.token ?? '').trim(),
    useFn: callableApiEnabled(),
  }),
  async ({ gid, pid, adm, denied, tokenQ, useFn }) => {
    if (!useFn || denied || adm || !gid || !pid) return
    const tok = tokenQ || getJoinSessionToken(gid, pid)
    if (!tok) return
    try {
      await ensureAnonymousAuth()
      await callLinkPlayerSlot(gid, pid, tok)
    } catch (e) {
      console.warn('[control] linkPlayerSlot', e)
    }
  },
  { immediate: true, flush: 'post' },
)

const overlayHrefGlobal = computed(() => ({
  path: '/overlay',
  query: { game: gameId.value },
}))

const overlayHrefPersonal = computed(() => ({
  path: '/overlay',
  query: { game: gameId.value, player: playerId.value },
}))

const syncing = ref(false)
/** Не ставити в чергу autosave одразу після підстановки даних з Firestore (інакше зайві Write / WebChannel). */
const skipRemoteAutosave = ref(false)
/** Перший snap персонажа з Firestore (лоадер на панелі). */
const panelHydrating = ref(false)
/** Для гравця: joinToken з того ж документа що й персонаж (захист пульта). */
const playerDocJoinToken = ref('')
const playerJoinGateReady = ref(false)
const loadError = ref(null)
const newPlayerId = ref('')
const draftGameId = ref('')

watch(
  gameId,
  (g) => {
    draftGameId.value = g
    setPersistedGameId(g)
  },
  { immediate: true },
)

watch([gameId, playerId, isAdmin], ([gid, pid, adm]) => {
  if (adm || !gid || !pid) return
  saveLastPlayerSlot(gid, pid)
})

const PLAYER_SLOTS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']
const PHASE_OPTIONS = ['intro', 'discussion', 'voting', 'final']

/** Порядок колонок на екрані гравця (широкий layout). */
const PLAYER_TRAIT_COL_LEFT = fieldConfig.filter((f) =>
  ['profession', 'health', 'phobia'].includes(f.key),
)
const PLAYER_TRAIT_COL_RIGHT = fieldConfig.filter((f) =>
  ['luggage', 'fact', 'quirk'].includes(f.key),
)

const selectedScenario = ref('classic_crash')
const timerSpeakerSlot = ref('p1')
const speakingDuration = ref(30)
const globalFieldPick = ref('profession')

const scenarioMenuOptions = computed(() =>
  scenarioIds.map((sid) => ({ value: sid, label: t(`scenarios.${sid}.label`) })),
)
const fieldMenuOptions = computed(() =>
  fieldConfig.map((row) => ({ value: row.key, label: t(`traits.${row.key}`) })),
)

const gameRoom = ref({})
const allPlayers = ref([])
/** Останній сирий список з onSnapshot(players) — до маски pending delete. */
const lastPlayersFirestoreList = ref([])
/** Слоти, які ведучий видаляє: лишаємо прихованими в UI, поки кеш не віддасть знімок без них (інакше «миготіння»). */
const pendingPlayerDeletes = ref([])
/** Після успішного delete: відсікаємо «привидів» із локального кешу Firestore (запізнілий snapshot ще з pN після того як pending уже скинувся). */
const antiGhostPlayerUntil = ref({})
const ANTI_GHOST_PLAYER_MS = 18_000
const votes = ref([])
let unsubGameRoom = null
let unsubPlayers = null
let unsubVotes = null
let unsubCharacter = null

/** Перші знімки Firestore + картка персонажа — повноекранний лоадер лише при «холодному» старті / зміні game id. */
const gotGameRoomSnap = ref(false)
const gotPlayersSnap = ref(false)
const bootstrappedControl = ref(false)

const toast = ref('')
let toastTimer = null

const tick = ref(Date.now())
let tickTimer = null

onMounted(() => {
  tickTimer = window.setInterval(() => {
    tick.value = Date.now()
  }, 250)
  nextTick(() => {
    if (route.path !== '/control' || hostModeRequested.value) return
    const q = route.query
    if (routeHasExplicitPlayerSlot(q)) {
      saveLastPlayerSlot(gameId.value, playerId.value)
      return
    }
    const last = getValidatedLastPlayerSlot(gameId.value)
    if (last) {
      router.replace({
        path: '/control',
        query: { ...q, player: last },
      })
      return
    }
    saveLastPlayerSlot(gameId.value, playerId.value)
  })
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
    showToast(t('toast.copied'))
  } catch {
    showToast(t('toast.copyError'))
  }
}

async function copyGlobal() {
  try {
    await navigator.clipboard.writeText(globalUrlAbsolute.value)
    showToast(t('toast.copied'))
  } catch {
    showToast(t('toast.copyError'))
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
  if (unsubCharacter) {
    unsubCharacter()
    unsubCharacter = null
  }
  votes.value = []
}

function pruneAntiGhostPlayerUntil() {
  const now = Date.now()
  const ag = antiGhostPlayerUntil.value
  let changed = false
  const next = { ...ag }
  for (const k of Object.keys(next)) {
    if (next[k] < now) {
      delete next[k]
      changed = true
    }
  }
  if (changed) antiGhostPlayerUntil.value = next
}

function activeAntiGhostPlayerSlots() {
  pruneAntiGhostPlayerUntil()
  const now = Date.now()
  const s = new Set()
  for (const [slot, until] of Object.entries(antiGhostPlayerUntil.value)) {
    if (until >= now) s.add(normalizePlayerSlotId(slot))
  }
  return s
}

function reconcilePendingDeletesWithSnapshot(rawList) {
  const prevPending = [...pendingPlayerDeletes.value]
  const inSnap = new Set(rawList.map((p) => normalizePlayerSlotId(p.id)))
  const nextPending = prevPending.filter((pid) => inSnap.has(pid))
  if (JSON.stringify(prevPending) !== JSON.stringify(nextPending)) {
    debugDelete('reconcile pending', {
      gameId: gameId.value,
      prevPending,
      nextPending,
      rawIdsInSnap: [...inSnap],
    })
  }
  pendingPlayerDeletes.value = nextPending
}

function applyPlayerListFromFirestore(rawList) {
  lastPlayersFirestoreList.value = rawList
  reconcilePendingDeletesWithSnapshot(rawList)
  const hide = new Set(pendingPlayerDeletes.value)
  const ghostHide = activeAntiGhostPlayerSlots()
  allPlayers.value = rawList.filter((x) => {
    const id = normalizePlayerSlotId(x.id)
    return !hide.has(id) && !ghostHide.has(id)
  })
  gotPlayersSnap.value = true
  if (hide.size > 0 || ghostHide.size > 0) {
    debugDelete('applyPlayerList (маска pending/antiGhost)', {
      gameId: gameId.value,
      rawCount: rawList.length,
      rawIds: rawList.map((x) => normalizePlayerSlotId(x.id)),
      pending: [...hide],
      antiGhost: [...ghostHide],
      visibleIds: allPlayers.value.map((x) => normalizePlayerSlotId(x.id)),
    })
  }
}

watch(
  [gameId, adminAccessDenied, isAdmin],
  () => {
    cleanupSubs()
    gotGameRoomSnap.value = false
    gotPlayersSnap.value = false
    lastPlayersFirestoreList.value = []
    pendingPlayerDeletes.value = []
    antiGhostPlayerUntil.value = {}
    if (adminAccessDenied.value) {
      gameRoom.value = {}
      allPlayers.value = []
      bootstrappedControl.value = true
      return
    }
    bootstrappedControl.value = false
    unsubGameRoom = subscribeToGameRoom(gameId.value, (d) => {
      gameRoom.value = normalizeGameRoomPayload(d && typeof d === 'object' ? d : {})
      gotGameRoomSnap.value = true
    })
    unsubVotes = subscribeToVotes(gameId.value, (list) => {
      votes.value = list
    })
    if (isAdmin.value) {
      unsubPlayers = subscribeToPlayers(gameId.value, (list) => {
        applyPlayerListFromFirestore(list)
      })
    } else {
      allPlayers.value = []
      gotPlayersSnap.value = true
    }
  },
  { immediate: true },
)

const suggestedNextPlayerId = computed(() => {
  const ids = new Set(allPlayers.value.map((p) => String(p.id)))
  for (const s of PLAYER_SLOTS) {
    if (!ids.has(s)) return s
  }
  let n = 11
  while (ids.has(`p${n}`)) n++
  return `p${n}`
})

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

const nominationsList = computed(() => nominationsFromRoom(gameRoom.value))

const nominatedPlayerActive = computed(() => nominationsList.value.length > 0)

/** Чекбокси ростера для масового видалення */
const bulkSelectedSlots = ref([])

function rosterSlotNum(id) {
  const s = String(id ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

const rosterOrderHint = computed(() => {
  const parts = []
  const done = gameRoom.value?.voteTargetsThisRound
  if (Array.isArray(done) && done.length) {
    parts.push(
      t('roster.voteTargetsDoneThisRound', {
        list: done.map((id) => rosterSlotNum(id)).join(', '),
      }),
    )
  }
  const q = gameRoom.value?.voting?.ballotQueue
  if (Array.isArray(q) && q.length) {
    parts.push(
      t('roster.ballotQueueLive', {
        order: q.map((id) => rosterSlotNum(id)).join(' → '),
      }),
    )
  }
  const nom = nomineeTargetsInNominationOrder(nominationsList.value)
  if (nom.length) {
    const alive = new Set(
      allPlayers.value.filter((p) => p.eliminated !== true).map((p) => normalizePlayerSlotId(p.id)),
    )
    const nums = nom.filter((id) => alive.has(normalizePlayerSlotId(id))).map((id) => rosterSlotNum(id))
    if (nums.length) parts.push(t('roster.nominationOrderHint', { order: nums.join(' → ') }))
  }
  if (
    Array.isArray(q) &&
    q.length &&
    String(gameRoom.value?.voting?.ballotSource || '') === 'manual' &&
    nomineeTargetsInNominationOrder(nominationsList.value).length
  ) {
    parts.push(t('roster.manualBallotLastNomHint'))
  }
  return parts.filter(Boolean).join(' · ')
})

const votesLiveRoundVoterIds = computed(() => {
  const rr = roomRoundLive.value
  return votes.value.filter((v) => Number(v.round) === rr).map((v) => normalizePlayerSlotId(v.id))
})

const isLastNominationBallotSlot = computed(() => {
  const v = gameRoom.value?.voting
  if (!v?.active || !Array.isArray(v.ballotQueue) || !v.ballotQueue.length) return false
  const alive = new Set(
    allPlayers.value.filter((p) => p.eliminated !== true).map((p) => normalizePlayerSlotId(p.id)),
  )
  const nom = nomineeTargetsInNominationOrder(nominationsList.value).filter((id) =>
    alive.has(normalizePlayerSlotId(id)),
  )
  const L = nom.length ? normalizePlayerSlotId(nom[nom.length - 1]) : ''
  if (!L) return false
  const q = v.ballotQueue.map(normalizePlayerSlotId)
  if (q[q.length - 1] !== L) return false
  const idx = Math.max(0, Math.min(q.length - 1, Number(v.ballotIndex) || 0))
  const tp = normalizePlayerSlotId(String(v.targetPlayer || '').trim())
  return idx === q.length - 1 && tp === L
})

function onToggleBulkSelection({ id, checked }) {
  if (!isAdmin.value) return
  const p = normalizePlayerSlotId(id)
  const s = new Set(bulkSelectedSlots.value.map((x) => normalizePlayerSlotId(x)))
  if (checked) s.add(p)
  else s.delete(p)
  bulkSelectedSlots.value = [...s].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  )
}

function clearBulkSelection() {
  bulkSelectedSlots.value = []
}

function askBulkDeletePlayers() {
  const ids = [...bulkSelectedSlots.value]
  if (!ids.length || !isAdmin.value) return
  openHostGenConfirm(
    t('control.bulkDeleteTitle'),
    t('control.bulkDeleteConfirm', { slots: ids.join(', ') }),
    () => hostExecuteBulkDeletePlayers(ids),
  )
}

async function hostExecuteBulkDeletePlayers(idsRaw) {
  if (!isAdmin.value) return
  const ids = [...new Set(idsRaw.map((x) => normalizePlayerSlotId(x)).filter(Boolean))]
  if (!ids.length) return
  clearTimeout(saveTimer)
  saveTimer = null
  const idSet = new Set(ids)
  try {
    loadError.value = null
    pendingPlayerDeletes.value = [...new Set([...pendingPlayerDeletes.value, ...ids])]
    applyPlayerListFromFirestore(lastPlayersFirestoreList.value)
    for (const p of ids) {
      await removePlayerFromGameRoomState(gameId.value, p)
      await deletePlayerDocument(gameId.value, p)
      const editorWasOnDeletedSlot =
        normalizePlayerSlotId(editorPlayerId.value) === p ||
        String(selectedDeskPlayerId.value || '').trim() === p
      if (editorWasOnDeletedSlot) slotsToSkipPersistOnSwitch.add(p)
      antiGhostPlayerUntil.value = {
        ...antiGhostPlayerUntil.value,
        [p]: Date.now() + ANTI_GHOST_PLAYER_MS,
      }
      applyPlayerListFromFirestore(lastPlayersFirestoreList.value)
    }
    for (const p of ids) {
      if (String(selectedDeskPlayerId.value) === p) selectedDeskPlayerId.value = ''
    }
    const curPid = normalizePlayerSlotId(playerId.value)
    if (idSet.has(curPid)) {
      const fallback = PLAYER_SLOTS.find((slot) => !idSet.has(slot)) || 'p1'
      navigateQuery({ player: fallback })
    }
    bulkSelectedSlots.value = []
    showToast(t('toast.playersBulkDeleted', { n: ids.length }))
  } catch (e) {
    pendingPlayerDeletes.value = pendingPlayerDeletes.value.filter((x) => !idSet.has(x))
    applyPlayerListFromFirestore(lastPlayersFirestoreList.value)
    const msg = e instanceof Error ? e.message : String(e)
    loadError.value = msg
    showToast(msg)
  }
}

async function hostApplyBallotFromNominations() {
  if (!isAdmin.value) return
  const alive = new Set(
    allPlayers.value.filter((p) => p.eliminated !== true).map((p) => normalizePlayerSlotId(p.id)),
  )
  const order = nomineeTargetsInNominationOrder(nominationsList.value).filter((t) =>
    alive.has(normalizePlayerSlotId(t)),
  )
  if (!order.length) {
    showToast(t('toast.noNomineesForBallot'))
    return
  }
  try {
    loadError.value = null
    const curV =
      gameRoom.value?.voting && typeof gameRoom.value.voting === 'object'
        ? { ...gameRoom.value.voting }
        : {}
    const ballotRunId = `run-${Date.now()}`
    const slotDur = Math.max(1, Math.floor(Number(curV.slotDurationSec) || 5))
    await saveGameRoom(gameId.value, {
      voting: {
        ...curV,
        active: false,
        targetPlayer: order[0],
        ballotQueue: order,
        ballotIndex: 0,
        ballotRunId,
        ballotRound: roomRoundLive.value,
        ballotSource: 'nominations',
        slotDurationSec: slotDur,
        voteSlotStartedAt: deleteField(),
      },
    })
    showToast(t('toast.ballotOrderSet', { count: order.length }))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

const selectedDeskPlayerId = ref('')

watch(gameId, () => {
  selectedDeskPlayerId.value = ''
  bulkSelectedSlots.value = []
})

/** Після зміни гри / URL слоту підтягуємо вибір ростера (без повного remount сторінки). */
watch(
  [isAdmin, playerId, gameId],
  () => {
    if (!isAdmin.value) return
    const pid = playerId.value
    if (selectedDeskPlayerId.value !== pid) {
      selectedDeskPlayerId.value = pid
    }
  },
  { immediate: true, flush: 'post' },
)

/** Документ гравця для редактора: у ведучого — вибраний слот у ростері, інакше з URL. */
const editorPlayerId = computed(() => {
  if (!isAdmin.value) return playerId.value
  const sel = String(selectedDeskPlayerId.value || '').trim()
  return sel ? normalizePlayerSlotId(sel) : playerId.value
})

/** Є документ у Firestore для обраного слота (кубик і автосейв мають сенс лише тоді). */
const editorPlayerInRoster = computed(() =>
  allPlayers.value.some(
    (p) => normalizePlayerSlotId(p.id) === normalizePlayerSlotId(editorPlayerId.value),
  ),
)

const raisedHandsCount = computed(() => {
  const h = gameRoom.value?.hands || {}
  return Object.keys(h).filter((k) => h[k] === true).length
})

const playersReadyMap = computed(() => {
  const r = gameRoom.value?.playersReady
  if (!r || typeof r !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(r)) {
    if (v === true) out[String(k)] = true
  }
  return out
})

const alivePlayersCount = computed(() => allPlayers.value.filter((p) => p.eliminated !== true).length)

const readyPlayersCount = computed(
  () =>
    allPlayers.value.filter((p) => p.eliminated !== true && playersReadyMap.value[String(p.id)] === true)
      .length,
)

const allAlivePlayersReady = computed(
  () => alivePlayersCount.value > 0 && readyPlayersCount.value === alivePlayersCount.value,
)

const playerPhaseDisplay = computed(() => {
  const p = String(gameRoom.value?.gamePhase || 'intro')
  const pk = `gamePhase.${p}`
  return te(pk) ? t(pk) : p
})

/** Sticky рядок: фаза, раунд, спікер, ціль, голосування, руки */
const hostSummaryLine = computed(() => {
  const phRaw = String(gameRoom.value?.gamePhase || 'intro')
  const pk = `gamePhase.${phRaw}`
  const ph = (te(pk) ? t(pk) : phRaw).toUpperCase()
  const r = roomRoundLive.value
  const sp = String(gameRoom.value?.currentSpeaker ?? '').trim() || '—'
  const tg = String(gameRoom.value?.voting?.targetPlayer ?? '').trim()
  const tgTxt = tg ? t('hostChrome.summaryTargetLine', { slot: tg }) : t('hostChrome.summaryTargetNone')
  const v = gameRoom.value?.voting?.active ? t('hostChrome.votingOn') : t('hostChrome.votingOff')
  const hc = raisedHandsCount.value
  const alive = alivePlayersCount.value
  const rd = readyPlayersCount.value
  const readySeg =
    alive > 0
      ? allAlivePlayersReady.value
        ? t('hostChrome.summaryAllReady', { n: rd, m: alive })
        : t('hostChrome.summaryReady', { n: rd, m: alive })
      : ''
  return `${ph} · R${r} · ${sp} · ${tgTxt} · ${v} · ✋ ${hc}${readySeg ? ` · ${readySeg}` : ''}`
})

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
  if (characterState.eliminated) return t('status.eliminated')
  const sp = String(gameRoom.value?.currentSpeaker ?? '').trim()
  if (sp && sp === playerId.value) return t('status.speaking')
  const ap = String(gameRoom.value?.activePlayer ?? '').trim()
  if (ap && ap === playerId.value) return t('status.spotlight')
  return t('status.waiting')
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
    showToast(t('toast.phaseDiscussion'))
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
      showToast(t('toast.timerPaused'))
    } else if (gameRoom.value?.timerPaused === true) {
      showToast(t('toast.alreadyPaused'))
    } else {
      showToast(t('toast.timerInactive'))
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
    clearHostSessionStats(gameId.value)
    hostSessionStats.value = { v: 1, voteSessions: [], handRaises: {} }
    prevHandsForStats.value = null
    showToast(t('toast.roomReset'))
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
    showToast(t('toast.slotTimer', { slot, sec }))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function adminPauseTimerOnly() {
  const r = hostTimerRemaining.value
  if (r == null) {
    showToast(t('toast.noActiveTimer'))
    return
  }
  try {
    await pauseSpeakingTimer(gameId.value, r)
    showToast(t('toast.pause'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function adminResumeTimer() {
  try {
    await resumeSpeakingTimer(gameId.value)
    showToast(t('toast.resumed'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function adminClearTimer() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await clearSpeakingTimer(gameId.value)
    showToast(t('toast.speakerCleared'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function setPhase(ph) {
  if (!isAdmin.value) return
  try {
    await setGamePhase(gameId.value, ph)
    showToast(t('toast.phaseNamed', { phase: ph }))
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

function eliminatedBySlot() {
  const m = Object.create(null)
  for (const p of allPlayers.value) {
    m[String(p.id)] = p.eliminated === true
  }
  return m
}

/** Лише стан з Firestore — без оптимістичного UI (ведучий може скинути руки, гравець має одразу бачити). */
const myHandRaised = computed(() => gameRoom.value?.hands?.[playerId.value] === true)

const myPlayerReady = computed(() => playersReadyMap.value[String(playerId.value)] === true)

function characterReadsFemale() {
  const d = formatGenderDisplay(characterState.gender)
  if (d === 'Жінка') return true
  const s = String(characterState.gender ?? '')
    .trim()
    .toLowerCase()
  return (
    s.includes('жін') ||
    s.includes('woman') ||
    s.includes('female') ||
    s.includes('kobieta') ||
    s === 'f'
  )
}

/** Текст кнопки готовності (зелений / червоний) з урахуванням статі персонажа. */
const playerReadyPillLabel = computed(() => {
  const fem = characterReadsFemale()
  if (myPlayerReady.value) {
    return fem ? t('control.readyOnF') : t('control.readyOnM')
  }
  return fem ? t('control.readyOffF') : t('control.readyOffM')
})

async function setMyHandRaised(raised) {
  const up = gameRoom.value?.hands?.[playerId.value] === true
  if (up === raised) return
  try {
    loadError.value = null
    await setGameHandRaised(gameId.value, playerId.value, raised)
    showToast(raised ? t('toast.handRaised') : t('toast.handLowered'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function setMyPlayerReady(ready) {
  if (isAdmin.value) return
  if (characterState.eliminated) return
  const up = playersReadyMap.value[String(playerId.value)] === true
  if (up === ready) return
  try {
    loadError.value = null
    await setPlayerReady(gameId.value, playerId.value, ready)
    showToast(ready ? t('toast.playerReadyOn') : t('toast.playerReadyOff'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

const playerVotingTargetId = computed(() =>
  String(gameRoom.value?.voting?.targetPlayer ?? '').trim(),
)

const showPlayerVotingUi = computed(
  () =>
    !isAdmin.value &&
    Boolean(gameRoom.value?.voting?.active) &&
    playerVotingTargetId.value.length > 0 &&
    characterState.eliminated !== true,
)

const playerHasVotedThisRound = computed(() =>
  votes.value.some(
    (v) =>
      String(v.id) === String(playerId.value) && Number(v.round) === roomRoundLive.value,
  ),
)

const playerVoteSlotLabel = computed(() => {
  const id = playerVotingTargetId.value
  const m = id.match(/^p(\d+)$/i)
  return m ? m[1] : id.replace(/^p/i, '') || id
})

const playerIsVotingTarget = computed(
  () => showPlayerVotingUi.value && String(playerId.value) === playerVotingTargetId.value,
)

const playerVoteBusy = ref(false)

async function submitPlayerVote(choice) {
  if (isAdmin.value) return
  if (!showPlayerVotingUi.value || playerHasVotedThisRound.value || playerVoteBusy.value) return
  const gid = gameId.value
  const voter = playerId.value
  const target = playerVotingTargetId.value
  const rr = roomRoundLive.value
  playerVoteBusy.value = true
  try {
    loadError.value = null
    const res = await saveVote(gid, voter, target, choice, rr)
    if (res.ok) {
      playVoteSubmitSound(0.14)
      showToast(t('toast.voteRecorded'))
    } else if (res.reason === 'already-voted') {
      showToast(t('toast.alreadyVoted'))
    } else if (res.reason === 'not-linked') {
      showToast(t('toast.voteNotLinked'))
    } else {
      showToast(t('toast.voteSendFail'))
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    playerVoteBusy.value = false
  }
}

function revealDemographics(open) {
  if (!open && !isAdmin.value && characterState.demographicsRevealed) {
    showToast(t('toast.revealCannotCloseProfile'))
    return
  }
  if (open && !isAdmin.value) {
    if (characterState.demographicsRevealed) return
    const ledger = syncRevealLedgerForOpenAttempt()
    const rr = roomRoundLive.value
    const profOpen = Boolean(characterState.profession?.revealed)
    if (rr === 1 && !profOpen) {
      showToast(t('toast.revealProfessionFirst'))
      return
    }
    if (ledger.count >= ledger.maxForRound) {
      showToast(t('toast.revealRoundLimit', { round: rr }))
      return
    }
    ledger.count += 1
  }
  if (open) playRevealFlipSound(0.09)
  characterState.demographicsRevealed = open
  characterState.identityRevealed = open
}

/** Ліміт «слотів» відкриття за раунд (гравець): 6 характеристик + профіль (вік/стать) — кожен слот з ліміту. Раунд 1: два слоти (спочатку професія). Далі: один. */
function computeRevealMaxForRound(rr) {
  if (rr === 1) return 2
  return 1
}

/** Скільки з CORE_FIELD_KEYS зараз відкрито (для узгодження лічильника з Firestore). */
function countRevealedCoreTraits() {
  return CORE_FIELD_KEYS.filter((k) => characterState[k]?.revealed === true).length
}

/** Слоти відкриття: картки + показ профілю (оверлей). */
function countPlayerRevealSlotsUsed() {
  return countRevealedCoreTraits() + (characterState.demographicsRevealed ? 1 : 0)
}

/**
 * Після зміни полів / завантаження: count не може бути більшим за фактично відкриті слоти
 * (картки + профіль), інакше лічильник з БД блокує відкриття в тому ж раунді.
 */
function reconcilePlayerRevealLedgerCount() {
  if (isAdmin.value) return
  const rr = roomRoundLive.value
  const L = characterState.revealLedger
  if (!L || typeof L !== 'object') return
  if (L.round !== rr) return
  const nUsed = countPlayerRevealSlotsUsed()
  if (L.count > nUsed) L.count = nUsed
  L.maxForRound = computeRevealMaxForRound(rr)
}

/** Синхронізує лічильник відкриттів з поточним раундом кімнати (гравець). */
function syncRevealLedgerForOpenAttempt() {
  const rr = roomRoundLive.value
  const maxForRound = computeRevealMaxForRound(rr)
  const cur = characterState.revealLedger
  if (!cur || typeof cur !== 'object') {
    characterState.revealLedger = { round: rr, count: 0, maxForRound }
    reconcilePlayerRevealLedgerCount()
    return characterState.revealLedger
  }
  if (cur.round !== rr || !(cur.maxForRound >= 1)) {
    characterState.revealLedger = { round: rr, count: 0, maxForRound }
    reconcilePlayerRevealLedgerCount()
    return characterState.revealLedger
  }
  cur.maxForRound = maxForRound
  reconcilePlayerRevealLedgerCount()
  return cur
}

function revealTrait(key, open) {
  const slot = characterState[key]
  if (!slot || typeof slot !== 'object') return

  if (!CORE_FIELD_KEYS.includes(key)) {
    if (open) playRevealFlipSound(0.09)
    slot.revealed = open
    return
  }

  if (!open) {
    if (!isAdmin.value && CORE_FIELD_KEYS.includes(key) && slot.revealed) {
      showToast(t('toast.revealCannotCloseTrait'))
      return
    }
    playRevealFlipSound(0.09)
    slot.revealed = false
    return
  }

  if (slot.revealed) return

  if (isAdmin.value) {
    playRevealFlipSound(0.09)
    slot.revealed = true
    return
  }

  const ledger = syncRevealLedgerForOpenAttempt()
  const rr = roomRoundLive.value
  const profOpen = Boolean(characterState.profession?.revealed)

  if (rr === 1 && key !== 'profession' && !profOpen) {
    showToast(t('toast.revealProfessionFirst'))
    return
  }

  if (ledger.count >= ledger.maxForRound) {
    showToast(t('toast.revealRoundLimit', { round: rr }))
    return
  }

  ledger.count += 1
  playRevealFlipSound(0.09)
  slot.revealed = true
}

async function hostToggleNomination({ target, by }) {
  if (!isAdmin.value) return
  const targetSlot = String(target ?? '').trim()
  const bySlot = String(by ?? '').trim()
  if (!targetSlot || !bySlot) return
  try {
    loadError.value = null
    const onePer = Boolean(gameRoom.value?.nominationOneTargetPerRound)
    let cur = nominationsFromRoom(gameRoom.value)
    const exists = cur.some((x) => x.target === targetSlot && x.by === bySlot)
    let next
    if (exists) {
      next = cur.filter((x) => !(x.target === targetSlot && x.by === bySlot))
    } else if (onePer) {
      next = [...cur.filter((x) => x.by !== bySlot), { target: targetSlot, by: bySlot }]
    } else {
      next = [...cur, { target: targetSlot, by: bySlot }]
    }
    await setGameNominations(gameId.value, next)
    showToast(exists ? t('toast.nomRemoved') : t('toast.nomAdded'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function onRosterHostCommand({ type, playerId: pid }) {
  if (!isAdmin.value) return
  const p = String(pid ?? '').trim()
  if (!p) return
  try {
    loadError.value = null
    switch (type) {
      case 'speaker': {
        const cur = String(gameRoom.value?.currentSpeaker ?? '').trim()
        if (cur === p) {
          await clearSpeakingTimer(gameId.value)
          await saveGameRoom(gameId.value, { currentSpeaker: '' })
          showToast(t('toast.speakerCleared'))
        } else {
          timerSpeakerSlot.value = p
          await saveGameRoom(gameId.value, { currentSpeaker: p })
          showToast(t('toast.speakerSet', { slot: p }))
        }
        break
      }
      case 'vote-target': {
        const pid = normalizePlayerSlotId(p)
        const alive = new Set(
          allPlayers.value
            .filter((pl) => pl.eliminated !== true)
            .map((pl) => normalizePlayerSlotId(pl.id)),
        )
        if (!alive.has(pid)) break
        const rr = roomRoundLive.value
        const curV =
          gameRoom.value?.voting && typeof gameRoom.value.voting === 'object'
            ? { ...gameRoom.value.voting }
            : {}
        const active = Boolean(curV.active)
        const noms = nomineeTargetsInNominationOrder(nominationsList.value).filter((id) =>
          alive.has(normalizePlayerSlotId(id)),
        )
        const nomTail = noms.length ? normalizePlayerSlotId(noms[noms.length - 1]) : ''
        let runId = String(curV.ballotRunId || '').trim()
        const prevRound = Number(curV.ballotRound) || 0
        if (!runId || prevRound !== rr) {
          runId = `run-${Date.now()}`
        }
        let q = Array.isArray(curV.ballotQueue)
          ? curV.ballotQueue.map(normalizePlayerSlotId).filter(Boolean)
          : []
        if (nomTail && q.length && q[q.length - 1] === nomTail) {
          q = q.slice(0, -1)
        }
        if (!q.includes(pid)) q.push(pid)
        const seen = new Set()
        q = q.filter((id) => {
          if (seen.has(id)) return false
          seen.add(id)
          return true
        })
        if (nomTail) {
          q = q.filter((id) => id !== nomTail)
          q.push(nomTail)
        }
        const ballotIndex = Math.min(
          Math.max(0, Number(curV.ballotIndex) || 0),
          Math.max(0, q.length - 1),
        )
        const targetPlayer = q[ballotIndex] || q[0] || pid
        await saveGameRoom(gameId.value, {
          voting: {
            ...curV,
            active,
            targetPlayer,
            ballotQueue: q,
            ballotIndex: q.length ? ballotIndex : 0,
            ballotRunId: runId,
            ballotRound: rr,
            ballotSource: 'manual',
          },
        })
        showToast(t('toast.voteTargetSet'))
        break
      }
      case 'spotlight': {
        await setSpotlightPlayer(p)
        break
      }
      case 'reset':
        await hostResetPlayerRoles(p)
        break
      case 'delete-player':
        openHostGenConfirm(
          t('control.deletePlayerTitle'),
          t('control.deletePlayerConfirm', { slot: p }),
          () => hostExecuteDeletePlayer(p),
        )
        break
      case 'eliminate-player': {
        const slot = normalizePlayerSlotId(p)
        const pl = allPlayers.value.find((x) => normalizePlayerSlotId(String(x.id)) === slot)
        if (!pl || pl.eliminated === true) break
        const existing = await fetchCharacter(gameId.value, slot)
        await saveCharacter(gameId.value, slot, {
          ...(existing && typeof existing === 'object' ? existing : {}),
          eliminated: true,
        })
        await setGameHandRaised(gameId.value, slot, false)
        showToast(t('toast.playerEliminatedFromCard', { slot }))
        break
      }
      case 'revive-player': {
        const slot = normalizePlayerSlotId(p)
        const pl = allPlayers.value.find((x) => normalizePlayerSlotId(String(x.id)) === slot)
        if (!pl || pl.eliminated !== true) break
        await saveCharacter(gameId.value, slot, { eliminated: false })
        showToast(t('toast.playerRevived', { slot }))
        break
      }
      default:
        break
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostExecuteDeletePlayer(pid) {
  if (!isAdmin.value) return
  const p = normalizePlayerSlotId(pid)
  if (!p) return
  debugDelete('hostExecuteDeletePlayer:start', {
    gameId: gameId.value,
    slot: p,
    url: typeof window !== 'undefined' ? window.location.href : '',
  })
  pendingPlayerDeletes.value = [...new Set([...pendingPlayerDeletes.value, p])]
  applyPlayerListFromFirestore(lastPlayersFirestoreList.value)
  try {
    clearTimeout(saveTimer)
    saveTimer = null
    loadError.value = null
    debugDelete('hostExecuteDeletePlayer:await removePlayerFromGameRoomState')
    await removePlayerFromGameRoomState(gameId.value, p)
    debugDelete('hostExecuteDeletePlayer:await deletePlayerDocument')
    await deletePlayerDocument(gameId.value, p)
    const editorWasOnDeletedSlot =
      normalizePlayerSlotId(editorPlayerId.value) === p ||
      String(selectedDeskPlayerId.value || '').trim() === p
    if (editorWasOnDeletedSlot) {
      slotsToSkipPersistOnSwitch.add(p)
    }
    antiGhostPlayerUntil.value = {
      ...antiGhostPlayerUntil.value,
      [p]: Date.now() + ANTI_GHOST_PLAYER_MS,
    }
    debugDelete('hostExecuteDeletePlayer:обидва await OK, оновлюємо ростер з lastSnap')
    applyPlayerListFromFirestore(lastPlayersFirestoreList.value)
    if (String(selectedDeskPlayerId.value) === p) {
      selectedDeskPlayerId.value = ''
    }
    if (playerId.value === p) {
      const fallback = PLAYER_SLOTS.find((slot) => slot !== p) || 'p1'
      navigateQuery({ player: fallback })
    }
    showToast(t('toast.playerDeleted', { slot: p }))
    debugDelete('hostExecuteDeletePlayer:успіх (тост показано)')
  } catch (e) {
    debugDelete('hostExecuteDeletePlayer:ПОМИЛКА', {
      name: e instanceof Error ? e.name : '',
      message: e instanceof Error ? e.message : String(e),
      code: typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined,
    })
    pendingPlayerDeletes.value = pendingPlayerDeletes.value.filter((x) => x !== p)
    applyPlayerListFromFirestore(lastPlayersFirestoreList.value)
    const raw = e instanceof Error ? e.message : String(e)
    const msg = raw.startsWith('PLAYER_DOC_NOT_FOUND:')
      ? t('control.deletePlayerDocMissing', { slot: raw.slice('PLAYER_DOC_NOT_FOUND:'.length) })
      : raw
    loadError.value = `${t('control.deletePlayerFailed')}: ${msg}`
    showToast(`${t('control.deletePlayerFailed')}: ${msg}`)
  }
}

async function hostResetPlayerRoles(pid) {
  if (!isAdmin.value) return
  const p = String(pid ?? '').trim()
  if (!p) return
  try {
    loadError.value = null
    const gr = gameRoom.value
    const list = nominationsFromRoom(gr)
    const next = list.filter((x) => x.target !== p && x.by !== p)
    const legacyNom = String(gr?.nominatedPlayer ?? '').trim() === p && list.length === 0
    if (next.length !== list.length || legacyNom) {
      await setGameNominations(gameId.value, next)
    }
    if (String(gr?.voting?.targetPlayer ?? '').trim() === p) {
      await setRoomVoting(gameId.value, false, '', { clearBallot: true })
    }
    if (String(gr?.currentSpeaker ?? '').trim() === p) {
      await clearSpeakingTimer(gameId.value)
    }
    if (String(gr?.activePlayer ?? '').trim() === p) {
      await saveGameRoom(gameId.value, { activePlayer: '' })
    }
    showToast(t('toast.cleared'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostVotingStart() {
  if (!isAdmin.value) return
  let v = gameRoom.value?.voting && typeof gameRoom.value.voting === 'object' ? { ...gameRoom.value.voting } : {}
  const q = v.ballotQueue
  let tp = String(v.targetPlayer ?? '').trim()
  if (Array.isArray(q) && q.length > 0) {
    const idx = Math.max(0, Math.min(q.length - 1, Number(v.ballotIndex) || 0))
    const expected = normalizePlayerSlotId(q[idx])
    if (tp !== expected) {
      tp = expected
      v = { ...v, targetPlayer: tp, ballotIndex: idx, ballotQueue: q }
      try {
        await saveGameRoom(gameId.value, { voting: v })
      } catch (e) {
        loadError.value = e instanceof Error ? e.message : String(e)
        return
      }
    }
  }
  if (!tp) {
    showToast(t('toast.pickVoteTarget'))
    return
  }
  try {
    loadError.value = null
    const slotSec = Math.max(1, Math.floor(Number(v.slotDurationSec || gameRoom.value?.voting?.slotDurationSec) || 5))
    await setRoomVoting(gameId.value, true, tp, { slotDurationSec: slotSec })
    showToast(t('toast.votingOpened'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

/** Локальна статистика сесії (localStorage по gameId): голосування + підрахунок підняття рук. */
const hostSessionStats = ref({ v: 1, voteSessions: [], handRaises: {} })

function persistHostStats() {
  saveHostSessionStats(gameId.value, {
    voteSessions: hostSessionStats.value.voteSessions || [],
    handRaises: hostSessionStats.value.handRaises || {},
  })
}

function bumpHandRaiseSlot(pidRaw) {
  if (!isAdmin.value) return
  const pid = normalizePlayerSlotId(pidRaw)
  if (!pid) return
  const hr = { ...(hostSessionStats.value.handRaises || {}) }
  hr[pid] = (hr[pid] || 0) + 1
  hostSessionStats.value = {
    v: 1,
    voteSessions: hostSessionStats.value.voteSessions || [],
    handRaises: hr,
  }
  persistHostStats()
}

/** null = ще не «заряджено» — перший знімок рук без лічильника (щоб не порахувати вже підняті). */
const prevHandsForStats = ref(null)

watch([gameId, isAdmin], () => {
  if (!isAdmin.value) return
  hostSessionStats.value = loadHostSessionStats(gameId.value)
  prevHandsForStats.value = null
}, { immediate: true })

watch(
  () => ({
    admin: isAdmin.value,
    snap: gotGameRoomSnap.value,
    hands: gameRoom.value?.hands,
  }),
  ({ admin, snap, hands }) => {
    if (!admin || !snap) return
    const h = hands && typeof hands === 'object' ? { ...hands } : {}
    if (prevHandsForStats.value === null) {
      prevHandsForStats.value = h
      return
    }
    const prev = prevHandsForStats.value
    for (const [pid, up] of Object.entries(h)) {
      if (up === true && prev[pid] !== true) bumpHandRaiseSlot(pid)
    }
    prevHandsForStats.value = h
  },
  { deep: true },
)

const hostHandRaiseRows = computed(() => {
  const hr = hostSessionStats.value?.handRaises || {}
  const ids = new Set(PLAYER_SLOTS.map((s) => normalizePlayerSlotId(s)))
  for (const k of Object.keys(hr)) ids.add(normalizePlayerSlotId(k))
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((id) => ({ id, n: Math.max(0, Math.floor(Number(hr[id]) || 0)) }))
})

const elimSuggestHandLines = computed(() => {
  const slot = normalizePlayerSlotId(String(elimSuggestSlot.value || '').trim())
  if (!slot) return null
  const hr = hostSessionStats.value.handRaises || {}
  const alive = allPlayers.value.filter((p) => p.eliminated !== true)
  let best = []
  let max = -1
  const ids = alive.map((p) => normalizePlayerSlotId(p.id))
  for (const id of ids) {
    const n = Math.floor(Number(hr[id]) || 0)
    if (n > max) {
      max = n
      best = [id]
    } else if (n === max && n > 0) {
      best.push(id)
    }
  }
  if (max <= 0) return null
  if (best.length === 1 && best[0] === slot) return { key: 'agree' }
  return { key: 'top', list: best.join(', ') }
})

function hostSessionVoteTally(sess) {
  const votes = sess?.votes || []
  let forC = 0
  let ag = 0
  for (const v of votes) {
    if (v.choice === 'against') ag += 1
    else forC += 1
  }
  return { forC, ag }
}

function hostSessionEndedLabel(ts) {
  const n = Math.floor(Number(ts) || 0)
  if (!n) return '—'
  return new Date(n).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function hostClearSessionStatsOnly() {
  if (!isAdmin.value) return
  clearHostSessionStats(gameId.value)
  hostSessionStats.value = { v: 1, voteSessions: [], handRaises: {} }
  showToast(t('toast.sessionStatsCleared'))
}

function sessionVoteForCount(e) {
  let forN = 0
  for (const v of e.votes || []) {
    if (v.choice !== 'against') forN += 1
  }
  return forN
}

function votesPayloadFingerprint(payload) {
  if (!Array.isArray(payload)) return ''
  return [...payload]
    .map((v) => `${normalizePlayerSlotId(v.voter)}:${v.choice === 'against' ? 'a' : 'f'}`)
    .sort()
    .join('|')
}

function aggregateForVotesByTarget(entries) {
  const m = {}
  for (const e of entries) {
    const tid = normalizePlayerSlotId(e.target)
    if (!tid) continue
    const mult = Math.max(1, Math.floor(Number(e.slotCount) || 1))
    const forN = sessionVoteForCount(e)
    m[tid] = (m[tid] || 0) + forN * mult
  }
  return m
}

/** Підсумок 👍 по серії слотів: однозначний лідер, нічия кількох, або немає голосів. */
function analyzeVoteOutcome(tallies) {
  const pairs = Object.entries(tallies).filter(([, n]) => n > 0)
  if (pairs.length === 0) return { kind: 'none' }
  pairs.sort((a, b) => b[1] - a[1])
  const max = pairs[0][1]
  const tops = pairs.filter(([, n]) => n === max).map(([id]) => normalizePlayerSlotId(id))
  if (tops.length >= 2) return { kind: 'tie', slots: tops }
  return { kind: 'winner', slot: tops[0] }
}

/** Порядок переголосування: спочатку як у номінаціях, далі — за номером слота на столі. */
function orderTieSlotsByNominationOrder(slots, nominations, slotOrder) {
  const norm = [...new Set(slots.map((s) => normalizePlayerSlotId(s)))]
  const set = new Set(norm)
  const fromNom = nomineeTargetsInNominationOrder(nominations).filter((s) => set.has(s))
  const rest = norm.filter((s) => !fromNom.includes(s))
  rest.sort((a, b) => {
    const ia = slotOrder.indexOf(a)
    const ib = slotOrder.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  return [...fromNom, ...rest]
}

const lastAutoFinishedVoteSlotMs = ref(null)
const ballotSummaryOpen = ref(false)
const ballotSummarySessions = ref([])
const tieBreakOpen = ref(false)
const tieBreakSlots = ref([])

const elimSuggestOpen = ref(false)
const elimSuggestSlot = ref('')
const elimSuggestForVotes = ref(0)

async function hostFinishVoting() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    const vRaw =
      gameRoom.value?.voting && typeof gameRoom.value.voting === 'object' ? gameRoom.value.voting : {}
    const target = String(vRaw.targetPlayer ?? '').trim()
    const ballotQ = vRaw.ballotQueue
    const ballotRunId = String(vRaw.ballotRunId || '')
    const ballotIdx = Number(vRaw.ballotIndex) || 0
    const rr = roomRoundLive.value
    const list = [...votesLiveRound.value]
    const hadNoRealVotes = list.length === 0
    let votesPayload = list.map((v) => ({
      voter: normalizePlayerSlotId(v.id),
      choice: v.choice === 'against' ? 'against' : 'for',
    }))
    let statTarget = target
    if (votesPayload.length === 0 && Array.isArray(ballotQ) && ballotQ.length > 0) {
      const lastSlot = normalizePlayerSlotId(ballotQ[ballotQ.length - 1])
      statTarget = lastSlot
      const aliveIds = allPlayers.value
        .filter((p) => p.eliminated !== true)
        .map((p) => normalizePlayerSlotId(p.id))
      votesPayload = aliveIds.map((voter) => ({ voter, choice: 'for' }))
    }
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      endedAt: Date.now(),
      round: rr,
      target: statTarget || '',
      ballotRunId,
      votes: votesPayload,
    }
    const existingSessions = hostSessionStats.value.voteSessions || []
    const fp = votesPayloadFingerprint(votesPayload)
    const isSyntheticEmptySlot =
      hadNoRealVotes && Array.isArray(ballotQ) && ballotQ.length > 0 && votesPayload.length > 0

    let vs
    if (isSyntheticEmptySlot && ballotRunId) {
      const prev = existingSessions[0]
      const sameTarget = normalizePlayerSlotId(prev?.target) === normalizePlayerSlotId(statTarget)
      const sameVotes =
        prev && votesPayloadFingerprint(prev.votes || []) === fp
      if (
        prev &&
        prev.syntheticEmptyRun === true &&
        String(prev.ballotRunId || '') === ballotRunId &&
        sameTarget &&
        sameVotes
      ) {
        vs = [
          {
            ...prev,
            slotCount: (prev.slotCount || 1) + 1,
            endedAt: Date.now(),
          },
          ...existingSessions.slice(1),
        ].slice(0, 50)
      } else {
        vs = [
          {
            ...entry,
            syntheticEmptyRun: true,
            slotCount: 1,
          },
          ...existingSessions,
        ].slice(0, 50)
      }
    } else {
      vs = [entry, ...existingSessions].slice(0, 50)
    }
    hostSessionStats.value = {
      v: 1,
      voteSessions: vs,
      handRaises: hostSessionStats.value.handRaises || {},
    }
    persistHostStats()
    await appendVoteTargetsThisRound(statTarget)

    if (Array.isArray(ballotQ) && ballotIdx < ballotQ.length - 1) {
      const nextIdx = ballotIdx + 1
      const nextTarget = normalizePlayerSlotId(ballotQ[nextIdx])
      const curVm = { ...vRaw }
      await saveGameRoom(gameId.value, {
        voting: {
          ...curVm,
          active: false,
          targetPlayer: nextTarget,
          ballotQueue: ballotQ,
          ballotIndex: nextIdx,
          voteSlotStartedAt: deleteField(),
        },
      })
      await clearAllVotes(gameId.value)
      showToast(t('toast.votingNextTarget', { slot: nextTarget }))
      return
    }

    await clearAllVotes(gameId.value)

    const sessions = hostSessionStats.value.voteSessions || []
    const runEntries =
      ballotRunId && sessions.length
        ? sessions.filter((s) => String(s.ballotRunId || '') === ballotRunId)
        : [entry]
    const tallies = aggregateForVotesByTarget(runEntries.length ? runEntries : [entry])
    const outcome = analyzeVoteOutcome(tallies)

    if (outcome.kind === 'tie' && outcome.slots.length >= 2) {
      const ordered = orderTieSlotsByNominationOrder(
        outcome.slots,
        nominationsFromRoom(gameRoom.value),
        PLAYER_SLOTS,
      )
      tieBreakSlots.value = ordered
      tieBreakOpen.value = true
      await setGameNominations(gameId.value, [])
      const curVm = { ...vRaw }
      const slotSec = Math.max(5, Math.min(60, Math.floor(Number(curVm.slotDurationSec) || 30)))
      await saveGameRoom(gameId.value, {
        voting: {
          ...curVm,
          active: false,
          targetPlayer: ordered[0],
          ballotQueue: ordered,
          ballotIndex: 0,
          ballotRunId: `tie-${Date.now()}`,
          slotDurationSec: slotSec,
          voteSlotStartedAt: deleteField(),
        },
      })
      showToast(t('toast.votingTiePickDefense'))
      return
    }

    await setRoomVoting(gameId.value, false, '', { clearBallot: true })
    ballotSummarySessions.value = runEntries.length ? runEntries : [entry]
    tieBreakOpen.value = false
    tieBreakSlots.value = []

    if (outcome.kind === 'winner') {
      elimSuggestSlot.value = outcome.slot
      elimSuggestForVotes.value = Math.floor(Number(tallies[outcome.slot]) || 0)
      elimSuggestOpen.value = true
    } else {
      ballotSummaryOpen.value = true
    }
    showToast(t('toast.votingClosed'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

watch(
  () => [
    isAdmin.value,
    gameRoom.value?.voting?.active,
    gameRoom.value?.voting?.voteSlotStartedAt,
    gameRoom.value?.voting?.slotDurationSec,
    tick.value,
  ],
  () => {
    if (!isAdmin.value) return
    const vot = gameRoom.value?.voting
    if (!vot?.active) return
    const start = millisFromFirestore(vot.voteSlotStartedAt)
    if (start == null) return
    const sec = Math.max(1, Number(vot.slotDurationSec) || 5)
    const elapsed = (tick.value - start) / 1000
    if (elapsed < sec) return
    if (lastAutoFinishedVoteSlotMs.value === start) return
    lastAutoFinishedVoteSlotMs.value = start
    void hostFinishVoting()
  },
)

async function hostSetVoteSlotDuration(sec) {
  if (!isAdmin.value) return
  const curV =
    gameRoom.value?.voting && typeof gameRoom.value.voting === 'object'
      ? { ...gameRoom.value.voting }
      : {}
  const n = Math.max(1, Math.floor(Number(sec) || 5))
  try {
    loadError.value = null
    await saveGameRoom(gameId.value, { voting: { ...curV, slotDurationSec: n } })
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostTieDefenseDuration(sec) {
  if (!isAdmin.value || !tieBreakOpen.value) return
  const n = Math.max(5, Math.min(60, Math.floor(Number(sec) || 30)))
  const curV =
    gameRoom.value?.voting && typeof gameRoom.value.voting === 'object'
      ? { ...gameRoom.value.voting }
      : {}
  try {
    loadError.value = null
    await saveGameRoom(gameId.value, { voting: { ...curV, slotDurationSec: n } })
    tieBreakOpen.value = false
    tieBreakSlots.value = []
    showToast(t('toast.tieDefenseDurationSet', { sec: n }))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostEliminateSuggestedPlayer() {
  if (!isAdmin.value) return false
  const slot = normalizePlayerSlotId(String(elimSuggestSlot.value || '').trim())
  if (!slot) return false
  try {
    loadError.value = null
    const existing = await fetchCharacter(gameId.value, slot)
    await saveCharacter(gameId.value, slot, {
      ...(existing && typeof existing === 'object' ? existing : {}),
      eliminated: true,
    })
    await setGameNominations(gameId.value, [])
    await setRoomVoting(gameId.value, false, '', { clearBallot: true })
    await setGameHandRaised(gameId.value, slot, false)
    showToast(t('toast.playerMarkedEliminated', { slot }))
    return true
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
    return false
  }
}

async function hostConfirmEliminateSuggested() {
  if (!isAdmin.value) return
  const ok = await hostEliminateSuggestedPlayer()
  if (!ok) return
  elimSuggestOpen.value = false
  elimSuggestSlot.value = ''
  ballotSummaryOpen.value = true
}

async function hostDismissEliminateSuggested() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await setGameNominations(gameId.value, [])
    elimSuggestOpen.value = false
    elimSuggestSlot.value = ''
    ballotSummaryOpen.value = true
    showToast(t('toast.nominationsClearedAfterVote'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function persistNominationOnePerRound(val) {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await saveGameRoom(gameId.value, { nominationOneTargetPerRound: Boolean(val) })
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

/** Накопичення цілей голосування в поточному раунді (окремо від черги). */
async function appendVoteTargetsThisRound(slotRaw) {
  if (!isAdmin.value) return
  const tid = normalizePlayerSlotId(String(slotRaw ?? '').trim())
  if (!tid) return
  const prev = Array.isArray(gameRoom.value?.voteTargetsThisRound)
    ? gameRoom.value.voteTargetsThisRound.map(normalizePlayerSlotId)
    : []
  if (prev.includes(tid)) return
  try {
    loadError.value = null
    await saveGameRoom(gameId.value, { voteTargetsThisRound: [...prev, tid] })
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
    showToast(t('toast.voteRemoved', { slot: v }))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostRoundDelta(d) {
  if (!isAdmin.value) return
  const cur = roomRoundLive.value
  const next = Math.min(8, Math.max(1, cur + Number(d)))
  if (next === cur) return
  try {
    loadError.value = null
    await setRoomRound(gameId.value, next)
    showToast(t('toast.roundChanged'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostClearHands() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await clearAllHands(gameId.value)
    showToast(t('toast.handsCleared'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function hostReviveAllPlayers() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    const n = await reviveAllEliminatedPlayers(gameId.value)
    if (n <= 0) showToast(t('toast.reviveAllNobody'))
    else showToast(t('toast.reviveAllDone', { n }))
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

  const sec = Math.max(1, Math.floor(Number(speakingDuration.value) || 30))
  for (let step = 0; step < slots.length; step++) {
    const slot = slots[(from + step) % slots.length]
    if (elim[slot] !== true) {
      try {
        loadError.value = null
        timerSpeakerSlot.value = slot
        await startSpeakingTimer(gameId.value, slot, sec)
        showToast(t('toast.slotTimer', { slot, sec }))
      } catch (e) {
        loadError.value = e instanceof Error ? e.message : String(e)
      }
      return
    }
  }
  showToast(t('toast.noAlivePlayers'))
}

const hostChromeActions = {
  roundDelta: hostRoundDelta,
  votingStart: hostVotingStart,
  votingFinish: hostFinishVoting,
  removeVote: hostRemoveVote,
  setVoteSlotDuration: hostSetVoteSlotDuration,
  tieDefenseDuration: hostTieDefenseDuration,
  clearHands: hostClearHands,
  reviveAllPlayers: hostReviveAllPlayers,
  setSpeakingDuration(n) {
    speakingDuration.value = n
  },
  startRound: controlStartRound,
  pauseShow: controlPauseShow,
  resetRoom: controlReset,
  setPhase,
  startTimer: adminStartSpeakingTimer,
  pauseTimer: adminPauseTimerOnly,
  resumeTimer: adminResumeTimer,
  clearTimer: adminClearTimer,
  nextSpeaker: adminNextSpeaker,
}

watchEffect(() => {
  if (adminAccessDenied.value || !isAdmin.value) {
    clearHostControlChrome()
    return
  }
  syncHostControlChrome({
    summaryLine: hostSummaryLine.value,
    round: roomRoundLive.value,
    gameRoom: gameRoom.value,
    votesLive: votesLiveRound.value,
    allPlayersVoted: allPlayersVoted.value,
    speakingDuration: speakingDuration.value,
    phaseOptions: PHASE_OPTIONS,
    actions: hostChromeActions,
    voteHistorySessions: hostSessionStats.value.voteSessions || [],
    handRaises: hostSessionStats.value.handRaises || {},
  })
})

function buildUsedStateExcludingEditorSlot() {
  const us = createEmptyUsedState()
  const eid = String(editorPlayerId.value)
  for (const p of allPlayers.value) {
    if (String(p.id) === eid) continue
    mergePlayerDataIntoUsedState(p, us)
  }
  return us
}

async function ensureEditorSlotHasPlayerDoc() {
  if (!isAdmin.value) return
  const gid = gameId.value
  const pid = editorPlayerId.value
  if (!gid || !pid) return
  if (editorPlayerInRoster.value) return
  await ensureGameRoomExists(gid)
  const created = await ensurePlayerCharacterExists(gid, pid, selectedScenario.value)
  const data = await fetchCharacter(gid, pid)
  if (data) applyFromFirestoreSnapshot(data)
  if (created) showToast(t('toast.playerAdded', { slot: pid }))
}

/** Якщо в кімнаті ще нікого немає — фокусуємо слот p1, щоб кубик / «згенерувати» створювали першого гравця. */
async function focusFirstSlotWhenRosterEmpty() {
  if (!isAdmin.value) return
  if (allPlayers.value.length > 0) return
  const first = 'p1'
  selectedDeskPlayerId.value = first
  navigateQuery({ player: first })
  await nextTick()
}

async function rerollSingleTrait(fieldKey) {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await focusFirstSlotWhenRosterEmpty()
    await ensureEditorSlotHasPlayerDoc()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
    return
  }
  characterState[fieldKey].value = rollFieldValue(
    fieldKey,
    scenarioForRolls.value,
    traitExcludeSetFromPlayers(allPlayers.value, fieldKey, editorPlayerId.value),
  )
}

async function rerollIdentity() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await focusFirstSlotWhenRosterEmpty()
    await ensureEditorSlotHasPlayerDoc()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
    return
  }
  const g = genders[Math.floor(Math.random() * genders.length)]
  characterState.gender = g
  characterState.name = pickNameForGender(g)
  characterState.age = randomPlayerAgeString()
  characterState.identityRevealed = false
  characterState.demographicsRevealed = false
}

function generateRandomCharacter() {
  if (!isAdmin.value) return
  rollRandomIntoCharacter(characterState, {
    scenarioId: selectedScenario.value,
    usedState: buildUsedStateExcludingEditorSlot(),
  })
}

async function globalRollField(fieldKey) {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    const sid = scenarioForRolls.value
    await applyGlobalAction(gameId.value, fieldKey, sid)
    showToast(t('toast.allField', { field: t(`traits.${fieldKey}`) }))
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
    showToast(t('toast.allRegenerated'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function regenerateActiveCardsForAllPlayers() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await regenerateAllPlayersActiveCards(gameId.value)
    showToast(t('toast.activeCardsUpdated'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function regenerateActiveCardForCurrentSlot() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    await regeneratePlayerActiveCard(gameId.value, editorPlayerId.value)
    showToast(t('toast.activeCardSlotUpdated', { slot: editorPlayerId.value }))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

const genDialogOpen = ref(false)
const genDialogTitle = ref('')
const genDialogMessage = ref('')
const genDialogShowCountInput = ref(false)
const genEmptyRosterCount = ref(6)
let genDialogRunner = null

function openHostGenConfirm(title, message, runner, opts = {}) {
  const { showEmptyRosterCount = false } = opts
  genDialogTitle.value = title
  genDialogMessage.value = message
  genDialogRunner = runner
  genDialogShowCountInput.value = showEmptyRosterCount
  genDialogOpen.value = true
}

function onHostGenDialogClose() {
  genDialogRunner = null
  genDialogShowCountInput.value = false
}

async function onHostGenDialogConfirm() {
  const fn = genDialogRunner
  genDialogRunner = null
  if (fn) await fn()
}

function askGenerateRandomCharacter() {
  if (allPlayers.value.length === 0) {
    openHostGenConfirm(
      t('control.genConfirmTitle'),
      t('control.genConfirmFirstPlayerBody'),
      async () => {
        try {
          loadError.value = null
          await focusFirstSlotWhenRosterEmpty()
          await ensureEditorSlotHasPlayerDoc()
          generateRandomCharacter()
        } catch (e) {
          loadError.value = e instanceof Error ? e.message : String(e)
        }
      },
    )
  } else {
    openHostGenConfirm(
      t('control.genConfirmTitle'),
      t('control.genConfirmPlayer', { slot: editorPlayerId.value }),
      () => generateRandomCharacter(),
    )
  }
}

async function runCreateNPlayersFromDialog() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    const raw = Number(genEmptyRosterCount.value)
    const n = Math.max(1, Math.min(10, Math.floor(Number.isFinite(raw) ? raw : 6) || 1))
    await ensureGameRoomExists(gameId.value)
    await createFirstNRandomPlayers(gameId.value, selectedScenario.value, n)
    showToast(t('toast.rosterCreatedN', { n }))
    selectedDeskPlayerId.value = 'p1'
    navigateQuery({ player: 'p1' })
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

function askRegenerateAllPlayers() {
  if (allPlayers.value.length === 0) {
    genEmptyRosterCount.value = 6
    openHostGenConfirm(
      t('control.genConfirmTitle'),
      t('control.genConfirmAllEmpty'),
      runCreateNPlayersFromDialog,
      { showEmptyRosterCount: true },
    )
  } else {
    openHostGenConfirm(t('control.genConfirmTitle'), t('control.genConfirmAll'), regenerateAllPlayers)
  }
}

function askRegenerateActiveCardsAll() {
  openHostGenConfirm(t('control.genConfirmTitle'), t('control.genConfirmActiveAll'), regenerateActiveCardsForAllPlayers)
}

function askRegenerateActiveCardOne() {
  openHostGenConfirm(
    t('control.genConfirmTitle'),
    t('control.genConfirmActiveOne', { slot: editorPlayerId.value }),
    regenerateActiveCardForCurrentSlot,
  )
}

function askGlobalRollField(fieldKey) {
  openHostGenConfirm(
    t('control.genConfirmTitle'),
    t('control.genConfirmGlobalField', { field: t(`traits.${fieldKey}`) }),
    () => globalRollField(fieldKey),
  )
}

function askGlobalChaos() {
  openHostGenConfirm(t('control.genConfirmTitle'), t('control.genConfirmChaos'), globalChaos)
}

function askGlobalRollSelected() {
  const fk = globalFieldPick.value
  openHostGenConfirm(
    t('control.genConfirmTitle'),
    t('control.genConfirmGlobalField', { field: t(`traits.${fk}`) }),
    globalRollSelected,
  )
}

async function confirmActiveCardEffect() {
  if (!isAdmin.value) return
  const eid = String(characterState.activeCard?.effectId || '')
  if (!eid) {
    showToast(t('toast.noEffectId'))
    return
  }
  try {
    loadError.value = null
    const res = await applyActiveCardEffect(
      gameId.value,
      editorPlayerId.value,
      eid,
      scenarioForRolls.value,
    )
    if (!res.ok) {
      showToast(res.message)
      return
    }
    const fresh = await fetchCharacter(gameId.value, editorPlayerId.value)
    syncing.value = true
    applyRemoteCharacterData(characterState, fresh)
    characterState.activeCard.used = true
    characterState.activeCardRequest = false
    syncing.value = false
    await saveCharacter(gameId.value, editorPlayerId.value, snapshotCharacter(characterState))
    showToast(res.message)
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function clearCardRequest() {
  if (!isAdmin.value) return
  characterState.activeCardRequest = false
  await saveCharacter(gameId.value, editorPlayerId.value, snapshotCharacter(characterState))
  showToast(t('toast.requestCancelled'))
}

async function requestCardFromHost() {
  if (isAdmin.value) return
  if (characterState.activeCard.used) return
  characterState.activeCardRequest = true
  try {
    loadError.value = null
    await saveCharacter(gameId.value, playerId.value, snapshotCharacter(characterState))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

let saveTimer = null
/** Не зберігати попередній слот при перемиканні редактора — інакше після deleteDoc merge знову створює документ у Firestore. */
const slotsToSkipPersistOnSwitch = new Set()

function controlQuery(overrides) {
  const base = { ...route.query, ...overrides }
  delete base.key
  delete base.role
  const gRaw = base.game
  if (gRaw == null || !String(gRaw).trim()) base.game = gameId.value
  else base.game = String(gRaw).trim()
  if (isAdmin.value) {
    base[HOST_PANEL_QUERY_KEY] = HOST_PANEL_QUERY_VALUE
  } else {
    delete base[HOST_PANEL_QUERY_KEY]
  }
  return base
}

function navigateQuery(overrides) {
  router.replace({
    path: '/control',
    query: controlQuery(overrides),
  })
}

/** Прибираємо `key` / `role=admin` з адресного рядка; залишаємо лише `host=1`. */
watch(
  () => [route.path, isAdmin.value, route.query.key, route.query.role],
  () => {
    if (route.path !== '/control' || !isAdmin.value) return
    const legacyKey = String(route.query.key ?? '').trim()
    const legacyRole = String(route.query.role ?? '').toLowerCase() === 'admin'
    if (!legacyKey && !legacyRole) return
    if (legacyKey === ADMIN_KEY) saveHostAccessSession(ADMIN_KEY)
    router.replace({ path: '/control', query: controlQuery({}) })
  },
  { flush: 'post' },
)

/** Підставляє `game` у URL з пам’яті, щоб F5 не скидав кімнату. */
watch(
  () => [route.path, String(route.query.game ?? ''), adminAccessDenied.value],
  () => {
    if (route.path !== '/control') return
    if (adminAccessDenied.value) return
    if (String(route.query.game ?? '').trim()) return
    router.replace({ path: '/control', query: controlQuery({}) })
  },
  { immediate: true, flush: 'post' },
)

function goToPlayer(id) {
  if (!isAdmin.value) return
  navigateQuery({ player: String(id).trim() || 'p1' })
  hostBlocksOpen.value.editor = true
  nextTick(() => {
    document.getElementById('host-editor-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function hostForgetSavedAndLeave() {
  clearHostAccessSession()
  router.push({ path: '/join', query: { game: gameId.value } })
}

/** URL збігається з вибраним слотом — після оновлення сторінки той самий гравець у редакторі. */
watch(
  () => String(selectedDeskPlayerId.value || '').trim(),
  (sel) => {
    if (!isAdmin.value || !sel) return
    const n = normalizePlayerSlotId(sel)
    if (n !== playerId.value) navigateQuery({ player: n })
  },
)

async function applyNewGame() {
  if (!isAdmin.value) return
  const g = String(draftGameId.value).trim() || 'test1'
  if (GAME_ID_UNSAFE.test(g)) {
    showToast(t('control.gameIdUnsafeToast'))
  }
  navigateQuery({ game: g })
  try {
    loadError.value = null
    const created = await ensureGameRoomExists(g)
    await saveGameRoom(g, { activeScenario: selectedScenario.value })
    // Не викликати seed при кожному OK — інакше знову з’являються видалені слоти p1–p10.
    if (created) {
      await seedMissingStandardPlayers(g, selectedScenario.value)
      showToast(t('toast.rosterSeeded'))
    } else {
      showToast(t('toast.gameRoomUpdated'))
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

async function createAndGoToPlayer() {
  if (!isAdmin.value) return
  const raw = String(newPlayerId.value ?? '').trim() || suggestedNextPlayerId.value
  if (!raw) return
  const id = normalizePlayerSlotId(raw)
  newPlayerId.value = ''
  const ag = { ...antiGhostPlayerUntil.value }
  delete ag[id]
  antiGhostPlayerUntil.value = ag
  try {
    loadError.value = null
    await ensureGameRoomExists(gameId.value)
    await ensurePlayerCharacterExists(gameId.value, id, selectedScenario.value)
    selectedDeskPlayerId.value = id
    navigateQuery({ player: id })
    showToast(t('toast.playerAdded', { slot: id }))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      loadError.value = null
      await saveCharacter(gameId.value, editorPlayerId.value, snapshotCharacter(characterState))
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e)
    }
  }, 400)
}

function applyFromFirestoreSnapshot(data) {
  skipRemoteAutosave.value = true
  syncing.value = true
  try {
    if (data != null) applyRemoteCharacterData(characterState, data)
    else applyRemoteCharacterData(characterState, null)
  } finally {
    syncing.value = false
    nextTick(() => {
      reconcilePlayerRevealLedgerCount()
      skipRemoteAutosave.value = false
    })
  }
}

/** Поля службові Firestore — не передаємо в редактор персонажа. */
watch(characterState, () => {
  if (
    syncing.value ||
    skipRemoteAutosave.value ||
    adminAccessDenied.value ||
    playerSlotAccessBlocked.value
  )
    return
  scheduleSave()
}, { deep: true })

watch(
  [gameId, editorPlayerId, adminAccessDenied],
  async ([gid, pid, denied], oldTuple) => {
    clearTimeout(saveTimer)
    saveTimer = null

    if (unsubCharacter) {
      unsubCharacter()
      unsubCharacter = null
    }
    panelHydrating.value = false

    if (denied) return
    if (!gid || !pid) return

    if (oldTuple && !oldTuple[2]) {
      const [og, op] = oldTuple
      if (op && (og !== gid || op !== pid)) {
        const prevSlot = normalizePlayerSlotId(op)
        if (slotsToSkipPersistOnSwitch.has(prevSlot)) {
          slotsToSkipPersistOnSwitch.delete(prevSlot)
        } else {
          try {
            await saveCharacter(og, op, snapshotCharacter(characterState))
          } catch (e) {
            console.warn('[control] save before switching editor slot', e)
          }
        }
      }
    }

    loadError.value = null
    panelHydrating.value = true
    if (!isAdmin.value) {
      playerJoinGateReady.value = false
      playerDocJoinToken.value = ''
    }
    unsubCharacter = subscribeToCharacter(gid, pid, (data) => {
      if (!isAdmin.value) {
        playerDocJoinToken.value =
          data && typeof data.joinToken === 'string' ? String(data.joinToken).trim() : ''
        playerJoinGateReady.value = true
      }
      applyFromFirestoreSnapshot(data)
      panelHydrating.value = false
    })
  },
  { immediate: true },
)

watch(
  () => ({
    adm: isAdmin.value,
    gid: gameId.value,
    pid: playerId.value,
    routeTok: String(route.query.token ?? '').trim(),
    docTok: playerDocJoinToken.value,
    ready: playerJoinGateReady.value,
  }),
  (o) => {
    if (o.adm || !o.ready || !o.docTok) return
    const sess = getJoinSessionToken(o.gid, o.pid)
    if (!sess || sess !== o.docTok) return
    if (o.routeTok === sess) return
    router.replace({ path: '/control', query: { ...route.query, token: sess } })
  },
  { flush: 'post' },
)

watch(
  [gotGameRoomSnap, gotPlayersSnap, panelHydrating, isAdmin, adminAccessDenied],
  () => {
    if (adminAccessDenied.value) {
      bootstrappedControl.value = true
      return
    }
    if (!gotGameRoomSnap.value) return
    if (isAdmin.value && !gotPlayersSnap.value) return
    if (panelHydrating.value) return
    bootstrappedControl.value = true
  },
  { flush: 'post' },
)

const showControlPageLoader = computed(
  () => !adminAccessDenied.value && !bootstrappedControl.value,
)

onUnmounted(() => {
  clearHostControlChrome()
  clearTimeout(saveTimer)
  clearTimeout(toastTimer)
  cleanupSubs()
  if (typeof window !== 'undefined') {
    window.removeEventListener(EAT_FIRST_ONBOARDING_EXPAND, onEatFirstOnboardingExpand)
  }
  if (tickTimer != null) {
    window.clearInterval(tickTimer)
    tickTimer = null
  }
})

const playerRevealLocked = computed(
  () => !isAdmin.value && Boolean(characterState.eliminated),
)

const HOST_BLOCKS_KEY = 'eat-first:host-blocks-v1'
function defaultHostBlocksOpen() {
  return {
    live: true,
    sessionStats: true,
    activeCard: true,
    players: true,
    gen: true,
    editor: true,
  }
}
function readHostBlocksOpen() {
  if (typeof sessionStorage === 'undefined') return defaultHostBlocksOpen()
  try {
    const raw = sessionStorage.getItem(HOST_BLOCKS_KEY)
    if (!raw) return defaultHostBlocksOpen()
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return defaultHostBlocksOpen()
    return { ...defaultHostBlocksOpen(), ...o }
  } catch {
    return defaultHostBlocksOpen()
  }
}
const hostBlocksOpen = ref(readHostBlocksOpen())
watch(
  hostBlocksOpen,
  (v) => {
    try {
      sessionStorage.setItem(HOST_BLOCKS_KEY, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  },
  { deep: true },
)
function hostCollapseAllBlocks() {
  const o = hostBlocksOpen.value
  o.live = false
  o.sessionStats = false
  o.activeCard = false
  o.players = false
  o.gen = false
  o.editor = false
}
function hostExpandAllBlocks() {
  const o = hostBlocksOpen.value
  o.live = true
  o.sessionStats = true
  o.activeCard = true
  o.players = true
  o.gen = true
  o.editor = true
}

const EAT_FIRST_ONBOARDING_EXPAND = 'eat-first-onboarding-expand'

function onEatFirstOnboardingExpand(ev) {
  if (!isAdmin.value) return
  const b = ev?.detail?.hostBlock
  if (b == null || typeof b !== 'string') return
  const o = hostBlocksOpen.value
  const key = b.trim()
  if (key === 'live') o.live = true
  else if (key === 'sessionStats') o.sessionStats = true
  else if (key === 'activeCard') o.activeCard = true
  else if (key === 'players') o.players = true
  else if (key === 'gen') o.gen = true
  else if (key === 'editor') o.editor = true
}

onMounted(() => {
  if (typeof window === 'undefined') return
  window.addEventListener(EAT_FIRST_ONBOARDING_EXPAND, onEatFirstOnboardingExpand)
})

const activeCardPanelKey = computed(
  () =>
    `${characterState.activeCard.used ? 'u' : 'a'}-${characterState.activeCardRequest ? 'r' : 'n'}-${String(characterState.activeCard.title ?? '').slice(0, 24)}`,
)

function rerollActiveCardOnly() {
  if (!isAdmin.value) return
  const ex = activeTemplateExcludeSetFromPlayers(allPlayers.value, editorPlayerId.value)
  const t = pickRandomActiveCardTemplateAvoiding(ex)
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
    <h1 class="denied-title">{{ t('control.accessDenied') }}</h1>
    <p class="denied-text">{{ t('control.deniedBefore') }}<code>key</code>{{ t('control.deniedAfter') }}</p>
  </div>

  <div v-else-if="playerSlotAccessBlocked" class="access-denied">
    <h1 class="denied-title">{{ t('control.slotAccessTitle') }}</h1>
    <p class="denied-text">{{ t('control.slotAccessHint') }}</p>
    <router-link class="denied-back" :to="{ path: '/join', query: { game: gameId } }">
      {{ t('control.slotAccessCta') }}
    </router-link>
  </div>

  <div v-else class="desk">
    <AppPageLoader
      :visible="showControlPageLoader"
      :label="t('loader.control')"
    />
    <p v-if="loadError" class="error error--alert" role="alert">{{ loadError }}</p>

    <div
      class="mode-strip"
      :class="{ admin: isAdmin, player: !isAdmin }"
      :data-onb="isAdmin ? 'control-host-strip' : undefined"
    >
      <span class="mode-label">{{ modeLabel }}</span>
      <span v-if="!isAdmin" class="status-pill" :data-s="myStatusLabel">{{ myStatusLabel }}</span>
      <div v-if="isAdmin" class="host-mode-actions">
        <button type="button" class="host-strip-btn" @click="hostCollapseAllBlocks">
          {{ t('control.hostCollapseAll') }}
        </button>
        <button type="button" class="host-strip-btn" @click="hostExpandAllBlocks">
          {{ t('control.hostExpandAll') }}
        </button>
        <button type="button" class="host-forget-btn" @click="hostForgetSavedAndLeave">
          {{ t('control.hostForgetKey') }}
        </button>
      </div>
    </div>

    <template v-if="isAdmin">
      <section
        class="admin-zone admin-zone--live admin-card admin-zone--live-priority"
        :aria-label="t('control.ariaLive')"
        data-onb="control-host-live"
      >
        <button
          type="button"
          class="host-block-fold"
          :aria-expanded="hostBlocksOpen.live"
          @click="hostBlocksOpen.live = !hostBlocksOpen.live"
        >
          <span
            class="host-block-fold__chev"
            :class="{ 'host-block-fold__chev--open': hostBlocksOpen.live }"
            aria-hidden="true"
          >▶</span>
          <span class="host-block-fold__label">{{ t('control.hostBlockLive') }}</span>
        </button>
        <div class="host-fold-anim" :class="{ 'host-fold-anim--open': hostBlocksOpen.live }">
          <div class="host-fold-anim__inner">
            <div class="host-block-fold__body">
          <ShowDeskHeader
            class="admin-zone__header"
            :game-title="t('game.title')"
            :game-id="gameId"
            :game-phase="String(gameRoom.gamePhase || 'intro')"
            :scenario-label="t(`scenarios.${selectedScenario}.label`)"
            :alive-count="aliveCount"
            :personal-url="personalUrlAbsolute"
            :global-url="globalUrlAbsolute"
            @copy-personal="copyPersonal"
            @copy-global="copyGlobal"
          />
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="isAdmin"
        class="admin-zone admin-zone--host-session admin-card"
        :aria-label="t('control.hostSessionTitle')"
      >
        <button
          type="button"
          class="host-block-fold"
          :aria-expanded="hostBlocksOpen.sessionStats"
          @click="hostBlocksOpen.sessionStats = !hostBlocksOpen.sessionStats"
        >
          <span
            class="host-block-fold__chev"
            :class="{ 'host-block-fold__chev--open': hostBlocksOpen.sessionStats }"
            aria-hidden="true"
          >▶</span>
          <span class="host-block-fold__label zone-kicker zone-kicker--fold">{{ t('control.hostSessionTitle') }}</span>
        </button>
        <div class="host-fold-anim" :class="{ 'host-fold-anim--open': hostBlocksOpen.sessionStats }">
          <div class="host-fold-anim__inner">
            <div class="host-block-fold__body">
              <div class="host-session-stats host-session-stats--standalone">
                <div class="host-session-stats__inner">
                  <section class="host-session-stats__block" :aria-label="t('control.hostSessionHands')">
                    <h4 class="host-session-stats__h">{{ t('control.hostSessionHands') }}</h4>
                    <p class="host-session-stats__hint">{{ t('control.hostSessionHandsHint') }}</p>
                    <ul class="host-session-hands">
                      <li v-for="row in hostHandRaiseRows" :key="row.id" class="host-session-hands__li">
                        <span class="host-session-hands__id">{{ row.id }}</span>
                        <span class="host-session-hands__n">✋ × {{ row.n }}</span>
                      </li>
                    </ul>
                  </section>
                  <section class="host-session-stats__block" :aria-label="t('control.hostSessionVotes')">
                    <h4 class="host-session-stats__h">{{ t('control.hostSessionVotes') }}</h4>
                    <p v-if="!(hostSessionStats.voteSessions && hostSessionStats.voteSessions.length)" class="host-session-muted">
                      {{ t('control.hostSessionVotesEmpty') }}
                    </p>
                    <div
                      v-for="sess in hostSessionStats.voteSessions"
                      :key="sess.id"
                      class="host-session-vote-card"
                    >
                      <div class="host-session-vote-card__head">
                        <span class="host-session-vote-card__meta"
                          >R{{ sess.round }} · {{ t('control.hostSessionTarget') }} {{ sess.target || '—' }}</span
                        >
                        <span class="host-session-vote-card__tally"
                          >👍 {{ hostSessionVoteTally(sess).forC }} · 👎 {{ hostSessionVoteTally(sess).ag
                          }}<template v-if="sess.syntheticEmptyRun && (sess.slotCount || 1) > 1">
                            · {{ t('control.ballotSummaryMergedSlots', { n: sess.slotCount || 1 }) }}</template
                          >
                          · {{ hostSessionEndedLabel(sess.endedAt) }}</span
                        >
                      </div>
                      <ul v-if="sess.votes && sess.votes.length" class="host-session-vote-card__ul">
                        <li v-for="(v, idx) in sess.votes" :key="sess.id + '-' + idx + '-' + v.voter" class="host-session-vote-card__li">
                          <span class="host-session-vote-card__voter">{{ v.voter }}</span>
                          <span class="host-session-vote-card__arrow">→</span>
                          <span class="host-session-vote-card__tgt">{{ sess.target || '—' }}</span>
                          <span class="host-session-vote-card__ch">{{ v.choice === 'against' ? '👎' : '👍' }}</span>
                        </li>
                      </ul>
                      <p v-else class="host-session-muted host-session-muted--tight">{{ t('control.hostSessionNoBallots') }}</p>
                    </div>
                  </section>
                  <button type="button" class="btn-soft host-session-clear" @click="hostClearSessionStatsOnly">
                    {{ t('control.hostSessionClear') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="isAdmin"
        class="admin-zone admin-zone--players admin-zone--host-active-card"
        :aria-label="t('control.ariaActiveCard')"
      >
        <button
          type="button"
          class="host-block-fold"
          :aria-expanded="hostBlocksOpen.activeCard"
          @click="hostBlocksOpen.activeCard = !hostBlocksOpen.activeCard"
        >
          <span
            class="host-block-fold__chev"
            :class="{ 'host-block-fold__chev--open': hostBlocksOpen.activeCard }"
            aria-hidden="true"
          >▶</span>
          <span class="host-block-fold__label zone-kicker zone-kicker--fold">{{ t('control.activeCard') }} · {{ editorPlayerId }}</span>
        </button>
        <div class="host-fold-anim" :class="{ 'host-fold-anim--open': hostBlocksOpen.activeCard }">
          <div class="host-fold-anim__inner">
            <div class="host-block-fold__body">
        <div class="active-card-box active-card-box--host-standalone">
          <div v-if="characterState.activeCardRequest" class="card-request-host">
            <p class="card-request-host__text">{{ t('control.cardRequestHost') }}</p>
            <button
              type="button"
              class="btn-confirm-card"
              :disabled="characterState.activeCard.used"
              @click="confirmActiveCardEffect"
            >
              {{ t('control.confirmCard') }}
            </button>
          </div>
          <label class="field-label" for="host-standalone-ac-title">{{ t('control.acFieldTitle') }}</label>
          <input
            id="host-standalone-ac-title"
            v-model="characterState.activeCard.title"
            type="text"
            class="input"
            :placeholder="t('control.titlePh')"
            autocomplete="off"
          />
          <label class="field-label" for="host-standalone-ac-desc">{{ t('control.acFieldDesc') }}</label>
          <textarea
            id="host-standalone-ac-desc"
            v-model="characterState.activeCard.description"
            class="textarea"
            rows="3"
            :placeholder="t('control.descPh')"
            autocomplete="off"
          />
          <p class="ac-meta">effectId: <code>{{ characterState.activeCard.effectId || '—' }}</code></p>
          <div class="ac-actions">
            <button type="button" class="btn-soft" @click="rerollActiveCardOnly">{{ t('control.newCardRandom') }}</button>
            <button
              v-if="characterState.activeCardRequest"
              type="button"
              class="btn-soft"
              @click="clearCardRequest"
            >
              {{ t('control.clearPlayerRequest') }}
            </button>
            <button
              v-if="!characterState.activeCardRequest"
              type="button"
              class="btn-primary btn-primary--solid"
              :disabled="characterState.activeCard.used"
              @click="confirmActiveCardEffect"
            >
              {{ t('control.applyEffect') }}
            </button>
          </div>
        </div>
            </div>
          </div>
        </div>
      </section>

      <section
        class="admin-zone admin-zone--players"
        :class="{ 'admin-zone--nominated-active': nominatedPlayerActive }"
        :aria-label="t('control.ariaPlayers')"
        data-onb="control-host-roster"
      >
        <button
          type="button"
          class="host-block-fold"
          :aria-expanded="hostBlocksOpen.players"
          @click="hostBlocksOpen.players = !hostBlocksOpen.players"
        >
          <span
            class="host-block-fold__chev"
            :class="{ 'host-block-fold__chev--open': hostBlocksOpen.players }"
            aria-hidden="true"
          >▶</span>
          <span class="host-block-fold__label zone-kicker zone-kicker--fold">{{ t('control.zonePlayers') }}</span>
        </button>
        <div class="host-fold-anim" :class="{ 'host-fold-anim--open': hostBlocksOpen.players }">
          <div class="host-fold-anim__inner">
            <div class="host-block-fold__body">
        <ShowPlayersRoster
          v-model:selected-player-id="selectedDeskPlayerId"
          :players="allPlayers"
          :hands-map="gameRoom.hands || {}"
          :players-ready-map="gameRoom.playersReady || {}"
          :current-player-id="editorPlayerId"
          :spotlight-player-id="String(gameRoom.activePlayer || '')"
          :speaker-id="String(gameRoom.currentSpeaker || '')"
          :voting-target-id="String(gameRoom.voting?.targetPlayer || '')"
          :voting-active="Boolean(gameRoom.voting?.active)"
          :nominations="nominationsList"
          :player-slots="PLAYER_SLOTS"
          :bulk-selected-ids="bulkSelectedSlots"
          :order-hint="rosterOrderHint"
          :voted-player-ids-this-round="votesLiveRoundVoterIds"
          :prioritize-non-voter-hands="isLastNominationBallotSlot"
          :use-host-panel="true"
          @open-editor="goToPlayer"
          @host-command="onRosterHostCommand"
          @toggle-nomination="hostToggleNomination"
          @toggle-bulk="onToggleBulkSelection"
          @bulk-delete-request="askBulkDeletePlayers"
          @bulk-clear="clearBulkSelection"
          @apply-ballot-order="hostApplyBallotFromNominations"
        />
        <div class="host-nom-rule-wrap">
          <label class="host-nom-rule ui-checkbox ui-checkbox--text ui-checkbox--lg">
            <span class="ui-checkbox__hit">
              <input
                type="checkbox"
                :checked="Boolean(gameRoom.nominationOneTargetPerRound)"
                @change="persistNominationOnePerRound($event.target.checked)"
              />
              <span class="ui-checkbox__box" aria-hidden="true" />
            </span>
            <span>{{ t('control.nominationOnePerRound') }}</span>
          </label>
        </div>
        <aside class="side-tools side-tools--inline">
          <label class="field-label" for="host-side-game-id">{{ t('control.gameId') }}</label>
          <div class="inline">
            <input id="host-side-game-id" v-model="draftGameId" type="text" class="input" autocomplete="off" />
            <button type="button" class="btn-soft btn-lift" @click="applyNewGame">OK</button>
          </div>
          <p v-if="gameIdHasUnsafeChars" class="hint-sc hint-sc--tight hint-sc--warn">
            {{ t('control.gameIdUnsafeHint') }}
          </p>
          <label class="field-label mt" for="host-side-new-player-id">{{ t('control.newPlayerId') }}</label>
          <div class="inline">
            <input
              id="host-side-new-player-id"
              v-model="newPlayerId"
              type="text"
              class="input"
              :placeholder="suggestedNextPlayerId"
              autocomplete="off"
            />
            <button type="button" class="btn-soft btn-lift" @click="createAndGoToPlayer">+</button>
          </div>
        </aside>
            </div>
          </div>
        </div>
      </section>

      <section
        class="admin-zone admin-zone--generate admin-zone--tier-lower"
        :aria-label="t('control.ariaGen')"
        data-onb="control-host-gen"
      >
        <button
          type="button"
          class="host-block-fold host-block-fold--soft"
          :aria-expanded="hostBlocksOpen.gen"
          @click="hostBlocksOpen.gen = !hostBlocksOpen.gen"
        >
          <span
            class="host-block-fold__chev"
            :class="{ 'host-block-fold__chev--open': hostBlocksOpen.gen }"
            aria-hidden="true"
          >▶</span>
          <span class="host-block-fold__label zone-kicker zone-kicker--soft zone-kicker--gen-title zone-kicker--fold">{{
            t('control.zoneGen')
          }}</span>
        </button>
        <div class="host-fold-anim" :class="{ 'host-fold-anim--open': hostBlocksOpen.gen }">
          <div class="host-fold-anim__inner">
            <div class="host-block-fold__body">
        <div class="gen-bar gen-bar--actions gen-bar--compact">
          <button type="button" class="btn-neon btn-neon--compact" @click="askGenerateRandomCharacter">
            {{ t('control.genPlayer') }}
          </button>
          <button type="button" class="btn-neon btn-neon--wide btn-neon--compact" @click="askRegenerateAllPlayers">
            {{ t('control.genAll') }}
          </button>
          <button
            type="button"
            class="btn-neon btn-neon--soft btn-neon--compact"
            @click="askRegenerateActiveCardOne"
          >
            {{ t('control.genActiveOne') }}
          </button>
          <button
            type="button"
            class="btn-neon btn-neon--soft btn-neon--compact"
            @click="askRegenerateActiveCardsAll"
          >
            {{ t('control.genActiveAll') }}
          </button>
        </div>
        <p class="hint-sc hint-sc--tight hint-sc--muted">{{ t(`scenarios.${selectedScenario}.hint`) }}</p>
        <div class="scenario-row">
          <label class="field-label field-label--inline">{{ t('control.scenario') }}</label>
          <UiMenuSelect
            v-model="selectedScenario"
            class="control-menu-select"
            :options="scenarioMenuOptions"
            :aria-label="t('control.scenario')"
            variant="block"
            @change="persistScenarioChoice"
          />
        </div>
        <h3 class="sub-kicker sub-kicker--soft">{{ t('control.globalAll') }}</h3>
        <div class="global-btns global-btns--compact">
          <button type="button" class="gbtn" @click="askGlobalRollField('profession')">{{ t('traits.profession') }}</button>
          <button type="button" class="gbtn" @click="askGlobalRollField('health')">{{ t('traits.health') }}</button>
          <button type="button" class="gbtn" @click="askGlobalRollField('phobia')">{{ t('traits.phobia') }}</button>
          <button type="button" class="gbtn" @click="askGlobalChaos">{{ t('control.chaos') }}</button>
        </div>
        <div class="pick-row pick-row--compact">
          <label class="field-label">{{ t('control.fieldForAll') }}</label>
          <UiMenuSelect
            v-model="globalFieldPick"
            class="control-menu-select"
            :options="fieldMenuOptions"
            :aria-label="t('control.fieldForAll')"
            variant="block"
          />
          <button type="button" class="btn-primary btn-primary--compact" @click="askGlobalRollSelected">OK</button>
        </div>
            </div>
          </div>
        </div>
      </section>

      <ConfirmDialog
        v-model:open="genDialogOpen"
        :title="genDialogTitle"
        :message="genDialogMessage"
        :confirm-label="t('control.genConfirmProceed')"
        :cancel-label="t('control.genConfirmCancel')"
        @close="onHostGenDialogClose"
        @confirm="onHostGenDialogConfirm"
      >
        <template v-if="genDialogShowCountInput" #extra>
          <label class="field-label" for="gen-empty-count">{{ t('control.genEmptyCountLabel') }}</label>
          <input
            id="gen-empty-count"
            v-model.number="genEmptyRosterCount"
            type="number"
            min="1"
            max="10"
            class="input"
            style="width: 100%; margin-top: 0.35rem"
          />
        </template>
      </ConfirmDialog>
    </template>

    <div v-else class="player-hero">
      <h1 class="player-title">{{ t('game.title') }}</h1>
      <p class="player-phase">{{ t('control.playerPhase', { phase: playerPhaseDisplay }) }}</p>
      <div
        v-if="characterState.eliminated !== true"
        class="player-hero-actions"
        role="group"
        :aria-label="t('control.playerQuickActionsAria')"
        data-onb="control-player-actions"
      >
        <div class="hand-toggle" role="group" :aria-label="t('control.handGroup')">
          <button
            type="button"
            class="hand-icon-btn"
            :class="{ 'hand-icon-btn--up': myHandRaised }"
            :aria-pressed="myHandRaised"
            :aria-label="myHandRaised ? t('control.handLower') : t('control.handRaise')"
            :title="myHandRaised ? t('control.handLowerTitle') : t('control.handRaiseTitle')"
            @click="setMyHandRaised(!myHandRaised)"
          >
            <span class="hand-icon-btn__ico" aria-hidden="true">✋</span>
          </button>
          <span class="hand-toggle__caption">{{ myHandRaised ? t('control.handUp') : t('control.handDown') }}</span>
        </div>
        <div class="ready-toggle" role="group" :aria-label="t('control.readyGroup')">
          <button
            type="button"
            class="ready-pill"
            :class="{ 'ready-pill--on': myPlayerReady, 'ready-pill--off': !myPlayerReady }"
            :aria-pressed="myPlayerReady"
            :aria-label="playerReadyPillLabel"
            :title="playerReadyPillLabel"
            @click="setMyPlayerReady(!myPlayerReady)"
          >
            {{ playerReadyPillLabel }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showPlayerVotingUi" class="player-vote-panel">
      <p class="player-vote-panel__k">{{ t('control.votingTitle') }}</p>
      <p class="player-vote-panel__line">{{ t('control.voteAgainst', { name: playerVoteSlotLabel }) }}</p>
      <p v-if="playerIsVotingTarget" class="player-vote-panel__warn">{{ t('control.youAreVoted') }}</p>
      <p v-if="playerHasVotedThisRound" class="player-vote-panel__done">{{ t('control.youVotedAlready') }}</p>
      <div v-else class="player-vote-panel__row">
        <button
          type="button"
          class="player-vote-btn player-vote-btn--for"
          :disabled="playerVoteBusy"
          @click="submitPlayerVote('for')"
        >
          {{ t('control.voteFor') }}
        </button>
        <button
          type="button"
          class="player-vote-btn player-vote-btn--against"
          :disabled="playerVoteBusy"
          @click="submitPlayerVote('against')"
        >
          {{ t('control.voteAgainstBtn') }}
        </button>
      </div>
    </div>

    <section
      id="host-editor-panel"
      class="panel editor-panel editor-panel--calm"
      :class="{ 'editor-panel--hydrating': panelHydrating }"
    >
      <div v-if="panelHydrating" class="panel-hydrate-overlay" aria-busy="true" :aria-label="t('control.panelLoadingAria')">
        <span class="panel-hydrate-spinner" />
        <span class="panel-hydrate-label">{{ t('loader.panelCard') }}</span>
      </div>
      <div class="editor-panel__head">
        <button
          v-if="isAdmin"
          type="button"
          class="host-block-fold host-block-fold--editor"
          :aria-expanded="hostBlocksOpen.editor"
          :aria-label="hostBlocksOpen.editor ? t('control.hostSectionCollapse') : t('control.hostSectionExpand')"
          @click="hostBlocksOpen.editor = !hostBlocksOpen.editor"
        >
          <span
            class="host-block-fold__chev"
            :class="{ 'host-block-fold__chev--open': hostBlocksOpen.editor }"
            aria-hidden="true"
          >▶</span>
          <h2 class="panel-kicker host-block-fold__label">{{ t('control.editorTitle', { id: editorPlayerId }) }}</h2>
        </button>
        <h2 v-else class="panel-kicker">{{ t('control.yourChar') }}</h2>
      </div>

      <div
        class="host-fold-anim host-fold-anim--editor"
        :class="{ 'host-fold-anim--open': !isAdmin || hostBlocksOpen.editor }"
      >
        <div class="host-fold-anim__inner">
          <div class="editor-panel__collapsible">
      <div v-if="isAdmin" class="trait-block trait-block--identity">
        <div class="trait-toolbar">
          <span class="trait-label">{{ t('control.profileOverlay') }}</span>
          <div class="trait-actions">
            <button type="button" class="icon-btn icon-btn--reroll" :title="t('control.reroll')" @click="rerollIdentity">
              🎲
            </button>
            <button
              type="button"
              class="reveal-toggle"
              :title="t('control.demographicsOnOverlay')"
              :class="{ 'reveal-toggle--open': characterState.demographicsRevealed }"
              @click="revealDemographics(!characterState.demographicsRevealed)"
            >
              {{ characterState.demographicsRevealed ? t('control.open') : t('control.closed') }}
            </button>
          </div>
        </div>
        <div class="meta-grid">
          <div>
            <label class="field-label" for="host-editor-char-name">{{ t('control.name') }}</label>
            <input id="host-editor-char-name" v-model="characterState.name" type="text" class="input" autocomplete="name" />
          </div>
          <div>
            <label class="field-label" for="host-editor-char-age">{{ t('control.age') }}</label>
            <input id="host-editor-char-age" v-model="characterState.age" type="text" class="input" inputmode="numeric" />
          </div>
          <div>
            <label class="field-label" for="host-editor-char-gender">{{ t('control.gender') }}</label>
            <input
              id="host-editor-char-gender"
              v-model="characterState.gender"
              type="text"
              class="input"
              :placeholder="t('control.genderPh')"
              autocomplete="sex"
            />
          </div>
        </div>
      </div>

      <div v-else class="player-char-grid" data-onb="control-player-card">
        <div class="trait-block trait-block--player trait-block--identity player-char-grid__identity">
          <div class="trait-toolbar">
            <span class="trait-label">{{ t('control.profile') }}</span>
            <button
              v-if="!playerRevealLocked"
              type="button"
              class="reveal-toggle reveal-toggle--player"
              :title="t('control.demographicsOnOverlay')"
              :class="{ 'reveal-toggle--open': characterState.demographicsRevealed }"
              @click="revealDemographics(!characterState.demographicsRevealed)"
            >
              {{ characterState.demographicsRevealed ? t('control.open') : t('control.closed') }}
            </button>
          </div>
          <div class="identity-reveal-block">
            <p class="pv-line"><span class="mk">{{ t('control.name') }}</span> {{ characterState.name || '—' }}</p>
            <p class="pv-line">
              <span class="mk">{{ t('control.ageGender') }}</span> {{ characterState.age || '—' }} ·
              {{ formatGenderDisplay(characterState.gender) }}
            </p>
            <p class="pv-hint">{{ t('control.playerPanelRevealHint') }}</p>
          </div>
        </div>

        <div class="player-char-grid__traits player-traits-cols">
          <div class="player-traits-col" :aria-label="t('control.ariaTraitsL')">
            <div v-for="row in PLAYER_TRAIT_COL_LEFT" :key="row.key" class="trait-block trait-block--player">
              <div class="trait-toolbar">
                <span class="trait-label">{{ t(`traits.${row.key}`) }}</span>
                <button
                  v-if="!playerRevealLocked"
                  type="button"
                  class="reveal-toggle reveal-toggle--player"
                  :class="{ 'reveal-toggle--open': characterState[row.key].revealed }"
                  @click="revealTrait(row.key, !characterState[row.key].revealed)"
                >
                  {{ characterState[row.key].revealed ? t('control.open') : t('control.closed') }}
                </button>
              </div>
              <p class="trait-value-preview trait-value-preview--on">
                {{ characterState[row.key].value || '—' }}
              </p>
            </div>
          </div>
          <div class="player-traits-col" :aria-label="t('control.ariaTraitsR')">
            <div v-for="row in PLAYER_TRAIT_COL_RIGHT" :key="row.key" class="trait-block trait-block--player">
              <div class="trait-toolbar">
                <span class="trait-label">{{ t(`traits.${row.key}`) }}</span>
                <button
                  v-if="!playerRevealLocked"
                  type="button"
                  class="reveal-toggle reveal-toggle--player"
                  :class="{ 'reveal-toggle--open': characterState[row.key].revealed }"
                  @click="revealTrait(row.key, !characterState[row.key].revealed)"
                >
                  {{ characterState[row.key].revealed ? t('control.open') : t('control.closed') }}
                </button>
              </div>
              <p class="trait-value-preview trait-value-preview--on">
                {{ characterState[row.key].value || '—' }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div v-if="isAdmin" class="traits-stack">
        <div v-for="row in fieldConfig" :key="row.key" class="trait-block">
          <div class="trait-toolbar">
            <label class="trait-label" :for="'host-editor-trait-' + row.key">{{ t(`traits.${row.key}`) }}</label>
            <div class="trait-actions">
              <button
                type="button"
                class="icon-btn icon-btn--reroll"
                :title="t('control.rerollField')"
                @click="rerollSingleTrait(row.key)"
              >
                🎲
              </button>
              <button
                type="button"
                class="reveal-toggle"
                :class="{ 'reveal-toggle--open': characterState[row.key].revealed }"
                @click="revealTrait(row.key, !characterState[row.key].revealed)"
              >
                {{ characterState[row.key].revealed ? t('control.open') : t('control.closed') }}
              </button>
            </div>
          </div>
          <input
            :id="'host-editor-trait-' + row.key"
            v-model="characterState[row.key].value"
            type="text"
            class="input trait-value-input"
          />
        </div>
      </div>

      <div v-if="!isAdmin" class="active-card-box" data-onb="control-player-active-card">
        <h3 class="ac-title">{{ t('control.activeCard') }}</h3>
        <Transition name="ac-swap" mode="out-in">
          <div :key="activeCardPanelKey" class="active-card-player-block">
            <p class="ac-t">{{ characterState.activeCard.title || '—' }}</p>
            <p class="ac-d">{{ characterState.activeCard.description || '—' }}</p>
            <p v-if="characterState.activeCard.used" class="ac-used">{{ t('control.used') }}</p>
            <p v-else-if="characterState.activeCardRequest" class="ac-pending">
              {{ t('control.awaitHost') }}
            </p>
            <button
              v-else
              type="button"
              class="btn-request"
              @click="requestCardFromHost"
            >
              Використати карту
            </button>
          </div>
        </Transition>
      </div>

          </div>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="ballotSummaryOpen"
        class="host-modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="t('control.ballotSummaryTitle')"
        @click.self="ballotSummaryOpen = false"
      >
        <div class="host-modal host-modal--wide">
          <h3 class="host-modal__title">{{ t('control.ballotSummaryTitle') }}</h3>
          <ul class="host-ballot-summary-list">
            <li v-for="s in ballotSummarySessions" :key="s.id" class="host-ballot-summary-li">
              <span class="host-ballot-summary-meta">
                R{{ s.round }} · {{ t('hostChrome.target') }} {{ s.target || '—' }} · 👍
                {{ hostSessionVoteTally(s).forC }} · 👎 {{ hostSessionVoteTally(s).ag
                }}<template v-if="s.syntheticEmptyRun && (s.slotCount || 1) > 1">
                  · {{ t('control.ballotSummaryMergedSlots', { n: s.slotCount || 1 }) }}</template
                >
              </span>
            </li>
          </ul>
          <button type="button" class="btn-primary host-modal__ok" @click="ballotSummaryOpen = false">
            OK
          </button>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="tieBreakOpen"
        class="host-modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="t('control.tieBreakTitle')"
        @click.self="tieBreakOpen = false"
      >
        <div class="host-modal host-modal--wide">
          <h3 class="host-modal__title">{{ t('control.tieBreakTitle') }}</h3>
          <p class="host-modal__p">
            {{ t('control.tieBreakBodyN', { list: (tieBreakSlots || []).join(', ') }) }}
          </p>
          <p class="host-modal__hint">{{ t('control.tieBreakHintN') }}</p>
          <p class="host-modal__micro">{{ t('control.tieBreakDurPick') }}</p>
          <div class="host-modal__chips">
            <button
              v-for="s in [5, 10, 15, 30, 60]"
              :key="'tie-dur-' + s"
              type="button"
              class="host-tie-dur-chip"
              @click="hostTieDefenseDuration(s)"
            >
              {{ s >= 60 ? `1 ${t('control.tieBreakMin')}` : `${s} s` }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    <Teleport to="body">
      <div
        v-if="elimSuggestOpen"
        class="host-modal-backdrop"
        role="dialog"
        aria-modal="true"
        :aria-label="t('control.elimSuggestTitle')"
        @click.self="hostDismissEliminateSuggested"
      >
        <div class="host-modal host-modal--wide">
          <h3 class="host-modal__title">{{ t('control.elimSuggestTitle') }}</h3>
          <p class="host-modal__p">
            {{
              t('control.elimSuggestBody', { slot: elimSuggestSlot || '—', votes: elimSuggestForVotes })
            }}
          </p>
          <p v-if="elimSuggestHandLines?.key === 'agree'" class="host-modal__hint">
            {{ t('control.elimSuggestHandsAgree') }}
          </p>
          <p v-else-if="elimSuggestHandLines?.key === 'top'" class="host-modal__hint">
            {{ t('control.elimSuggestHandsTop', { list: elimSuggestHandLines.list }) }}
          </p>
          <div class="host-modal__row host-modal__row--stack">
            <button type="button" class="btn-primary" @click="hostConfirmEliminateSuggested">
              {{ t('control.elimSuggestConfirm') }}
            </button>
            <button type="button" class="btn-soft" @click="hostDismissEliminateSuggested">
              {{ t('control.elimSuggestSkip') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.desk {
  width: 100%;
  max-width: min(1200px, 100%);
  margin: 0 auto;
  padding: 0 1.25rem 4rem;
  box-sizing: border-box;
  min-width: 0;
}

.admin-zone--live-priority.admin-card {
  border-color: var(--border-strong);
  box-shadow: 0 0 32px var(--accent-glow);
}

.host-block-fold {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  margin: 0;
  padding: 0.38rem 0.35rem;
  min-height: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--text-muted-soft);
  border-radius: 10px;
  box-sizing: border-box;
}

.host-block-fold:hover {
  color: var(--text-heading);
  background: var(--bg-muted);
}

.host-block-fold--soft {
  color: var(--text-muted);
}

.host-block-fold__chev {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  font-size: 0.58rem;
  line-height: 1;
  opacity: 0.9;
  transform: rotate(0deg);
  transform-origin: center center;
  transition: transform 0.45s cubic-bezier(0.32, 0.72, 0, 1);
  /* вирівнювання гліфа ▶ відносно шрифтового центру */
  margin-top: 0.06em;
}

.host-block-fold__chev--open {
  transform: rotate(90deg);
}

.host-block-fold__label {
  flex: 1;
  margin: 0;
  line-height: 1.25;
  display: flex;
  align-items: center;
}

.zone-kicker--fold {
  margin: 0;
  text-align: left;
  line-height: 1.25;
}

.host-block-fold__body {
  min-width: 0;
}

.host-fold-anim {
  display: grid;
  grid-template-rows: 0fr;
  margin-top: 0;
  transition: grid-template-rows 0.58s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.host-fold-anim--open {
  grid-template-rows: 1fr;
  /* лише для відкритого: відступ від смуги згортання; у закритому — margin-top: 0 на .host-fold-anim */
  margin-top: 0.5rem;
}

.host-fold-anim__inner {
  overflow: hidden;
  min-height: 0;
  opacity: 0;
  transform: translateY(-6px);
  transition:
    opacity 0.52s ease,
    transform 0.52s ease;
}

.host-fold-anim--open .host-fold-anim__inner {
  overflow: visible;
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .host-fold-anim {
    transition: none;
  }

  .host-fold-anim__inner {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .host-block-fold__chev {
    transition: none;
  }
}

/* як інші згортання: уся смуга клікабельна */
.host-block-fold--editor {
  color: var(--editor-trait-label, var(--text-muted-soft));
}

.host-block-fold--editor:hover {
  color: var(--text-heading);
}

.editor-panel--calm .host-block-fold--editor .panel-kicker {
  margin: 0;
  color: inherit;
}

.editor-panel__head {
  margin-bottom: 0;
}

.editor-panel__head > .panel-kicker {
  margin: 0;
}

.editor-panel__collapsible {
  min-width: 0;
}

.admin-zone {
  margin-bottom: 1.65rem;
}

.admin-card {
  border-radius: 16px;
  padding: 12px;
  background: var(--bg-card-solid);
  border: 1px solid var(--border);
  box-sizing: border-box;
  box-shadow: var(--panel-desk-shadow);
}

.admin-zone--players {
  border-radius: 16px;
  padding: clamp(0.75rem, 2vw, 1rem) 12px 12px;
  background: var(--bg-card-solid);
  border: 1px solid var(--border);
  box-sizing: border-box;
  box-shadow: var(--panel-desk-shadow);
}

.admin-zone--players :deep(.roster--embedded) {
  margin-bottom: 0;
}

.admin-zone--players :deep(.roster) {
  background: transparent;
  border: none;
  margin-bottom: 0;
  padding: 0.35rem 0 0;
}

.admin-zone--host-active-card .active-card-box--host-standalone {
  margin-top: 0.25rem;
}

.admin-zone--voting.admin-card :deep(.vp) {
  background: transparent;
  border: none;
  margin-bottom: 0;
}

.admin-zone--round.admin-card :deep(.rp) {
  background: transparent;
  border: none;
  margin-bottom: 0;
}

.admin-zone--live .admin-zone__header {
  margin-top: 0.35rem;
}

.zone-kicker--section {
  margin-bottom: 0.45rem;
  color: var(--text-muted);
}

.admin-zone--voting.admin-zone--glow {
  border-radius: 16px;
  padding: 0.15rem;
  border: 1px solid var(--border-cyan-strong);
  box-shadow: 0 0 28px var(--glow-vote);
  background: linear-gradient(
    135deg,
    var(--glow-vote-inner) 0%,
    var(--glow-vote-inner-2) 100%
  );
}

.admin-zone--round {
  margin-bottom: 1.25rem;
}

.admin-zone--nominated-active {
  border-radius: 16px;
  padding: 0.65rem 0.5rem 0.85rem;
  border: 1px solid var(--danger-border);
  box-shadow: 0 0 22px var(--danger-glow);
  background: var(--danger-bg);
}

.admin-zone--players.admin-zone--nominated-active {
  padding: 0.65rem 0.5rem 0.85rem;
}

.zone-kicker {
  margin: 0 0 0.55rem;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-muted-soft);
  font-family: 'Orbitron', sans-serif;
}

/* .zone-kicker нижче перебивав margin: 0 у --fold (лішнє місце знизу в смузі згортання) */
.zone-kicker.zone-kicker--fold {
  margin: 0;
}

.admin-zone--players > .zone-kicker {
  margin-bottom: 0.85rem;
}

.vote-log-details {
  margin-top: 0.75rem;
  padding: 0.5rem 0.65rem;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-muted);
  font-size: 0.68rem;
  line-height: 1.4;
  color: var(--text-secondary);
}

.vote-log-details__sum {
  cursor: pointer;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.vote-log-details__list {
  margin: 0.45rem 0 0;
  padding: 0 0 0 1rem;
  max-height: 7.5rem;
  overflow-y: auto;
}

.vote-log-details__li {
  margin: 0.2rem 0;
}

.host-session-stats {
  margin-top: 0.75rem;
  padding: 0.5rem 0.65rem 0.65rem;
  border-radius: 12px;
  border: 1px solid var(--border-cyan-strong, var(--border-subtle));
  background: color-mix(in srgb, var(--bg-muted) 88%, var(--bg-card-solid));
  font-size: 0.7rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.host-session-stats--standalone {
  margin-top: 0;
  padding: 0;
  border: none;
  background: transparent;
}

.host-session-stats--standalone .host-session-stats__inner {
  margin-top: 0;
}

.host-session-stats__sum {
  cursor: pointer;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.62rem;
  color: var(--text-cyan, var(--text-muted));
  list-style: none;
}

.host-session-stats__sum::-webkit-details-marker {
  display: none;
}

.host-session-stats__inner {
  margin-top: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.host-session-stats__block {
  min-width: 0;
}

.host-session-stats__h {
  margin: 0 0 0.35rem;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.host-session-stats__hint {
  margin: 0 0 0.45rem;
  font-size: 0.62rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.host-session-muted {
  margin: 0.25rem 0 0;
  font-size: 0.65rem;
  color: var(--text-muted);
  font-style: italic;
}

.host-session-muted--tight {
  margin: 0.2rem 0 0;
}

.host-session-hands {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.35rem 0.65rem;
}

.host-session-hands__li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.45rem;
  border-radius: 8px;
  background: var(--bg-card-solid);
  border: 1px solid var(--border-subtle);
  font-family: var(--font-display, monospace);
  font-size: 0.68rem;
}

.host-session-hands__n {
  font-weight: 800;
  color: var(--text-highlight, var(--text-heading));
}

.host-session-vote-card {
  margin-top: 0.5rem;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-card-solid);
}

.host-session-vote-card__head {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.host-session-vote-card__meta {
  font-weight: 700;
  color: var(--text-heading);
  font-size: 0.66rem;
}

.host-session-vote-card__tally {
  font-size: 0.6rem;
  color: var(--text-muted);
}

.host-session-vote-card__ul {
  margin: 0.45rem 0 0;
  padding: 0 0 0 1rem;
  font-size: 0.64rem;
}

.host-session-vote-card__li {
  margin: 0.15rem 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
}

.host-session-vote-card__voter {
  font-weight: 700;
  font-family: var(--font-display, monospace);
}

.host-session-vote-card__arrow {
  opacity: 0.45;
}

.host-session-vote-card__tgt {
  opacity: 0.85;
}

.host-session-vote-card__ch {
  margin-left: auto;
}

.host-session-clear {
  align-self: flex-start;
  font-size: 0.62rem;
}

.admin-zone--generate {
  padding: 0.85rem 1rem 1rem;
  border-radius: 14px;
  background: var(--bg-generate);
  border: 1px solid var(--border-subtle);
  margin-bottom: 1.2rem;
}

.admin-zone--tier-lower {
  opacity: 0.92;
  border-color: var(--border);
}

.zone-kicker--soft {
  color: var(--text-muted);
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
  color: var(--text-muted);
  font-size: 0.66rem;
  line-height: 1.45;
}

.hint-sc--warn {
  color: var(--error-text, #fecaca);
  border-left: 3px solid var(--error-border, rgba(248, 113, 113, 0.55));
  padding-left: 0.5rem;
  margin-top: 0.35rem;
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

.control-menu-select {
  flex: 1 1 12rem;
  min-width: 10rem;
  max-width: 22rem;
}

.sub-kicker--soft {
  margin: 0.55rem 0 0.35rem;
  color: var(--text-muted);
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
  color: var(--text-muted);
}

.sub-kicker {
  margin: 0.85rem 0 0.45rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
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

#host-editor-panel {
  scroll-margin-top: 5.5rem;
}

@media (max-width: 720px) {
  #host-editor-panel {
    scroll-margin-top: 4.5rem;
  }
}

.editor-panel {
  --editor-space: 0.7rem;
}

.editor-panel--calm {
  border-color: var(--border-editor-calm);
  background: var(--bg-editor-calm);
}

.editor-panel--calm .trait-label,
.editor-panel--calm .panel-kicker {
  color: var(--editor-trait-label);
}

.editor-panel--calm .trait-block,
.editor-panel--calm .trait-block--identity {
  border-color: var(--border-editor-calm);
}

.editor-panel--calm .trait-block--identity {
  background: transparent;
  border: none;
  padding-left: 0;
  padding-right: 0;
  padding-top: 0;
  border-radius: 0;
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-subtle);
}

.editor-panel--calm .trait-block--identity .field-label {
  margin-bottom: 0.45rem;
}

.editor-panel--hydrating {
  position: relative;
  pointer-events: none;
  opacity: 0.88;
}

.panel-hydrate-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  border-radius: inherit;
  background: color-mix(in srgb, var(--bg-editor-calm) 82%, transparent);
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.panel-hydrate-spinner {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  border: 3px solid color-mix(in srgb, var(--border-strong) 55%, transparent);
  border-top-color: var(--accent-fill);
  animation: panelSpin 0.72s linear infinite;
}

.panel-hydrate-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

@keyframes panelSpin {
  to {
    transform: rotate(360deg);
  }
}

.player-char-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  align-self: stretch;
  min-width: 0;
}

/* Дві колонки: без container queries (уникаємо хибного max-width у scoped / containment) */
.player-char-grid__traits.player-traits-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: clamp(0.65rem, 2vw, 1.15rem);
  row-gap: 0.5rem;
  align-items: start;
  width: 100%;
  min-width: 0;
}

.player-traits-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}

.player-traits-cols .trait-block--player {
  width: 100%;
  margin-bottom: 0;
}

@media (max-width: 540px) {
  .player-char-grid__traits.player-traits-cols {
    grid-template-columns: 1fr;
    column-gap: 0.5rem;
  }
}

.active-card-player-block {
  min-height: 2rem;
}

.ac-swap-enter-active {
  animation: acSwapIn 0.42s var(--motion-ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.ac-swap-leave-active {
  animation: acSwapOut 0.28s ease both;
}

@keyframes acSwapIn {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

@keyframes acSwapOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.96);
    filter: blur(3px);
  }
}

.editor-panel--calm .input:focus,
.editor-panel--calm .textarea:focus,
.editor-panel--calm .trait-value-input:focus,
.editor-panel--calm .select:focus {
  outline: none;
  border-color: var(--border-strong);
  box-shadow: 0 0 0 2px var(--focus-ring);
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
  padding: 0.75rem 0;
  margin-bottom: 0.85rem;
  border-bottom: 1px solid var(--border-subtle);
}

.mode-strip.admin {
  border-color: var(--border-panel);
}

.host-mode-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.host-strip-btn {
  padding: 0.32rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(196, 181, 253, 0.42);
  background: rgba(15, 23, 42, 0.45);
  color: var(--text-secondary);
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.host-strip-btn:hover {
  color: var(--text-title);
  border-color: rgba(196, 181, 253, 0.7);
  background: rgba(88, 28, 135, 0.22);
  box-shadow: 0 0 14px rgba(168, 85, 247, 0.18);
}

.host-forget-btn {
  margin-left: 0;
  padding: 0.32rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: var(--danger-bg);
  color: #fecaca;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.host-forget-btn:hover {
  color: #ffe4e6;
  border-color: rgba(248, 113, 113, 0.65);
  background: rgba(60, 22, 28, 0.45);
  box-shadow: 0 0 16px var(--danger-glow);
}

html[data-theme='light'] .host-strip-btn {
  background: rgba(255, 255, 255, 0.75);
  border-color: rgba(124, 58, 237, 0.35);
  color: rgba(30, 27, 46, 0.88);
  box-shadow: 0 1px 3px rgba(91, 33, 168, 0.08);
}

html[data-theme='light'] .host-strip-btn:hover {
  border-color: rgba(124, 58, 237, 0.55);
  background: rgba(243, 232, 255, 0.95);
}

html[data-theme='light'] .host-forget-btn {
  color: #b91c1c;
  border-color: rgba(220, 38, 38, 0.4);
  background: rgba(254, 226, 226, 0.85);
}

html[data-theme='light'] .host-forget-btn:hover {
  color: #991b1b;
  border-color: rgba(220, 38, 38, 0.55);
  background: rgba(254, 202, 202, 0.95);
}

.mode-label {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-heading);
}

.status-pill {
  font-size: 0.78rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: var(--accent-fill-soft);
  border: 1px solid var(--border-strong);
  color: var(--text-title);
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
  color: var(--text-title);
}

.player-phase {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.player-hero-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(1rem, 4vw, 2.25rem);
  margin-top: 1.1rem;
  flex-wrap: wrap;
}

.player-hero-actions .hand-toggle {
  margin-top: 0;
}

.hand-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.1rem;
  flex-wrap: wrap;
}

.ready-toggle {
  display: flex;
  align-items: center;
}

.ready-pill {
  margin: 0;
  padding: 0.55rem 1rem;
  border-radius: 999px;
  border: 2px solid rgba(248, 113, 113, 0.55);
  background: rgba(80, 20, 30, 0.42);
  color: rgba(254, 226, 226, 0.96);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.22s ease,
    color 0.2s ease;
  box-shadow:
    0 0 14px rgba(239, 68, 68, 0.28),
    0 0 28px rgba(239, 68, 68, 0.12);
}

.ready-pill--off:hover {
  border-color: rgba(252, 165, 165, 0.75);
  box-shadow:
    0 0 18px rgba(239, 68, 68, 0.38),
    0 0 36px rgba(239, 68, 68, 0.16);
}

.ready-pill--on {
  border-color: rgba(74, 222, 128, 0.72);
  background: rgba(20, 83, 45, 0.42);
  color: rgba(220, 252, 231, 0.98);
  box-shadow:
    0 0 16px rgba(74, 222, 128, 0.38),
    0 0 32px rgba(74, 222, 128, 0.14);
}

.ready-pill--on:hover {
  border-color: rgba(134, 239, 172, 0.88);
  box-shadow:
    0 0 20px rgba(74, 222, 128, 0.48),
    0 0 40px rgba(74, 222, 128, 0.2);
}

.hand-toggle__caption {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.hand-icon-btn {
  width: 3.35rem;
  height: 3.35rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 2px solid var(--btn-hand-border);
  background: var(--bg-muted-strong);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    border-color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.22s ease;
  -webkit-tap-highlight-color: transparent;
}

.hand-icon-btn__ico {
  font-size: 1.45rem;
  line-height: 1;
  filter: grayscale(0.35);
  opacity: 0.65;
  transition:
    filter 0.2s ease,
    opacity 0.2s ease,
    transform 0.2s ease;
}

.hand-icon-btn:hover {
  transform: scale(1.05);
  border-color: rgba(251, 191, 36, 0.45);
}

.hand-icon-btn:focus-visible {
  outline: 2px solid var(--border-strong);
  outline-offset: 3px;
}

.hand-icon-btn--up {
  border-color: var(--btn-hand-up-border);
  background: var(--btn-hand-up-bg);
  box-shadow: 0 0 20px rgba(251, 191, 36, 0.35);
}

.hand-icon-btn--up .hand-icon-btn__ico {
  filter: grayscale(0);
  opacity: 1;
  transform: scale(1.08);
}

.hand-icon-btn:active {
  transform: scale(0.96);
}

.player-vote-panel {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border-radius: 16px;
  border: 1px solid var(--border-cyan-strong);
  background: var(--bg-muted);
  box-shadow: 0 4px 20px var(--shadow-deep);
}

.player-vote-panel__k {
  margin: 0;
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  color: var(--text-cyan-strong);
  font-family: 'Orbitron', sans-serif;
}

.player-vote-panel__line {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  color: var(--text-body);
}

.player-vote-panel__warn {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--error-text);
}

.player-vote-panel__done {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.player-vote-panel__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.65rem;
}

.player-vote-btn {
  flex: 1 1 auto;
  min-width: 7rem;
  padding: 0.55rem 0.85rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 800;
  cursor: pointer;
  border: 2px solid transparent;
}

.player-vote-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.player-vote-btn--for {
  border-color: var(--reveal-on-border);
  background: var(--reveal-on-bg);
  color: var(--reveal-on-text);
}

.player-vote-btn--against {
  border-color: var(--reveal-off-border);
  background: var(--reveal-off-bg);
  color: var(--reveal-off-text);
}

.side-tools {
  padding: 1rem;
  border-radius: 16px;
  background: var(--bg-muted);
  border: 1px solid var(--border-subtle);
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
  color: var(--text-muted);
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
  border: 1px solid var(--border-input);
  background: var(--bg-input-soft);
  color: var(--text-body);
  font-size: 0.9rem;
}

.select {
  max-width: 280px;
}

.panel {
  padding: 1.35rem 1.45rem;
  margin-bottom: 1.75rem;
  border-radius: 20px;
  background: var(--bg-card-soft);
  border: 1px solid var(--border-panel);
  box-shadow: var(--panel-desk-shadow);
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.panel-kicker {
  margin: 0 0 1rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-heading);
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
  border: 1px solid var(--btn-neon-border);
  background: linear-gradient(180deg, var(--btn-neon-top), var(--btn-neon-bot));
  color: var(--text-title);
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
  box-shadow: 0 0 22px var(--accent-glow-strong);
}

.btn-neon--soft {
  border-color: var(--border-strong);
  background: var(--btn-soft-bg);
}

.btn-neon--wide {
  width: 100%;
  box-sizing: border-box;
}

.trait-block {
  padding: 0.85rem 1rem;
  border-radius: 16px;
  background: var(--bg-muted);
  border: 1px solid var(--trait-border);
  margin-bottom: 0.65rem;
}

.trait-block--identity {
  margin-bottom: 1rem;
}

.trait-block--identity .meta-grid {
  margin-bottom: 0;
}

.trait-block--player {
  border-color: var(--trait-player-border);
}

.trait-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.trait-label {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: default;
}

.traits-stack--player .trait-label,
.player-traits-cols .trait-label {
  color: var(--editor-trait-label);
}

.trait-actions {
  display: flex;
  align-items: center;
  gap: 0.7rem;
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
  border: 1px solid var(--btn-soft-border);
  background: var(--bg-muted-strong);
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
  border-color: var(--border-strong);
}

.icon-btn.active {
  border-color: var(--border-strong);
  box-shadow: 0 0 16px var(--accent-glow-strong);
  background: var(--accent-fill);
}

.icon-btn--reroll {
  border-color: rgba(251, 191, 36, 0.42);
  background: rgba(120, 53, 15, 0.38);
}

.icon-btn--reroll:hover {
  transform: scale(1.08) translateY(-1px);
  border-color: rgba(252, 211, 77, 0.55);
  box-shadow: 0 4px 14px rgba(251, 191, 36, 0.15);
}

.reveal-toggle {
  flex-shrink: 0;
  min-width: 6.75rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  border: 1px solid var(--reveal-off-border);
  background: var(--reveal-off-bg);
  color: var(--reveal-off-text);
  box-shadow: 0 0 10px var(--reveal-off-glow);
  transition:
    transform 0.14s var(--motion-ease, ease),
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease,
    color 0.2s ease;
}

.reveal-toggle--player {
  min-width: 5.75rem;
  font-size: 0.52rem;
}

.reveal-toggle:hover {
  transform: scale(1.04);
}

.reveal-toggle--open {
  border-color: var(--reveal-on-border);
  background: var(--reveal-on-bg);
  color: var(--reveal-on-text);
  box-shadow: 0 0 16px var(--reveal-on-glow);
}

.stat-reveal-enter-active {
  animation: revealStat 0.52s var(--motion-ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.stat-reveal-leave-active {
  animation: hideStat 0.36s var(--motion-ease, cubic-bezier(0.4, 0, 0.2, 1)) both;
}

@keyframes revealStat {
  0% {
    opacity: 0;
    transform: perspective(520px) rotateX(-14deg) translateY(10px) scale(0.92);
    filter: blur(6px);
  }
  50% {
    transform: perspective(520px) rotateX(5deg) scale(1.03);
    filter: blur(0);
  }
  100% {
    opacity: 1;
    transform: perspective(520px) rotateX(0deg) scale(1);
    filter: blur(0);
  }
}

@keyframes hideStat {
  0% {
    opacity: 1;
    transform: perspective(520px) rotateX(0deg) scale(1);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: perspective(520px) rotateX(12deg) translateY(-6px) scale(0.9);
    filter: blur(5px);
  }
}

.identity-reveal-block {
  margin-top: 0.15rem;
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
  color: var(--text-body);
}

.pv-line:first-of-type {
  margin-top: 0.15rem;
}

.pv-hidden {
  margin: 0.35rem 0 0;
  letter-spacing: 0.25em;
  font-size: 1.1rem;
  color: var(--text-muted);
}

.pv-hint {
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.trait-value-preview {
  margin: 0;
  padding: 0.45rem 0 0.15rem;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-body);
  line-height: 1.4;
}

.trait-value-preview--off {
  color: var(--text-secondary);
  letter-spacing: 0.2em;
}

.traits-stack--player .trait-block--player {
  margin-bottom: 0.5rem;
}

.side-tools--inline {
  margin-top: 1.2rem;
  margin-bottom: 1.1rem;
  padding: 0.85rem 1rem;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
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
  color: var(--active-card-pending);
}

.card-request-host {
  margin-bottom: 1rem;
  padding: 1rem 1.1rem;
  border-radius: 14px;
  border: 1px solid var(--card-request-border);
  background: var(--card-request-bg);
}

.card-request-host__text {
  margin: 0 0 0.75rem;
  font-size: 0.88rem;
  color: var(--card-request-text);
  font-weight: 600;
}

.btn-confirm-card {
  width: 100%;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  border: 1px solid var(--confirm-card-border);
  background: linear-gradient(180deg, var(--confirm-card-bg-top), var(--confirm-card-bg-bot));
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
  color: var(--trait-mini-label);
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
  padding: 1.15rem 1.2rem;
  border-radius: 16px;
  background: var(--active-card-surface-bg);
  border: 1px solid var(--active-card-surface-border);
  margin-top: 0.35rem;
  margin-bottom: 1.35rem;
}

.active-card-box .input + .textarea {
  margin-top: 0.85rem;
}

.ac-title {
  margin: 0 0 0.65rem;
  font-size: 0.85rem;
  color: var(--active-card-heading);
  font-weight: 800;
}

.ac-meta {
  font-size: 0.75rem;
  color: var(--active-card-meta);
}

.ac-meta code {
  color: var(--active-card-meta);
  font-weight: 600;
}

.ac-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.65rem;
}

.ac-t {
  margin: 0 0 0.55rem;
  font-weight: 700;
  color: var(--active-card-title-text);
}

.ac-d {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--active-card-desc);
}

.ac-used {
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--active-card-used);
}

.btn-request {
  margin-top: 0.75rem;
  padding: 0.55rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--btn-request-border);
  background: var(--btn-request-bg);
  color: var(--btn-request-text);
  font-weight: 600;
  cursor: pointer;
}

.btn-request:disabled {
  opacity: 0.55;
  cursor: default;
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
  border: 1px solid var(--border-input);
  background: var(--bg-muted);
  color: var(--text-body);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 0.15s,
    transform 0.15s ease;
}

.gbtn:hover {
  border-color: var(--border-strong);
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
  color: var(--text-secondary);
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
  border: 1px solid var(--border-strong);
  background: var(--accent-fill);
  color: var(--text-title);
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

.btn-primary--solid {
  background: var(--btn-primary-solid-bg);
  color: var(--btn-primary-solid-text);
  border-color: var(--btn-primary-solid-border);
}

.btn-primary--solid:not(:disabled):hover {
  background: var(--btn-primary-solid-hover);
  border-color: var(--btn-primary-solid-border);
}

.btn-soft {
  padding: 0.5rem 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--btn-soft-border);
  background: var(--btn-soft-bg);
  color: var(--text-body);
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
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  color: var(--error-text);
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.error--alert {
  position: sticky;
  top: 0;
  z-index: 10001;
  margin-bottom: 0.65rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}

.access-denied {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: var(--text-body);
}

.denied-title {
  color: var(--error-text);
}

.denied-text {
  max-width: 26rem;
  margin: 0.5rem 0 1rem;
  line-height: 1.5;
}

.denied-back {
  display: inline-block;
  padding: 0.55rem 1.1rem;
  border-radius: 10px;
  font-weight: 700;
  text-decoration: none;
  color: var(--text-title);
  background: var(--accent-fill);
  border: 1px solid var(--border-strong);
}

.denied-back:hover {
  filter: brightness(1.06);
}

.host-nom-rule-wrap {
  margin: 0.5rem 0 0.85rem;
}

.host-nom-rule {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}

.host-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 12010;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.55);
}

.host-modal {
  width: 100%;
  max-width: 22rem;
  padding: 1.15rem 1.2rem 1rem;
  border-radius: 14px;
  border: 1px solid var(--border-strong);
  background: var(--bg-panel, #1a1525);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
}

.host-modal--wide {
  max-width: 28rem;
}

.host-modal__title {
  margin: 0 0 0.65rem;
  font-size: 0.88rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--text-heading);
}

.host-modal__p {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-secondary);
}

.host-modal__hint {
  margin: 0 0 0.85rem;
  font-size: 0.68rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.host-modal__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.host-modal__row--stack {
  flex-direction: column;
  margin-top: 0.35rem;
}

.host-modal__row--stack .btn-primary,
.host-modal__row--stack .btn-soft {
  width: 100%;
  justify-content: center;
}

.host-modal__micro {
  margin: 0 0 0.45rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.host-modal__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}

.host-tie-dur-chip {
  min-width: 3.1rem;
  padding: 0.38rem 0.55rem;
  border-radius: 9px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-muted);
  color: var(--text-body);
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  transition: filter 0.12s ease, border-color 0.12s ease;
}

.host-tie-dur-chip:hover {
  border-color: var(--border-cyan-strong, rgba(94, 231, 223, 0.55));
  filter: brightness(1.06);
}

.host-modal__ok {
  margin-top: 0.85rem;
  width: 100%;
}

.host-ballot-summary-list {
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
  max-height: 40vh;
  overflow-y: auto;
}

.host-ballot-summary-li {
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 0.75rem;
}

.host-ballot-summary-meta {
  color: var(--text-body);
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
  background: var(--bg-toast);
  border: 1px solid var(--reveal-on-border);
  color: var(--reveal-on-text);
  font-size: 0.88rem;
  font-weight: 600;
  pointer-events: none;
}
</style>
