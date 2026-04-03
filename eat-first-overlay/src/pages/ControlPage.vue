<script setup>
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ADMIN_KEY } from '../config/access.js'
import { rollFieldValue, rollRandomIntoCharacter, ages, genders, pickNameForGender } from '../data/randomPools.js'
import { scenarioIds } from '../data/scenarios.js'
import {
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
  regeneratePlayerActiveCard,
  setGameNominations,
  nominationsFromRoom,
  setRoomVoting,
  setGameHandRaised,
  subscribeToVotes,
  clearAllVotes,
  deleteVoteDoc,
  setRoomRound,
  clearAllHands,
  saveVote,
} from '../services/gameService'
import { millisFromFirestore } from '../utils/firestoreTime.js'
import ShowDeskHeader from '../components/showdesk/ShowDeskHeader.vue'
import ShowPlayersRoster from '../components/showdesk/ShowPlayersRoster.vue'
import { playRevealFlipSound, playVoteSubmitSound } from '../utils/voteUiSound.js'
import { syncHostControlChrome, clearHostControlChrome } from '../composables/hostControlChrome.js'
import { normalizeGameRoomPayload } from '../utils/gameRoomNormalize.js'
import { normalizePlayerSlotId } from '../utils/playerSlot.js'
import { formatGenderDisplay } from '../utils/genderDisplay.js'
import AppPageLoader from '../ui/molecules/AppPageLoader.vue'
import ConfirmDialog from '../ui/molecules/ConfirmDialog.vue'
import UiMenuSelect from '../ui/molecules/UiMenuSelect.vue'

const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()

const wantsAdmin = computed(() => String(route.query.role ?? '').toLowerCase() === 'admin')
const urlKey = computed(() => String(route.query.key ?? '').trim())
const adminKeyOk = computed(() => urlKey.value === ADMIN_KEY)
const isAdmin = computed(() => wantsAdmin.value && adminKeyOk.value)
const adminAccessDenied = computed(() => wantsAdmin.value && !adminKeyOk.value)

const gameId = computed(() => String(route.query.game ?? 'test1'))
const playerId = computed(() => normalizePlayerSlotId(route.query.player))

const modeLabel = computed(() => {
  if (adminAccessDenied.value) return t('control.accessDenied')
  if (isAdmin.value) return t('control.modeHost')
  return t('control.modePlayer')
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
/** Перший snap персонажа з Firestore (лоадер на панелі). */
const panelHydrating = ref(false)
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

watch(
  [gameId, adminAccessDenied, isAdmin],
  () => {
    cleanupSubs()
    gotGameRoomSnap.value = false
    gotPlayersSnap.value = false
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
        allPlayers.value = list
        gotPlayersSnap.value = true
      })
    } else {
      allPlayers.value = []
      gotPlayersSnap.value = true
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

const nominationsList = computed(() => nominationsFromRoom(gameRoom.value))

const nominatedPlayerActive = computed(() => nominationsList.value.length > 0)

const selectedDeskPlayerId = ref('')

watch(gameId, () => {
  selectedDeskPlayerId.value = ''
})

/** Документ гравця для редактора: у ведучого — вибраний слот у ростері, інакше з URL. */
const editorPlayerId = computed(() => {
  if (!isAdmin.value) return playerId.value
  const sel = String(selectedDeskPlayerId.value || '').trim()
  return sel ? normalizePlayerSlotId(sel) : playerId.value
})

const raisedHandsCount = computed(() => {
  const h = gameRoom.value?.hands || {}
  return Object.keys(h).filter((k) => h[k] === true).length
})

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
  return `${ph} · R${r} · ${sp} · ${tgTxt} · ${v} · ✋ ${hc}`
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
    } else {
      showToast(t('toast.voteSendFail'))
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    playerVoteBusy.value = false
  }
}

function revealIdentity(open) {
  if (open) playRevealFlipSound(0.09)
  characterState.identityRevealed = open
}

function revealTrait(key, open) {
  if (open) playRevealFlipSound(0.09)
  if (characterState[key]) characterState[key].revealed = open
}

