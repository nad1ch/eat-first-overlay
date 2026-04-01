<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import OverlayPlayerCard from '../components/OverlayPlayerCard.vue'
import {
  subscribeToCharacter,
  subscribeToGameRoom,
  subscribeToPlayers,
} from '../services/gameService'

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
/** Для cinema mode в персональному HUD — рахуємо «живих» у кімнаті. */
const aliveForCinema = ref(0)

let unsubscribe = null
let unsubPlayersCount = null
let unsubGameRoom = null

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
})

const modeLabel = computed(() =>
  isPersonal.value ? `персональний · ${personalPlayerId.value}` : 'усі гравці',
)

function isSpotlightPlayer(p) {
  return activeSpotlightId.value != null && p.id === activeSpotlightId.value
}
</script>

<template>
  <div class="overlay-root" :class="{ 'overlay-root--personal': isPersonal }">
    <header class="board-head" :class="{ 'board-head--compact': isPersonal }">
      <p class="eyebrow">Стрім-оверлей · гра {{ gameId }} · {{ modeLabel }}</p>
      <h1 v-if="!isPersonal" class="title">Кого з’їмо першим</h1>
      <p v-if="isPersonal && !singlePlayer" class="empty">
        Немає даних для {{ personalPlayerId }}…
      </p>
      <p v-else-if="!isPersonal && players.length === 0" class="empty">
        Очікуємо гравців у Firestore…
      </p>
    </header>

    <div v-if="isPersonal" class="single-stage single-stage--hud">
      <OverlayPlayerCard
        v-if="singlePlayer"
        :player="singlePlayer"
        :highlighted="isSpotlightPlayer(singlePlayer)"
        :cinema="cinemaHud"
        solo
      />
    </div>

    <div v-else class="grid" :class="{ 'grid--cinema': cinemaGrid }">
      <OverlayPlayerCard
        v-for="p in players"
        :key="p.id"
        :player="p"
        :highlighted="isSpotlightPlayer(p)"
        :cinema="cinemaGrid"
      />
    </div>
  </div>
</template>

<style scoped>
.overlay-root {
  min-height: 100vh;
  width: 100%;
  box-sizing: border-box;
  padding: 1rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  background: linear-gradient(
    180deg,
    rgba(6, 8, 14, 0.35) 0%,
    rgba(6, 8, 14, 0.82) 45%,
    rgba(6, 8, 14, 0.94) 100%
  );
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow:
    inset 0 0 24px rgba(255, 255, 255, 0.06),
    0 0 20px rgba(255, 255, 255, 0.1);
}

.overlay-root--personal {
  padding: 0.5rem 0 0;
  min-height: 100vh;
}

.board-head {
  text-align: center;
  margin-bottom: 1.25rem;
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
  filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.08));
}

.board-head--compact {
  margin-bottom: 0.35rem;
  padding: 0 0.75rem;
}

.board-head--compact .eyebrow {
  font-size: 0.58rem;
  margin-bottom: 0.15rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.65rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(196, 210, 255, 0.45);
}

.title {
  margin: 0;
  font-size: clamp(1.1rem, 2.5vw, 1.5rem);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: #f1f5ff;
  line-height: 1.2;
}

.empty {
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.9);
}

.single-stage {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: min(72vh, calc(100vh - 9rem));
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 0.5rem 0.75rem 2rem;
  box-sizing: border-box;
  filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.06));
}

.single-stage--hud {
  position: relative;
  flex: 1;
  min-height: calc(100vh - 3.5rem);
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 0;
  align-items: stretch;
  justify-content: stretch;
  filter: none;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.85rem 1rem;
  max-width: 1200px;
  margin: 0 auto;
  align-content: end;
  filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.06));
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
