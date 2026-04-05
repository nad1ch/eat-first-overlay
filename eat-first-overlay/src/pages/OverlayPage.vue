<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import OverlayPlayerCard from '../components/OverlayPlayerCard.vue'
import {
  clearSpeakingTimer,
  subscribeToCharacter,
  subscribeToGameRoom,
  subscribeToPlayers,
  subscribeToVotes,
  nominationsFromRoom,
} from '../services/gameService'
import { normalizeGameRoomPayload } from '../utils/gameRoomNormalize.js'
import { millisFromFirestore } from '../utils/firestoreTime.js'
import AppPageLoader from '../ui/molecules/AppPageLoader.vue'
import VoiceVideoGrid from '../components/VoiceVideoGrid.vue'
import { liveKitConfigured } from '../config/livekit.js'
import { getPersistedGameId, setPersistedGameId } from '../utils/persistedGameId.js'
import { normalizePlayerSlotId } from '../utils/playerSlot.js'
import { getOrCreateDeviceId } from '../utils/deviceId.js'

const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()

const gotGameRoomOv = ref(false)
const gotPrimaryOv = ref(false)

const gameId = computed(() => {
  const q = route.query.game
  if (q != null && String(q).trim()) return String(q).trim()
  const p = getPersistedGameId()
  if (p) return p
  return 'test1'
})

const personalPlayerId = computed(() => {
  const p = route.query.player
  if (p == null) return null
  const s = String(p).trim()
  return s.length ? s : null
})

const isPersonal = computed(() => personalPlayerId.value != null)

/** Унікальний identity для глобального оверлею (spectator), щоб не зіткнутися з іншим учасником у LiveKit. */
const liveKitIdentity = computed(() => {
  if (personalPlayerId.value) return normalizePlayerSlotId(personalPlayerId.value)
  const dev = getOrCreateDeviceId().replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)
  return `spectator-${dev || 'browser'}`
})

const lkSpotlightUnmute = computed(() => String(route.query.lk_focus ?? '') === '1')

const players = ref([])
const singlePlayer = ref(null)
const gameRoom = ref({})
const votes = ref([])
const aliveForCinema = ref(0)

/** Якщо в URL є ?token= і він не збігається з joinToken у Firestore — приховуємо картку. Без token — як раніше (OBS). */
const overlayTokenGateBlocks = computed(() => {
  if (!isPersonal.value) return false
  const urlTok = String(route.query.token ?? '').trim()
  if (!urlTok) return false
  const p = singlePlayer.value
  if (!p) return false
  const st = typeof p.joinToken === 'string' ? p.joinToken.trim() : ''
  if (!st) return false
  return urlTok !== st
})

const liveKitDisplayName = computed(() => {
  if (personalPlayerId.value && singlePlayer.value && typeof singlePlayer.value.name === 'string') {
    return singlePlayer.value.name
  }
  if (personalPlayerId.value) return personalPlayerId.value
  return 'Spectator'
})

const liveKitCanPublish = computed(() => {
  if (!personalPlayerId.value) return false
  if (overlayTokenGateBlocks.value) return false
  if (singlePlayer.value?.eliminated === true) return false
  return true
})

const liveKitEliminatedLocal = computed(() => singlePlayer.value?.eliminated === true)

const liveKitPlayerNameMap = computed(() => {
  const m = {}
  if (isPersonal.value && singlePlayer.value) {
    m[singlePlayer.value.id] = singlePlayer.value.name || singlePlayer.value.id
  }
  for (const p of players.value) {
    m[p.id] = typeof p.name === 'string' && p.name.trim() ? p.name : p.id
  }
  return m
})

let unsubscribe = null
let unsubPlayersCount = null
let unsubGameRoom = null
let unsubVotes = null

const tick = ref(Date.now())
let tickId = null

onMounted(() => {
  tickId = window.setInterval(() => {
    tick.value = Date.now()
  }, 250)
})