async function hostToggleNomination({ target, by }) {
  if (!isAdmin.value) return
  const t = String(target ?? '').trim()
  const b = String(by ?? '').trim()
  if (!t || !b) return
  try {
    loadError.value = null
    const cur = nominationsFromRoom(gameRoom.value)
    const exists = cur.some((x) => x.target === t && x.by === b)
    const next = exists ? cur.filter((x) => !(x.target === t && x.by === b)) : [...cur, { target: t, by: b }]
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
        const active = Boolean(gameRoom.value?.voting?.active)
        await setRoomVoting(gameId.value, active, p)
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
      default:
        break
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
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
      await setRoomVoting(gameId.value, false, '')
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
  const tp = String(gameRoom.value?.voting?.targetPlayer ?? '').trim()
  if (!tp) {
    showToast(t('toast.pickVoteTarget'))
    return
  }
  try {
    loadError.value = null
    await setRoomVoting(gameId.value, true, tp)
    showToast(t('toast.votingOpened'))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  }
}

/** Локальний журнал завершених голосувань для ведучого (не в Firestore). */
const hostVoteLog = ref([])

function slotLabelShort(id) {
  const s = String(id ?? '')
  const m = s.match(/^p(\d+)$/i)
  return m ? m[1] : s.replace(/^p/i, '') || s
}

async function hostFinishVoting() {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    const target = String(gameRoom.value?.voting?.targetPlayer ?? '').trim()
    const rr = roomRoundLive.value
    const list = [...votesLiveRound.value]
    const parts = list.map(
      (v) => `${slotLabelShort(v.id)} ${v.choice === 'against' ? 'проти' : 'за'}`,
    )
    const time = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
    const line = `${time} · R${rr} · ціль ${target || '—'} · ${parts.length ? parts.join(', ') : 'немає голосів'}`
    hostVoteLog.value = [{ id: `${Date.now()}-${Math.random()}`, line }, ...hostVoteLog.value].slice(0, 40)

    await setRoomVoting(gameId.value, false, '')
    await clearAllVotes(gameId.value)
    showToast(t('toast.votingClosed'))
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
  clearHands: hostClearHands,
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
  })
})

function rerollSingleTrait(fieldKey) {
  if (!isAdmin.value) return
  characterState[fieldKey].value = rollFieldValue(fieldKey, scenarioForRolls.value)
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

async function globalRollField(fieldKey) {
  if (!isAdmin.value) return
  try {
    loadError.value = null
    const sid = scenarioForRolls.value
    await applyGlobalAction(gameId.value, fieldKey, () => rollFieldValue(fieldKey, sid))
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
let genDialogRunner = null

function openHostGenConfirm(title, message, runner) {
  genDialogTitle.value = title
  genDialogMessage.value = message
  genDialogRunner = runner
  genDialogOpen.value = true
}

function onHostGenDialogClose() {
  genDialogRunner = null
}

async function onHostGenDialogConfirm() {
  const fn = genDialogRunner
  genDialogRunner = null
  if (fn) await fn()
}

function askGenerateRandomCharacter() {
  openHostGenConfirm(
    t('control.genConfirmTitle'),
    t('control.genConfirmPlayer', { slot: editorPlayerId.value }),
    () => generateRandomCharacter(),
  )
}

function askRegenerateAllPlayers() {
  openHostGenConfirm(t('control.genConfirmTitle'), t('control.genConfirmAll'), regenerateAllPlayers)
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

/** URL збігається з вибраним слотом — після оновлення сторінки той самий гравець у редакторі. */
watch(
  () => String(selectedDeskPlayerId.value || '').trim(),
  (sel) => {
    if (!isAdmin.value || !sel) return
    const n = normalizePlayerSlotId(sel)
    if (n !== playerId.value) navigateQuery({ player: n })
  },
)

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
      await saveCharacter(gameId.value, editorPlayerId.value, snapshotCharacter(characterState))
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e)
    }
  }, 400)
}

watch(characterState, () => {
  if (syncing.value || adminAccessDenied.value) return
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
        try {
          await saveCharacter(og, op, snapshotCharacter(characterState))
        } catch (e) {
          console.warn('[control] save before switching editor slot', e)
        }
      }
    }

    loadError.value = null
    panelHydrating.value = true
    unsubCharacter = subscribeToCharacter(gid, pid, (data) => {
      syncing.value = true
      try {
        if (data != null) applyRemoteCharacterData(characterState, data)
      } finally {
        syncing.value = false
        panelHydrating.value = false
      }
    })
  },
  { immediate: true },
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
  if (tickTimer != null) {
    window.clearInterval(tickTimer)
    tickTimer = null
  }
})

