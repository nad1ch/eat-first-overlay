<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
  votesLive: { type: Array, default: () => [] },
  allPlayersVoted: { type: Boolean, default: false },
})

const emit = defineEmits(['round-delta', 'voting-start', 'voting-finish', 'remove-vote'])

function slotNum(slot) {
  const s = String(slot ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

function choiceGlyph(c) {
  return c === 'against' ? '👎' : '👍'
}

const lines = computed(() =>
  props.votesLive.map((v) => ({
    voterId: v.id,
    label: `${slotNum(v.id)} → ${slotNum(v.targetPlayer)} ${choiceGlyph(v.choice)}`,
  })),
)

const roundNow = computed(() =>
  Math.min(8, Math.max(1, Math.floor(Number(props.gameRoom?.round) || 1))),
)

const canDec = computed(() => roundNow.value > 1)
const canInc = computed(() => roundNow.value < 8)

const targetPlayerId = computed(() => String(props.gameRoom?.voting?.targetPlayer ?? '').trim())

const votingActive = computed(() => Boolean(props.gameRoom?.voting?.active))

const canStart = computed(() => Boolean(targetPlayerId.value) && !votingActive.value)

const countFor = computed(() => props.votesLive.filter((v) => v.choice !== 'against').length)

const countAgainst = computed(() => props.votesLive.filter((v) => v.choice === 'against').length)

const showLiveScore = computed(() => countFor.value + countAgainst.value > 0)
</script>

<template>
  <section class="top" :class="{ 'top--vote-on': votingActive }">
    <div class="top-round">
      <button
        type="button"
        class="top-step"
        :disabled="!canDec"
        aria-label="Мінус раунд"
        @click="emit('round-delta', -1)"
      >
        −
      </button>
      <span class="top-round__mid">ROUND {{ roundNow }}</span>
      <button
        type="button"
        class="top-step"
        :disabled="!canInc"
        aria-label="Плюс раунд"
        @click="emit('round-delta', 1)"
      >
        +
      </button>
    </div>

    <p class="top-target">
      TARGET: <strong>{{ targetPlayerId || '—' }}</strong>
    </p>
    <p v-if="!targetPlayerId && !votingActive" class="top-hint">Оберіть ціль у панелі гравця</p>

    <div class="top-actions">
      <button type="button" class="top-go" :disabled="!canStart" @click="emit('voting-start')">▶ ПОЧАТИ</button>
      <button type="button" class="top-stop" :disabled="!votingActive" @click="emit('voting-finish')">
        ■ ЗАВЕРШИТИ
      </button>
    </div>

    <p v-if="allPlayersVoted && votingActive" class="top-all">ВСІ ПРОГОЛОСУВАЛИ</p>

    <div class="top-live">
      <span class="top-live__k">Live</span>
      <p v-if="showLiveScore" class="top-score">
        <span>👍 {{ countFor }}</span>
        <span>👎 {{ countAgainst }}</span>
      </p>
      <ul v-if="lines.length" class="top-list">
        <li v-for="row in lines" :key="row.voterId" class="top-li">
          <span>{{ row.label }}</span>
          <button type="button" class="top-rm" @click="emit('remove-vote', row.voterId)">×</button>
        </li>
      </ul>
      <p v-else class="top-empty">Немає голосів у раунді</p>
    </div>
  </section>
</template>

<style scoped>
.top {
  padding: 0.75rem 1rem 0.85rem;
  border-radius: 16px;
  background: rgba(6, 4, 18, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 0.65rem;
  transition:
    box-shadow 0.25s ease,
    border-color 0.25s ease;
}

.top--vote-on {
  border-color: rgba(45, 212, 191, 0.45);
  box-shadow: 0 0 28px rgba(45, 212, 191, 0.18);
}

.top-round {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.65rem, 3vw, 1.1rem);
  margin-bottom: 0.55rem;
}

.top-step {
  min-width: 2.6rem;
  height: 2.6rem;
  border-radius: 12px;
  font-size: 1.35rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(100, 116, 139, 0.4);
  background: rgba(15, 23, 42, 0.9);
  color: #e2e8f0;
  transition: transform 0.1s ease;
}

.top-step:hover:not(:disabled) {
  transform: scale(1.06);
}

.top-step:disabled {
  opacity: 0.28;
  cursor: not-allowed;
}

.top-round__mid {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(1.35rem, 5vw, 1.85rem);
  font-weight: 900;
  letter-spacing: 0.1em;
  color: #f5f3ff;
  min-width: 7.5rem;
  text-align: center;
}

.top-target {
  margin: 0 0 0.35rem;
  text-align: center;
  font-size: 1rem;
  font-weight: 800;
  font-family: 'Orbitron', sans-serif;
  color: #cbd5e1;
}

.top-target strong {
  color: #fde047;
}

.top-hint {
  margin: 0 0 0.5rem;
  text-align: center;
  font-size: 0.65rem;
  color: rgba(251, 191, 36, 0.9);
  font-weight: 600;
}

.top-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  margin-bottom: 0.45rem;
}

.top-go {
  padding: 0.48rem 1rem;
  border-radius: 10px;
  font-size: 0.76rem;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid rgba(74, 222, 128, 0.5);
  background: rgba(22, 101, 52, 0.45);
  color: #bbf7d0;
}

.top-go:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.top-stop {
  padding: 0.48rem 1rem;
  border-radius: 10px;
  font-size: 0.76rem;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: rgba(80, 20, 30, 0.55);
  color: #fecaca;
}

.top-stop:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.top-all {
  margin: 0 0 0.4rem;
  text-align: center;
  font-size: 0.55rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  color: #bbf7d0;
  font-family: 'Orbitron', sans-serif;
}

.top-live {
  padding-top: 0.45rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.top-live__k {
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: rgba(125, 211, 252, 0.45);
}

.top-score {
  margin: 0.25rem 0;
  display: flex;
  gap: 1rem;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.85rem;
  font-weight: 900;
  color: #f1f5f9;
}

.top-list {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  max-height: 6.5rem;
  overflow-y: auto;
}

.top-li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.68rem;
  font-family: 'Orbitron', sans-serif;
  color: rgba(226, 232, 240, 0.9);
  padding: 0.2rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.top-rm {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 6px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(60, 20, 28, 0.5);
  color: #fecaca;
  cursor: pointer;
  flex-shrink: 0;
}

.top-empty {
  margin: 0.2rem 0 0;
  font-size: 0.65rem;
  color: rgba(148, 163, 184, 0.65);
}
</style>