watch(
  () => [route.path, String(route.query.game ?? '')],
  () => {
    if (route.path !== '/overlay') return
    if (String(route.query.game ?? '').trim()) return
    router.replace({ path: '/overlay', query: { ...route.query, game: gameId.value } })
  },
  { immediate: true, flush: 'post' },
)

function cleanupPlayerSub() {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  if (unsubPlayersCount) {
    unsubPlayersCount()
    unsubPlayersCount = null
  }
}

function cleanupGameRoom() {
  if (unsubGameRoom) {
    unsubGameRoom()
    unsubGameRoom = null
  }
}

function cleanupVotesSub() {
  if (unsubVotes) {
    unsubVotes()
    unsubVotes = null
  }
}

function setupGameRoom(gid) {
  gotGameRoomOv.value = false
  cleanupGameRoom()
  unsubGameRoom = subscribeToGameRoom(gid, (data) => {
    gameRoom.value = normalizeGameRoomPayload(data && typeof data === 'object' ? data : {})
    gotGameRoomOv.value = true
  })
}

function setupVotesSub(gid) {
  cleanupVotesSub()
  unsubVotes = subscribeToVotes(gid, (list) => {
    votes.value = list
  })
}

watch(
  gameId,
  (gid) => {
    setPersistedGameId(gid)
    setupGameRoom(gid)
    setupVotesSub(gid)
  },
  { immediate: true },
)

const activeSpotlightId = computed(() => {
  const a = gameRoom.value?.activePlayer
  if (a == null) return null
  const s = String(a).trim()
  return s.length ? s : null
})

/** Таймер прив’язаний до currentSpeaker; legacy: activePlayer якщо поле ще не мігрувало. */
const speakerForTimerId = computed(() => {
  const gr = gameRoom.value
  const cs = String(gr?.currentSpeaker ?? '').trim()
  if (cs) return cs
  const hasClock =
    (Number(gr?.speakingTimer) > 0 && gr?.timerStartedAt) ||
    (gr?.timerPaused === true && Number.isFinite(Number(gr?.timerRemainingFrozen)))
  if (hasClock) {
    const leg = String(gr?.activePlayer ?? '').trim()
    return leg || null
  }
  return null
})

const aliveInGame = computed(
  () => players.value.filter((p) => p.eliminated !== true).length,
)

const cinemaGrid = computed(() => !isPersonal.value && aliveInGame.value === 4)
const cinemaHud = computed(() => isPersonal.value && aliveForCinema.value === 4)

watch(
  [gameId, personalPlayerId],
  () => {
    cleanupPlayerSub()
    const gid = gameId.value
    const pid = personalPlayerId.value
    aliveForCinema.value = 0
    gotPrimaryOv.value = false

    if (pid) {
      players.value = []
      singlePlayer.value = null
      unsubscribe = subscribeToCharacter(gid, pid, (data) => {
        singlePlayer.value = data ? { id: pid, ...data } : null
        gotPrimaryOv.value = true
      })
      unsubPlayersCount = subscribeToPlayers(gid, (list) => {
        aliveForCinema.value = list.filter((p) => p.eliminated !== true).length
      })
    } else {
      singlePlayer.value = null
      unsubscribe = subscribeToPlayers(gid, (list) => {
        players.value = list
        gotPrimaryOv.value = true
      })
    }
  },
  { immediate: true },
)

const overlayPageReady = computed(() => gotGameRoomOv.value && gotPrimaryOv.value)

/** Банер лише при зміні раунду в кімнаті (не прив’язано до фази) */
const roundBannerVisible = ref(false)
let roundBannerTimer = null
const lastSeenRoundBanner = ref(null)

watch(
  () => Math.min(8, Math.max(1, Math.floor(Number(gameRoom.value?.round) || 1))),
  (r) => {
    if (lastSeenRoundBanner.value === null) {
      lastSeenRoundBanner.value = r
      return
    }
    if (r === lastSeenRoundBanner.value) return
    lastSeenRoundBanner.value = r
    if (roundBannerTimer) clearTimeout(roundBannerTimer)
    roundBannerVisible.value = true
    roundBannerTimer = setTimeout(() => {
      roundBannerVisible.value = false
    }, 1000)
  },
  { immediate: true, flush: 'post' },
)