const playerRevealLocked = computed(
  () => !isAdmin.value && Boolean(characterState.eliminated),
)

const activeCardPanelKey = computed(
  () =>
    `${characterState.activeCard.used ? 'u' : 'a'}-${characterState.activeCardRequest ? 'r' : 'n'}-${String(characterState.activeCard.title ?? '').slice(0, 24)}`,
)

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
    <h1 class="denied-title">{{ t('control.accessDenied') }}</h1>
    <p class="denied-text">{{ t('control.deniedBefore') }}<code>key</code>{{ t('control.deniedAfter') }}</p>
  </div>

  <div v-else class="desk">
    <AppPageLoader
      :visible="showControlPageLoader"
      :label="t('loader.control')"
    />
    <div class="mode-strip" :class="{ admin: isAdmin, player: !isAdmin }">
      <span class="mode-label">{{ modeLabel }}</span>
      <span v-if="!isAdmin" class="status-pill" :data-s="myStatusLabel">{{ myStatusLabel }}</span>
    </div>

    <template v-if="isAdmin">
      <section class="admin-zone admin-zone--live admin-card admin-zone--live-priority" :aria-label="t('control.ariaLive')">
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
        <details v-if="hostVoteLog.length" class="vote-log-details">
          <summary class="vote-log-details__sum">{{ t('control.voteLog', { n: hostVoteLog.length }) }}</summary>
          <ul class="vote-log-details__list">
            <li v-for="row in hostVoteLog" :key="row.id" class="vote-log-details__li">{{ row.line }}</li>
          </ul>
        </details>
      </section>

      <section
        class="admin-zone admin-zone--players"
        :class="{ 'admin-zone--nominated-active': nominatedPlayerActive }"
        :aria-label="t('control.ariaPlayers')"
      >
        <h2 class="zone-kicker">{{ t('control.zonePlayers') }}</h2>
        <ShowPlayersRoster
          v-model:selected-player-id="selectedDeskPlayerId"
          :players="allPlayers"
          :hands-map="gameRoom.hands || {}"
          :current-player-id="editorPlayerId"
          :spotlight-player-id="String(gameRoom.activePlayer || '')"
          :speaker-id="String(gameRoom.currentSpeaker || '')"
          :voting-target-id="String(gameRoom.voting?.targetPlayer || '')"
          :voting-active="Boolean(gameRoom.voting?.active)"
          :nominations="nominationsList"
          :player-slots="PLAYER_SLOTS"
          :use-host-panel="true"
          @open-editor="goToPlayer"
          @host-command="onRosterHostCommand"
          @toggle-nomination="hostToggleNomination"
        />
        <aside class="side-tools side-tools--inline">
          <label class="field-label" for="host-side-game-id">{{ t('control.gameId') }}</label>
          <div class="inline">
            <input id="host-side-game-id" v-model="draftGameId" type="text" class="input" autocomplete="off" />
            <button type="button" class="btn-soft btn-lift" @click="applyNewGame">OK</button>
          </div>
          <label class="field-label mt" for="host-side-new-player-id">{{ t('control.newPlayerId') }}</label>
          <div class="inline">
            <input
              id="host-side-new-player-id"
              v-model="newPlayerId"
              type="text"
              class="input"
              placeholder="p11"
              autocomplete="off"
            />
            <button type="button" class="btn-soft btn-lift" @click="createAndGoToPlayer">+</button>
          </div>
        </aside>
      </section>

      <section class="admin-zone admin-zone--generate admin-zone--tier-lower" :aria-label="t('control.ariaGen')">
        <h2 class="zone-kicker zone-kicker--soft zone-kicker--gen-title">{{ t('control.zoneGen') }}</h2>
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
      </section>

      <ConfirmDialog
        v-model:open="genDialogOpen"
        :title="genDialogTitle"
        :message="genDialogMessage"
        :confirm-label="t('control.genConfirmProceed')"
        :cancel-label="t('control.genConfirmCancel')"
        @close="onHostGenDialogClose"
        @confirm="onHostGenDialogConfirm"
      />
    </template>

    <div v-else class="player-hero">
      <h1 class="player-title">{{ t('game.title') }}</h1>
      <p class="player-phase">{{ t('control.playerPhase', { phase: playerPhaseDisplay }) }}</p>
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

    <p v-if="loadError" class="error">{{ loadError }}</p>

    <section
      class="panel editor-panel editor-panel--calm"
      :class="{ 'editor-panel--hydrating': panelHydrating }"
    >
      <div v-if="panelHydrating" class="panel-hydrate-overlay" aria-busy="true" :aria-label="t('control.panelLoadingAria')">
        <span class="panel-hydrate-spinner" />
        <span class="panel-hydrate-label">{{ t('loader.panelCard') }}</span>
      </div>
      <h2 class="panel-kicker">{{ isAdmin ? t('control.editorTitle', { id: editorPlayerId }) : t('control.yourChar') }}</h2>

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
              :class="{ 'reveal-toggle--open': characterState.identityRevealed }"
              @click="revealIdentity(!characterState.identityRevealed)"
            >
              {{ characterState.identityRevealed ? t('control.open') : t('control.closed') }}
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

      <div v-else class="player-char-grid">
        <div class="trait-block trait-block--player trait-block--identity player-char-grid__identity">
          <div class="trait-toolbar">
            <span class="trait-label">{{ t('control.profile') }}</span>
            <button
              v-if="!playerRevealLocked"
              type="button"
              class="reveal-toggle reveal-toggle--player"
              :class="{ 'reveal-toggle--open': characterState.identityRevealed }"
              @click="revealIdentity(!characterState.identityRevealed)"
            >
              {{ characterState.identityRevealed ? t('control.open') : t('control.closed') }}
            </button>
          </div>
          <Transition name="stat-reveal" mode="out-in">
            <div v-if="characterState.identityRevealed" key="id-on" class="identity-reveal-block">
              <p class="pv-line"><span class="mk">{{ t('control.name') }}</span> {{ characterState.name || '—' }}</p>
              <p class="pv-line">
                <span class="mk">{{ t('control.ageGender') }}</span> {{ characterState.age || '—' }} ·
                {{ formatGenderDisplay(characterState.gender) }}
              </p>
            </div>
            <p v-else key="id-off" class="pv-hidden">••••••</p>
          </Transition>
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
              <Transition name="stat-reveal" mode="out-in">
                <p
                  v-if="characterState[row.key].revealed"
                  :key="'open-' + row.key"
                  class="trait-value-preview trait-value-preview--on"
                >
                  {{ characterState[row.key].value || '—' }}
                </p>
                <p v-else :key="'shut-' + row.key" class="trait-value-preview trait-value-preview--off">••••••</p>
              </Transition>
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
              <Transition name="stat-reveal" mode="out-in">
                <p
                  v-if="characterState[row.key].revealed"
                  :key="'open-' + row.key"
                  class="trait-value-preview trait-value-preview--on"
                >
                  {{ characterState[row.key].value || '—' }}
                </p>
                <p v-else :key="'shut-' + row.key" class="trait-value-preview trait-value-preview--off">••••••</p>
              </Transition>
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

      <div class="active-card-box">
        <h3 class="ac-title">{{ t('control.activeCard') }}</h3>
        <template v-if="isAdmin">
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
          <label class="field-label" for="host-editor-ac-title">{{ t('control.acFieldTitle') }}</label>
          <input
            id="host-editor-ac-title"
            v-model="characterState.activeCard.title"
            type="text"
            class="input"
            :placeholder="t('control.titlePh')"
            autocomplete="off"
          />
          <label class="field-label" for="host-editor-ac-desc">{{ t('control.acFieldDesc') }}</label>
          <textarea
            id="host-editor-ac-desc"
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
        </template>
        <Transition v-else name="ac-swap" mode="out-in">
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

.hand-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.1rem;
  flex-wrap: wrap;
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

.elim-row {
  margin-top: 0.5rem;
}

.btn-elim {
  padding: 0.45rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--btn-elim-out-border);
  background: var(--btn-elim-out-bg);
  color: var(--btn-elim-out-text);
  font-weight: 600;
  cursor: pointer;
}

.btn-elim.on {
  border-color: var(--btn-elim-on-border);
  background: var(--btn-elim-on-bg);
  color: var(--btn-elim-on-text);
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
