<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import OverlayPlayerCard from '../components/OverlayPlayerCard.vue'
import {
  subscribeToCharacter,
  subscribeToGameRoom,
  subscribeToPlayers,
} from '../services/gameService'
import { millisFromFirestore } from '../utils/firestoreTime.js'

const route = useRoute()

const gameId = computed(() => String(route.query.game ?? 'test1'))

const personalPlayerId = computed(() => {
  const p = route.query.player
  if (p == null) return null
  const s = String(p).trim()
  return s.length ? s : null
})

const isPersonal = computed(() => personalPlayerId.value != null)

const players = ref([])
const singlePlayer = ref(null)
const gameRoom = ref({})
const aliveForCinema = ref(0)

let unsubscribe = null
let unsubPlayersCount = null
let unsubGameRoom = null

const tick = ref(Date.now())
let tickId = null

onMounted(() => {
  tickId = window.setInterval(() => {
    tick.value = Date.now()
  }, 250)
})

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

function setupGameRoom(gid) {
  cleanupGameRoom()
  unsubGameRoom = subscribeToGameRoom(gid, (data) => {
    gameRoom.value = data && typeof data === 'object' ? data : {}
  })
}

watch(
  gameId,
  (gid) => {
    setupGameRoom(gid)
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

    if (pid) {
      players.value = []
      singlePlayer.value = null
      unsubscribe = subscribeToCharacter(gid, pid, (data) => {
        singlePlayer.value = data ? { id: pid, ...data } : null
      })
      unsubPlayersCount = subscribeToPlayers(gid, (list) => {
        aliveForCinema.value = list.filter((p) => p.eliminated !== true).length
      })
    } else {
      singlePlayer.value = null
      unsubscribe = subscribeToPlayers(gid, (list) => {
        players.value = list
      })
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  cleanupPlayerSub()
  cleanupGameRoom()
  if (tickId != null) {
    window.clearInterval(tickId)
    tickId = null
  }
})

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

const overlayDrama = computed(() => dramaMode.value || dramaPersonal.value)

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
</script>

<template>
  <div
    class="overlay-root"
    :class="{
      'overlay-root--personal': isPersonal,
      'overlay-root--global': !isPersonal,
      'overlay-root--drama': overlayDrama,
    }"
  >
    <header
      v-if="!isPersonal"
      class="board-head"
    >
      <p class="eyebrow">Оверлей · {{ gameId }}</p>
      <h1 class="title">Кого ми з’їмо першим</h1>
      <p v-if="players.length === 0" class="empty">Очікуємо гравців у Firestore…</p>
    </header>

    <p v-if="isPersonal && !singlePlayer" class="personal-wait" role="status">
      Немає даних для {{ personalPlayerId }}…
    </p>

    <div v-if="isPersonal" class="single-stage single-stage--hud">
      <OverlayPlayerCard
        v-if="singlePlayer"
        :player="singlePlayer"
        :is-spotlight="isSpotlightPlayer(singlePlayer)"
        :is-timer-target="isTimerPlayer(singlePlayer)"
        :cinema="cinemaHud"
        :drama="dramaPersonal"
        v-bind="cardTimerProps(singlePlayer)"
        solo
      />
    </div>

    <div v-else class="grid" :class="{ 'grid--cinema': cinemaGrid }">
      <OverlayPlayerCard
        v-for="p in players"
        :key="p.id"
        :player="p"
        :is-spotlight="isSpotlightPlayer(p)"
        :is-timer-target="isTimerPlayer(p)"
        :dimmed="gridDimNonSpeakers && !isTimerPlayer(p)"
        :cinema="cinemaGrid"
        :drama="dramaMode"
        v-bind="cardTimerProps(p)"
      />
    </div>
  </div>
</template>

<style scoped>
.overlay-root {
  min-height: 100vh;
  width: 100%;
  box-sizing: border-box;
}

.overlay-root--global {
  padding: 1rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  background: linear-gradient(
    180deg,
    rgba(8, 6, 22, 0.92) 0%,
    rgba(6, 4, 18, 0.97) 100%
  );
}

.overlay-root--personal {
  position: relative;
  min-height: 100vh;
  background: transparent;
  padding: 0;
  margin: 0;
}

.overlay-root--drama {
  position: relative;
  filter: contrast(1.08) brightness(0.92);
  animation: overlayDramaHeartbeat 1.2s ease-in-out infinite;
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
  margin-bottom: 1.25rem;
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
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
  font-size: clamp(1.05rem, 2.4vw, 1.45rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: #f5f3ff;
  font-family: 'Orbitron', sans-serif;
  line-height: 1.2;
}

.empty {
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  color: rgba(186, 181, 200, 0.85);
}

.personal-wait {
  position: absolute;
  top: 0.35rem;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.25rem 0.6rem;
  font-size: 0.65rem;
  color: rgba(226, 220, 255, 0.75);
  z-index: 10;
  pointer-events: none;
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