const speakerTimeLeft = computed(() => {
  const gr = gameRoom.value
  if (gr?.timerPaused === true) {
    const f = Number(gr?.timerRemainingFrozen)
    if (Number.isFinite(f) && f >= 0) return f
    return undefined
  }
  const start = millisFromFirestore(gr?.timerStartedAt)
  const total = Number(gr?.speakingTimer) || 0
  if (start == null || total <= 0) return undefined
  const elapsed = Math.floor((tick.value - start) / 1000)
  return Math.max(0, total - elapsed)
})

const speakerTimerTotal = computed(() => Number(gameRoom.value?.speakingTimer) || 30)

const dramaMode = computed(() => {
  if (isPersonal.value) return false
  return aliveInGame.value === 3
})

/** Персональний оверлей: та сама «напруга», коли в грі лишилось 3. */
const dramaPersonal = computed(() => isPersonal.value && aliveForCinema.value === 3)

const globalStatusLine = computed(() => {
  const phRaw = String(gameRoom.value?.gamePhase || 'intro')
  const pk = `gamePhase.${phRaw}`
  const ph = te(pk) ? t(pk) : phRaw
  const r = Math.min(8, Math.max(1, Math.floor(Number(gameRoom.value?.round) || 1)))
  const n = players.value.length
  return t('overlayPage.phaseBanner', { phase: ph, round: r, n })
})

/** Тільки глобальна сітка: на персональному оверлеї без vignette/фільтра по центру вебки */
const overlayDrama = computed(() => dramaMode.value)

const overlayPaused = computed(() => gameRoom.value?.timerPaused === true)

/** У глобальній сітці затемнюємо картки, поки обраний спікер (фокус на тому, хто говорить). */
const gridDimNonSpeakers = computed(
  () => !isPersonal.value && Boolean(speakerForTimerId.value),
)

function isSpotlightPlayer(p) {
  return activeSpotlightId.value != null && p.id === activeSpotlightId.value
}

function isTimerPlayer(p) {
  return speakerForTimerId.value != null && p.id === speakerForTimerId.value
}

function cardTimerProps(p) {
  if (!isTimerPlayer(p) || speakerTimeLeft.value === undefined) return {}
  return {
    speakerTimeLeft: speakerTimeLeft.value,
    speakerTimerTotal: speakerTimerTotal.value,
  }
}

const votingActive = computed(() => gameRoom.value?.voting?.active === true)
const votingTargetId = computed(() => String(gameRoom.value?.voting?.targetPlayer ?? '').trim())
const nominatedPlayerId = computed(() => String(gameRoom.value?.nominatedPlayer ?? '').trim())
const nominatedById = computed(() => String(gameRoom.value?.nominatedBy ?? '').trim())

