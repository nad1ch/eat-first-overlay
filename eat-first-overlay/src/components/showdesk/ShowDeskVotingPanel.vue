<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
  playerSlots: { type: Array, default: () => [] },
  votesLive: { type: Array, default: () => [] },
  allPlayersVoted: { type: Boolean, default: false },
})

const emit = defineEmits([
  'nominate',
  'voting-target',
  'voting-start',
  'clear-votes',
  'remove-vote',
  'stop-voting',
  'voting-finish',
])

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

const targetPlayerId = computed(() => String(props.gameRoom?.voting?.targetPlayer ?? '').trim())

const votingActive = computed(() => Boolean(props.gameRoom?.voting?.active))

const roundNow = computed(() =>
  Math.min(8, Math.max(1, Math.floor(Number(props.gameRoom?.round) || 1))),
)

const canStart = computed(() => Boolean(targetPlayerId.value) && !votingActive.value)

const countFor = computed(() => props.votesLive.filter((v) => v.choice !== 'against').length)

const countAgainst = computed(() => props.votesLive.filter((v) => v.choice === 'against').length)

const showLiveScore = computed(() => countFor.value + countAgainst.value > 0)

const showTargetHint = computed(() => !targetPlayerId.value && !votingActive.value)
</script>

<template>
  <section class="vp" :class="{ 'vp--active': votingActive }">
    <h2 class="vp-title">ГОЛОСУВАННЯ</h2>

    <div class="vp-step">
      <h3 class="vp-step__k">1. Номінація</h3>
      <div class="vp-chips">
        <button
          v-for="slot in playerSlots"
          :key="'nom-' + slot"
          type="button"
          class="chip chip--red"
          :class="{ on: String(gameRoom.nominatedPlayer || '').trim() === slot }"
          @click="emit('nominate', slot)"
        >
          {{ slotNum(slot) }}
        </button>
        <button type="button" class="btn-x" @click="emit('nominate', '')">×</button>
      </div>
    </div>

    <div class="vp-step">
      <h3 class="vp-step__k">2. Ціль голосування</h3>
      <p v-if="showTargetHint" class="vp-hint">Оберіть ціль голосування</p>
      <div class="vp-chips">
        <button
          v-for="slot in playerSlots"
          :key="'vt-' + slot"
          type="button"
          class="chip chip--vote"
          :class="{ on: targetPlayerId === slot }"
          @click="emit('voting-target', slot)"
        >
          {{ slotNum(slot) }}
        </button>
      </div>
    </div>

    <div class="vp-step vp-step--last">
      <h3 class="vp-step__k">3. Стан і дія</h3>
      <div class="vp-pill" :class="votingActive ? 'vp-pill--on' : 'vp-pill--off'">
        {{ votingActive ? 'Голосування відкрите' : 'Голосування закрите' }}
      </div>
      <p class="vp-meta">Ціль: <strong>{{ targetPlayerId || '—' }}</strong> · Раунд {{ roundNow }}</p>
      <p v-if="allPlayersVoted && votingActive" class="vp-all-voted">ВСІ ПРОГОЛОСУВАЛИ</p>

      <div class="vp-actions">
        <button type="button" class="vp-go" :disabled="!canStart" @click="emit('voting-start')">▶ ПОЧАТИ</button>
        <button
          type="button"
          class="vp-finish"
          :disabled="!votingActive"
          @click="emit('voting-finish')"
        >
          ЗАВЕРШИТИ ГОЛОСУВАННЯ
        </button>
        <button type="button" class="vp-stop-soft" @click="emit('stop-voting')">Зупинити без очищення</button>
        <button type="button" class="vp-clear-soft" @click="emit('clear-votes')">Лише очистити голоси</button>
      </div>
    </div>

    <div class="vp-block vp-block--live" :class="{ glow: votingActive }">
      <span class="vp-lab vp-lab--live">Live</span>
      <p v-if="showLiveScore" class="vp-score">
        <span class="vp-score__n">👍 {{ countFor }}</span>
        <span class="vp-score__n">👎 {{ countAgainst }}</span>
      </p>
      <ul v-if="lines.length" class="vp-list">
        <li v-for="row in lines" :key="row.voterId" class="vp-li">
          <span class="vp-li-txt">{{ row.label }}</span>
          <button type="button" class="vp-li-rm" @click="emit('remove-vote', row.voterId)">×</button>
        </li>
      </ul>
      <p v-else class="vp-empty">Ще немає голосів у цьому раунді</p>
    </div>
  </section>
</template>

