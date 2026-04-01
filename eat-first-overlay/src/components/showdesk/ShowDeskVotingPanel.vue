<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
  playerSlots: { type: Array, default: () => [] },
  /** Вже відфільтровані за поточним раундом */
  votesLive: { type: Array, default: () => [] },
  allPlayersVoted: { type: Boolean, default: false },
})

const emit = defineEmits([
  'nominate',
  'voting-target',
  'voting-toggle',
  'clear-votes',
  'remove-vote',
  'stop-voting',
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

const countFor = computed(() => props.votesLive.filter((v) => v.choice !== 'against').length)

const countAgainst = computed(() => props.votesLive.filter((v) => v.choice === 'against').length)

const showLiveScore = computed(() => countFor.value + countAgainst.value > 0)
</script>

<template>
  <section class="vp" :class="{ 'vp--active': gameRoom.voting?.active }">
    <h2 class="vp-title">ГОЛОСУВАННЯ</h2>

    <p v-if="allPlayersVoted && gameRoom.voting?.active" class="vp-all-voted">ВСІ ПРОГОЛОСУВАЛИ</p>

    <div class="vp-target" :class="{ 'vp-target--dim': !gameRoom.voting?.active }">
      <span class="vp-target__lab">TARGET</span>
      <span class="vp-target__val">{{ targetPlayerId || '—' }}</span>
    </div>

    <div class="vp-block">
      <span class="vp-lab">Номінація</span>
      <p class="vp-mini">Рамка на оверлеї · «Виставив» = слот ведучого в URL</p>
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

    <div class="vp-block">
      <span class="vp-lab">Ціль голосування</span>
      <p class="vp-mini">
        {{ gameRoom.voting?.active ? 'активне' : 'вимкнено' }}
        ·
        <strong>{{ targetPlayerId || '—' }}</strong>
      </p>
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
      <div class="vp-row">
        <button type="button" class="vp-btn vp-btn--toggle" @click="emit('voting-toggle')">
          {{ gameRoom.voting?.active ? 'Вимкнути голосування' : 'Увімкнути голосування' }}
        </button>
        <button type="button" class="vp-btn vp-btn--stop" @click="emit('stop-voting')">Stop voting</button>
      </div>
    </div>

    <div class="vp-block vp-block--live" :class="{ glow: gameRoom.voting?.active }">
      <span class="vp-lab vp-lab--live">Голосування (live)</span>
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
      <button type="button" class="vp-btn vp-btn--clear" @click="emit('clear-votes')">Clear votes</button>
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
    transform 0.15s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.vp--active {
  border-color: rgba(56, 189, 248, 0.28);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.08);
}

.vp:hover {
  transform: translateY(-2px);
}

.vp-block--live.glow {
  border-color: rgba(56, 189, 248, 0.35);
  box-shadow: 0 0 24px rgba(56, 189, 248, 0.12);
}

.vp-title {
  margin: 0 0 0.5rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.5);
  font-family: 'Orbitron', sans-serif;
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

.vp-target {
  margin: 0 0 0.85rem;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  background: rgba(12, 74, 110, 0.45);
  border: 1px solid rgba(56, 189, 248, 0.4);
  box-shadow: 0 0 18px rgba(56, 189, 248, 0.12);
}

.vp-target--dim {
  opacity: 0.55;
  box-shadow: none;
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.25);
}

.vp-target__lab {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.28em;
  color: rgba(125, 211, 252, 0.75);
  font-family: 'Orbitron', sans-serif;
}

.vp-target__val {
  font-size: 1.35rem;
  font-weight: 900;
  font-family: 'Orbitron', sans-serif;
  color: #e0f2fe;
  letter-spacing: 0.06em;
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
  margin-bottom: 0.85rem;
}

.vp-block:last-child {
  margin-bottom: 0;
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
  color: rgba(125, 211, 252, 0.55);
}

.vp-mini {
  margin: 0 0 0.4rem;
  font-size: 0.65rem;
  line-height: 1.4;
  color: rgba(186, 181, 200, 0.75);
}

.vp-mini strong {
  color: #e2e8f0;
  font-weight: 600;
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

.vp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.5rem;
}

.vp-btn {
  padding: 0.42rem 0.75rem;
  border-radius: 10px;
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 0.12s ease;
}

.vp-btn:hover {
  transform: translateY(-1px);
}

.vp-btn--toggle {
  background: rgba(30, 58, 138, 0.45);
  border-color: rgba(96, 165, 250, 0.45);
  color: #dbeafe;
}

.vp-btn--stop {
  background: rgba(80, 20, 30, 0.5);
  border-color: rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.vp-btn--clear {
  margin-top: 0.55rem;
  background: rgba(55, 48, 40, 0.55);
  border-color: rgba(251, 191, 36, 0.25);
  color: #fef3c7;
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