function slotNumFromId(id) {
  const s = String(id ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

function nominatorsLineFor(pid) {
  const id = String(pid ?? '')
  const list = nominationsFromRoom(gameRoom.value)
  const nums = list.filter((x) => String(x.target) === id).map((x) => slotNumFromId(x.by))
  if (nums.length) return nums.join(', ')
  const n = nominatedPlayerId.value
  const b = nominatedById.value
  if (n === id && b) return slotNumFromId(b)
  return ''
}

const roomRound = computed(() =>
  Math.min(8, Math.max(1, Math.floor(Number(gameRoom.value?.round) || 1))),
)

function votesForTarget(playerId) {
  const pid = String(playerId ?? '')
  return votes.value.filter(
    (v) => Number(v.round) === roomRound.value && String(v.targetPlayer) === pid,
  )
}

const personalHasVotedThisRound = computed(() => {
  const pid = personalPlayerId.value
  if (!pid) return false
  return votes.value.some((v) => v.id === pid && Number(v.round) === roomRound.value)
})

const personalIsVoteTarget = computed(
  () =>
    votingActive.value &&
    personalPlayerId.value != null &&
    votingTargetId.value === personalPlayerId.value,
)

const personalVoteBannerVisible = computed(
  () =>
    isPersonal.value &&
    votingActive.value &&
    Boolean(votingTargetId.value) &&
    singlePlayer.value != null,
)

const personalOverlayVoteTally = computed(() => {
  const t = votingTargetId.value
  if (!t) return { for: 0, against: 0 }
  let forC = 0
  let ag = 0
  for (const v of votes.value) {
    if (Number(v.round) !== roomRound.value) continue
    if (String(v.targetPlayer) !== t) continue
    if (v.choice === 'against') ag++
    else forC++
  }
  return { for: forC, against: ag }
})

const votesThisRoundCount = computed(
  () => votes.value.filter((v) => Number(v.round) === roomRound.value).length,
)

const showAllVotedBanner = computed(() => {
  if (!votingActive.value) return false
  if (isPersonal.value) {
    return aliveForCinema.value > 0 && votesThisRoundCount.value === aliveForCinema.value
  }
  return aliveInGame.value > 0 && votesThisRoundCount.value === aliveInGame.value
})

const handsRaisedAliveCount = computed(() => {
  if (isPersonal.value) return 0
  return players.value.filter((p) => p.eliminated !== true && isHandRaised(p)).length
})

const handsClusterMode = computed(() => handsRaisedAliveCount.value > 3)
const handsClusterExtra = computed(() => Math.max(0, handsRaisedAliveCount.value - 3))

const overlayRoundPulse = ref(false)
let overlayRoundTimer = null

watch(roomRound, (r, prev) => {
  if (prev === undefined || prev === r) return
  overlayRoundPulse.value = true
  if (overlayRoundTimer) clearTimeout(overlayRoundTimer)
  overlayRoundTimer = setTimeout(() => {
    overlayRoundPulse.value = false
  }, 260)
})

function handsMap() {
  const h = gameRoom.value?.hands
  return h && typeof h === 'object' ? h : {}
}

function isHandRaised(p) {
  return handsMap()[String(p.id)] === true
}

/** Персональний оверлей: тихий стан «ніхто не говорить» (не під час голосування). */
const showIdleWaitingCue = computed(
  () =>
    isPersonal.value &&
    !speakerForTimerId.value &&
    !votingActive.value &&
    singlePlayer.value != null &&
    singlePlayer.value.eliminated !== true,
)

/** Коли час вичерпано — зняти спікера й таймер (без зміни spotlight). */
watch(speakerTimeLeft, async (left, prevLeft) => {
  if (gameRoom.value?.timerPaused === true) return
  if (left !== 0) return
  if (prevLeft === undefined || prevLeft === 0) return
  const gr = gameRoom.value
  if (!(Number(gr?.speakingTimer) > 0)) return
  try {
    await clearSpeakingTimer(gameId.value)
  } catch (e) {
    console.error('[autoClearSpeaker]', e)
  }
})

onUnmounted(() => {
  cleanupPlayerSub()
  cleanupGameRoom()
  cleanupVotesSub()
  if (overlayRoundTimer) clearTimeout(overlayRoundTimer)
  if (tickId != null) {
    window.clearInterval(tickId)
    tickId = null
  }
  if (roundBannerTimer) clearTimeout(roundBannerTimer)
})
</script>

<template>
  <div class="overlay-page">
    <VoiceVideoGrid
      v-if="liveKitConfigured()"
      :overlay-ready="overlayPageReady"
      :game-id="gameId"
      :local-identity="liveKitIdentity"
      :display-name="liveKitDisplayName"
      :can-publish="liveKitCanPublish"
      :spotlight-slot="activeSpotlightId ?? ''"
      :speaker-slot="speakerForTimerId ?? ''"
      :spotlight-unmute-mode="lkSpotlightUnmute"
      :eliminated-local="liveKitEliminatedLocal"
      :player-name-map="liveKitPlayerNameMap"
    />
    <AppPageLoader
      :visible="!overlayPageReady"
      :label="t('overlayPage.sync')"
    />
    <div
      class="overlay-root"
    :class="{
      'overlay-root--personal': isPersonal,
      'overlay-root--global': !isPersonal,
      'overlay-root--drama': overlayDrama,
      'overlay-root--paused': overlayPaused,
      'overlay-root--round-pulse': overlayRoundPulse,
    }"
  >
    <p
      v-if="showAllVotedBanner"
      class="overlay-edge-hint overlay-edge-hint--all-voted"
      role="status"
    >
      {{ t('overlayPage.allVoted') }}
    </p>
    <p
      v-if="handsClusterMode && !isPersonal"
      class="overlay-edge-hint overlay-edge-hint--hands"
      aria-hidden="true"
    >
      ✋ +{{ handsClusterExtra }}
    </p>
    <div
      class="overlay-body"
      :class="{ 'overlay-body--all-voted': showAllVotedBanner }"
      data-onb="overlay-body"
    >
    <header
      v-if="!isPersonal"
      class="board-head"
    >
      <p class="eyebrow">{{ t('overlayPage.globalEyebrow', { game: gameId }) }}</p>
      <h1 class="title">{{ t('game.title') }}</h1>
      <p class="board-status">{{ globalStatusLine }}</p>
      <div v-if="players.length === 0" class="overlay-firestore-wait" role="status">
        <span class="overlay-firestore-wait__spin" aria-hidden="true" />
        <span class="overlay-firestore-wait__txt">{{ t('overlayPage.waitFirestore') }}</span>
      </div>
    </header>

    <div v-if="isPersonal && overlayTokenGateBlocks" class="overlay-token-wall" role="alert">
      <p class="overlay-token-wall__title">{{ t('overlayPage.tokenMismatchTitle') }}</p>
      <p class="overlay-token-wall__hint">{{ t('overlayPage.tokenMismatchHint') }}</p>
      <button type="button" class="overlay-token-wall__btn" @click="router.push({ path: '/join', query: { game: gameId } })">
        {{ t('overlayPage.tokenMismatchCta') }}
      </button>
    </div>

    <div v-else-if="isPersonal && !singlePlayer" class="personal-wait" role="status">
      <span class="personal-wait__spin" aria-hidden="true" />
      <span class="personal-wait__msg">{{ t('overlayPage.noData', { id: personalPlayerId }) }}</span>
    </div>

    <div
      v-if="personalVoteBannerVisible"
      class="overlay-vote-top"
      role="status"
      aria-live="polite"
    >
      <p class="overlay-vote-top__k">{{ t('overlayPage.voting') }}</p>
      <p class="overlay-vote-top__line">{{ t('overlayPage.voteAgainst', { n: slotNumFromId(votingTargetId) }) }}</p>
      <p v-if="personalIsVoteTarget" class="overlay-vote-top__warn">{{ t('overlayPage.youAreTarget') }}</p>
      <p class="overlay-vote-top__sc">
        👍 {{ personalOverlayVoteTally.for }}
        <span class="overlay-vote-top__dot">·</span>
        👎 {{ personalOverlayVoteTally.against }}
      </p>
      <p class="overlay-vote-top__hint">{{ t('overlayPage.voteInPanel') }}</p>
    </div>

    <div v-if="isPersonal && !overlayTokenGateBlocks" class="single-stage single-stage--hud" data-onb="overlay-content">
      <OverlayPlayerCard
        v-if="singlePlayer"
        :player="singlePlayer"
        :is-spotlight="isSpotlightPlayer(singlePlayer)"
        :is-timer-target="isTimerPlayer(singlePlayer)"
        :cinema="cinemaHud"
        :drama="dramaPersonal"
        :voting-active="votingActive"
        :voting-target-id="votingTargetId"
        :vote-interactive="false"
        :hide-vote-strip="true"
        :game-id="gameId"
        :nominated-player-id="nominatedPlayerId"
        :nominated-by-id="nominatedById"
        :nominators-line="nominatorsLineFor(singlePlayer.id)"
        :room-round="roomRound"
        :votes-received="votesForTarget(singlePlayer.id)"
        :has-voted-this-round="personalHasVotedThisRound"
        :is-vote-target-self="personalIsVoteTarget"
        :hand-raised="isHandRaised(singlePlayer)"
        :idle-waiting="showIdleWaitingCue"
        v-bind="cardTimerProps(singlePlayer)"
        solo
      />
    </div>

    <div v-else class="board-frame" :class="{ 'board-frame--cinema': cinemaGrid }" data-onb="overlay-content">
      <div class="grid" :class="{ 'grid--cinema': cinemaGrid }">
        <OverlayPlayerCard
          v-for="p in players"
          :key="p.id"
          :player="p"
          :is-spotlight="isSpotlightPlayer(p)"
          :is-timer-target="isTimerPlayer(p)"
          :dimmed="gridDimNonSpeakers && !isTimerPlayer(p)"
          :cinema="cinemaGrid"
          :drama="dramaMode"
          :voting-active="votingActive"
          :voting-target-id="votingTargetId"
          :vote-interactive="false"
          :game-id="gameId"
          :nominated-player-id="nominatedPlayerId"
          :nominated-by-id="nominatedById"
          :nominators-line="nominatorsLineFor(p.id)"
          :room-round="roomRound"
          :votes-received="votesForTarget(p.id)"
          :has-voted-this-round="false"
          :is-vote-target-self="false"
          :hand-raised="isHandRaised(p)"
          :suppress-hand-badge="handsClusterMode"
          v-bind="cardTimerProps(p)"
        />
      </div>
    </div>
    </div>

    <Teleport to="body">
      <div
        v-if="roundBannerVisible"
        class="round-banner"
        role="status"
        aria-live="polite"
      >
        <p class="round-banner__n">{{ t('overlayPage.roundN', { n: roomRound }) }}</p>
        <p class="round-banner__t">{{ t('overlayPage.revealCard') }}</p>
      </div>
    </Teleport>
    </div>
  </div>
</template>

<style scoped>
.overlay-page {
  min-height: 100vh;
  width: 100%;
  position: relative;
}

.overlay-root {
  min-height: 100vh;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  /* Завжди темний канвас для ефіру, незалежно від теми сайту */
  background: #050308;
}

.overlay-root--round-pulse {
  animation: roundScene 0.25s ease both;
}

@keyframes roundScene {
  0% {
    transform: scale(1.02);
    opacity: 0.8;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.overlay-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transform-origin: top center;
  transition: transform 0.35s ease;
}

.overlay-body--all-voted {
  transform: scale(1.01);
}

.overlay-root--personal .overlay-body {
  flex: 1;
  min-height: 100vh;
}

.overlay-edge-hint {
  position: fixed;
  z-index: 50;
  margin: 0;
  pointer-events: none;
  font-family: Orbitron, sans-serif;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.65);
}

.overlay-edge-hint--all-voted {
  top: max(0.4rem, env(safe-area-inset-top, 0px));
  left: max(0.5rem, env(safe-area-inset-left, 0px));
  font-size: clamp(0.52rem, min(1.4vw, 1.5vh), 0.62rem);
  color: rgba(187, 247, 208, 0.92);
  animation:
    allVotedFade 0.25s ease-out,
    allVotedGlow 1.2s ease-in-out;
}

@keyframes allVotedFade {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes allVotedGlow {
  0%,
  100% {
    filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 12px rgba(74, 222, 128, 0.65));
  }
}

.overlay-edge-hint--hands {
  top: max(0.4rem, env(safe-area-inset-top, 0px));
  right: max(0.5rem, env(safe-area-inset-right, 0px));
  font-size: clamp(0.58rem, min(1.55vw, 1.65vh), 0.72rem);
  color: rgba(254, 240, 138, 0.92);
}

.overlay-vote-top {
  position: fixed;
  top: max(0.5rem, env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 45;
  margin: 0;
  padding: 0.45rem 1rem 0.55rem;
  max-width: min(92vw, 28rem);
  text-align: center;
  pointer-events: none;
  font-family: Orbitron, sans-serif;
  border-radius: 12px;
  background: rgba(8, 6, 22, 0.88);
  border: 1px solid rgba(56, 189, 248, 0.35);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
}

.overlay-vote-top__k {
  margin: 0;
  font-size: clamp(0.48rem, min(1.2vw, 1.35vh), 0.58rem);
  font-weight: 900;
  letter-spacing: 0.2em;
  color: rgba(125, 211, 252, 0.95);
}

.overlay-vote-top__line {
  margin: 0.2rem 0 0;
  font-size: clamp(0.62rem, min(1.65vw, 1.75vh), 0.78rem);
  font-weight: 800;
  color: #f8fafc;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.75);
}

.overlay-vote-top__warn {
  margin: 0.35rem 0 0;
  font-size: clamp(0.58rem, min(1.5vw, 1.6vh), 0.72rem);
  font-weight: 900;
  letter-spacing: 0.12em;
  color: #fecaca;
  animation: overlayVotePulse 1.4s ease-in-out infinite;
}

@keyframes overlayVotePulse {
  0%,
  100% {
    opacity: 0.85;
  }
  50% {
    opacity: 1;
  }
}

.overlay-vote-top__sc {
  margin: 0.35rem 0 0;
  font-size: clamp(0.7rem, min(1.85vw, 2vh), 0.88rem);
  font-weight: 800;
  color: #e2e8f0;
}

.overlay-vote-top__dot {
  margin: 0 0.35rem;
  opacity: 0.5;
}

.overlay-vote-top__hint {
  margin: 0.3rem 0 0;
  font-size: clamp(0.48rem, min(1.25vw, 1.35vh), 0.58rem);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgba(203, 213, 225, 0.88);
}

.overlay-root--global {
  padding: clamp(0.85rem, 2vw, 1.35rem) clamp(0.75rem, 2vw, 1.5rem) 2rem;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse 120% 80% at 50% -20%, rgba(88, 28, 135, 0.35), transparent 55%),
    linear-gradient(180deg, #070510 0%, #030208 100%);
}

.overlay-root--personal {
  position: relative;
  min-height: 100vh;
  background: transparent;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
}

.overlay-root--drama {
  position: relative;
  filter: contrast(1.08) brightness(0.92);
  animation: overlayDramaHeartbeat 1.2s ease-in-out infinite;
}

.overlay-root--paused:not(.overlay-root--drama) {
  filter: brightness(0.7);
}

.overlay-root--drama.overlay-root--paused {
  animation: overlayDramaHeartbeatPaused 1.2s ease-in-out infinite;
}

.overlay-root--personal.overlay-root--drama {
  animation: overlayDramaHeartbeat 1.2s ease-in-out infinite;
}

@keyframes overlayDramaHeartbeat {
  0%,
  100% {
    filter: contrast(1.06) brightness(0.93);
  }
  50% {
    filter: contrast(1.14) brightness(0.87);
  }
}

@keyframes overlayDramaHeartbeatPaused {
  0%,
  100% {
    filter: contrast(1.06) brightness(0.65);
  }
  50% {
    filter: contrast(1.12) brightness(0.6);
  }
}

.overlay-root--drama::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    transparent 35%,
    rgba(90, 20, 30, 0.38) 100%
  );
  animation: dramaVignettePulse 1.2s ease-in-out infinite;
}