<style scoped>
.vp {
  padding: 1rem 1.1rem 1.15rem;
  border-radius: 16px;
  background: rgba(6, 4, 16, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin-bottom: 1rem;
  transition:
    transform 0.12s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.vp--active {
  border-color: rgba(45, 212, 191, 0.35);
  box-shadow: 0 0 18px rgba(45, 212, 191, 0.1);
}

.vp:hover {
  transform: translateY(-1px);
}

.vp-title {
  margin: 0 0 0.75rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.vp-step {
  margin-bottom: 1rem;
}

.vp-step--last {
  margin-bottom: 0.85rem;
}

.vp-step__k {
  margin: 0 0 0.45rem;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.vp-hint {
  margin: 0 0 0.4rem;
  font-size: 0.65rem;
  color: rgba(251, 191, 36, 0.85);
  font-weight: 600;
}

.vp-pill {
  display: inline-block;
  margin: 0 0 0.45rem;
  padding: 0.32rem 0.65rem;
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  font-family: 'Orbitron', sans-serif;
}

.vp-pill--on {
  color: #ccfbf1;
  background: rgba(13, 148, 136, 0.35);
  border: 1px solid rgba(45, 212, 191, 0.45);
  box-shadow: 0 0 14px rgba(45, 212, 191, 0.15);
}

.vp-pill--off {
  color: rgba(148, 163, 184, 0.9);
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(71, 85, 105, 0.45);
}

.vp-meta {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  color: rgba(203, 213, 225, 0.9);
}

.vp-meta strong {
  color: #f1f5f9;
  font-weight: 700;
}

.vp-all-voted {
  margin: 0 0 0.55rem;
  padding: 0.28rem 0.45rem;
  border-radius: 8px;
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-align: center;
  color: #bbf7d0;
  background: rgba(22, 101, 52, 0.35);
  border: 1px solid rgba(74, 222, 128, 0.35);
  font-family: 'Orbitron', sans-serif;
}

.vp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.vp-go {
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  border: 1px solid rgba(74, 222, 128, 0.5);
  background: rgba(22, 101, 52, 0.45);
  color: #bbf7d0;
  transition: transform 0.12s ease;
}

.vp-go:hover:not(:disabled) {
  transform: scale(1.05);
}

.vp-go:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.vp-finish {
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  cursor: pointer;
  border: 1px solid rgba(56, 189, 248, 0.5);
  background: rgba(12, 74, 110, 0.55);
  color: #e0f2fe;
  transition: transform 0.12s ease;
}

.vp-finish:hover:not(:disabled) {
  transform: scale(1.04);
}

.vp-finish:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.vp-stop-soft,
.vp-clear-soft {
  padding: 0.35rem 0.55rem;
  border-radius: 8px;
  font-size: 0.62rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.25);
  color: rgba(186, 181, 200, 0.88);
  transition:
    transform 0.1s ease,
    border-color 0.15s;
}

.vp-stop-soft:hover,
.vp-clear-soft:hover {
  transform: scale(1.04);
  border-color: rgba(148, 163, 184, 0.35);
}

.vp-block--live.glow {
  border-color: rgba(56, 189, 248, 0.28);
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.08);
}

.vp-lab {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.4);
}

.vp-lab--live {
  color: rgba(125, 211, 252, 0.5);
}

.vp-score {
  margin: 0 0 0.45rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1rem;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.95rem;
  font-weight: 900;
  color: #f1f5f9;
}

.vp-score__n {
  white-space: nowrap;
}

.vp-block {
  margin-bottom: 0;
  padding-top: 0.65rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.vp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}

.chip {
  min-width: 2rem;
  padding: 0.3rem 0.5rem;
  border-radius: 8px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.35);
  color: #cbd5e1;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.chip:hover {
  transform: scale(1.05);
}

.chip--red.on {
  border-color: rgba(248, 113, 113, 0.55);
  background: rgba(127, 29, 29, 0.45);
  box-shadow: 0 0 12px rgba(220, 38, 38, 0.22);
  color: #fecaca;
}

.chip--vote.on {
  border-color: rgba(56, 189, 248, 0.5);
  background: rgba(12, 74, 110, 0.4);
  color: #e0f2fe;
}

.btn-x {
  padding: 0.28rem 0.5rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.35);
  color: #94a3b8;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}

.vp-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.vp-li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.28rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.92);
  font-family: 'Orbitron', sans-serif;
}

.vp-li:last-child {
  border-bottom: none;
}

.vp-li-rm {
  flex-shrink: 0;
  width: 1.65rem;
  height: 1.65rem;
  border-radius: 8px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(80, 20, 30, 0.4);
  color: #fecaca;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
}

.vp-empty {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.68rem;
  color: rgba(148, 163, 184, 0.65);
}
</style>