@keyframes dramaVignettePulse {
  0%,
  100% {
    opacity: 0.85;
  }
  50% {
    opacity: 1;
  }
}

.overlay-root--drama .board-head,
.overlay-root--drama .grid {
  position: relative;
  z-index: 1;
}

.board-head {
  text-align: center;
  margin-bottom: 1.1rem;
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
}

.board-status {
  margin: 0.5rem 0 0;
  font-size: clamp(0.68rem, 1.5vw, 0.82rem);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-family: 'Orbitron', sans-serif;
  color: rgba(196, 181, 253, 0.72);
}

.board-frame {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: clamp(0.85rem, 2vw, 1.35rem);
  border-radius: 20px;
  border: 1px solid rgba(168, 85, 247, 0.22);
  background: linear-gradient(165deg, rgba(12, 8, 28, 0.55) 0%, rgba(6, 4, 16, 0.35) 100%);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.35),
    0 12px 40px rgba(0, 0, 0, 0.35);
}

.board-frame--cinema {
  max-width: 1320px;
  padding-bottom: 1rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.65rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.45);
}

.title {
  margin: 0;
  font-size: clamp(1.2rem, 2.8vw, 1.75rem);
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #f5f3ff;
  font-family: 'Orbitron', sans-serif;
  line-height: 1.15;
  text-shadow: 0 0 28px rgba(168, 85, 247, 0.2);
}

.overlay-firestore-wait {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0.85rem 0 0;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(168, 85, 247, 0.2);
  animation: ui-slide-up 0.55s var(--motion-ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.overlay-firestore-wait__spin {
  flex-shrink: 0;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  border: 2px solid rgba(168, 85, 247, 0.25);
  border-top-color: rgba(196, 181, 253, 0.95);
  animation: panelSpin 0.7s linear infinite;
}

.overlay-firestore-wait__txt {
  font-size: 0.82rem;
  color: rgba(226, 220, 255, 0.88);
}

.overlay-token-wall {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 1.5rem;
  text-align: center;
  background: rgba(10, 8, 18, 0.92);
  color: rgba(226, 220, 255, 0.95);
  animation: ui-fade-in 0.35s ease both;
}

.overlay-token-wall__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.overlay-token-wall__hint {
  margin: 0;
  max-width: 22rem;
  font-size: 0.78rem;
  line-height: 1.45;
  color: rgba(226, 220, 255, 0.72);
}

.overlay-token-wall__btn {
  margin-top: 0.35rem;
  padding: 0.5rem 1rem;
  border-radius: 10px;
  font-weight: 800;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  border: 1px solid rgba(196, 181, 253, 0.45);
  background: rgba(168, 85, 247, 0.25);
  color: rgba(251, 245, 255, 0.98);
}

.overlay-token-wall__btn:hover {
  filter: brightness(1.08);
}

.personal-wait {
  position: absolute;
  top: 0.35rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  padding: 0.35rem 0.75rem;
  font-size: 0.65rem;
  color: rgba(226, 220, 255, 0.85);
  z-index: 10;
  pointer-events: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(168, 85, 247, 0.22);
  animation: ui-fade-in 0.4s ease both;
}

.personal-wait__spin {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  border: 2px solid rgba(168, 85, 247, 0.3);
  border-top-color: rgba(251, 191, 36, 0.9);
  animation: panelSpin 0.65s linear infinite;
}

.personal-wait__msg {
  white-space: nowrap;
}

@keyframes panelSpin {
  to {
    transform: rotate(360deg);
  }
}

.single-stage--hud {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 100vh;
  width: 100%;
  margin: 0;
  padding: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.85rem 1rem;
  max-width: 1200px;
  margin: 0 auto;
  align-content: end;
}

.grid--cinema {
  gap: 1.35rem 1.5rem;
  max-width: 1280px;
  padding-bottom: 0.5rem;
}

@media (min-width: 900px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 520px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
.round-banner {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  pointer-events: none;
  background: rgba(5, 3, 8, 0.72);
  animation: roundBannerFade 1s ease forwards;
}

.round-banner__n {
  margin: 0;
  font-family: Orbitron, system-ui, sans-serif;
  font-size: clamp(1.25rem, 4vw, 1.85rem);
  font-weight: 900;
  letter-spacing: 0.2em;
  color: #a855f7;
  text-shadow: 0 0 24px rgba(168, 85, 247, 0.45);
}

.round-banner__t {
  margin: 0;
  font-size: clamp(0.72rem, 2vw, 0.95rem);
  font-weight: 700;
  letter-spacing: 0.28em;
  color: rgba(248, 250, 252, 0.88);
}

@keyframes roundBannerFade {
  0% {
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  78% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
