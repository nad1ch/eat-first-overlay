<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
  votesLive: { type: Array, default: () => [] },
  allPlayersVoted: { type: Boolean, default: false },
})

const emit = defineEmits(['voting-start', 'remove-vote', 'voting-finish'])

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

const canStart = computed(() => Boolean(targetPlayerId.value) && !votingActive.value)

const countFor = computed(() => props.votesLive.filter((v) => v.choice !== 'against').length)

const countAgainst = computed(() => props.votesLive.filter((v) => v.choice === 'against').length)

const showLiveScore = computed(() => countFor.value + countAgainst.value > 0)
</script>

<template>
  <section class="vp" :class="{ 'vp--active': votingActive }">
    <h2 class="vp-title">ГОЛОСУВАННЯ</h2>

    <p class="vp-target">TARGET: <strong>{{ targetPlayerId || '—' }}</strong></p>
    <p v-if="!targetPlayerId && !votingActive" class="vp-hint">Оберіть ціль у ростері (меню гравця)</p>

    <div class="vp-actions">
      <button type="button" class="vp-go" :disabled="!canStart" @click="emit('voting-start')">▶ ПОЧАТИ</button>
      <button
        type="button"
        class="vp-stop"
        :disabled="!votingActive"
        @click="emit('voting-finish')"
      >
        ■ ЗАВЕРШИТИ
      </button>
    </div>

    <div class="vp-pill" :class="votingActive ? 'vp-pill--on' : 'vp-pill--off'">
      {{ votingActive ? 'ВІДКРИТО' : 'ЗАКРИТО' }}
    </div>

    <p v-if="allPlayersVoted && votingActive" class="vp-all-voted">ВСІ ПРОГОЛОСУВАЛИ</p>

    <div class="vp-block vp-block--live">
      <span class="vp-lab">Live</span>
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

.vp-title {
  margin: 0 0 0.65rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.vp-target {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 800;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.06em;
  color: #cbd5e1;
  text-align: center;
}

.vp-target strong {
  color: #fef08a;
}

.vp-hint {
  margin: 0 0 0.75rem;
  font-size: 0.68rem;
  text-align: center;
  color: rgba(251, 191, 36, 0.88);
  font-weight: 600;
}

.vp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  justify-content: center;
  margin-bottom: 0.65rem;
}

.vp-go {
  padding: 0.5rem 1.1rem;
  border-radius: 10px;
  font-size: 0.78rem;
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

.vp-stop {
  padding: 0.5rem 1.1rem;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  cursor: pointer;
  border: 1px solid rgba(248, 113, 113, 0.45);
  background: rgba(80, 20, 30, 0.55);
  color: #fecaca;
  transition: transform 0.12s ease;
}

.vp-stop:hover:not(:disabled) {
  transform: scale(1.05);
}

.vp-stop:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.vp-pill {
  display: table;
  margin: 0 auto 0.65rem;
  padding: 0.28rem 0.75rem;
  border-radius: 999px;
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.14em;
  font-family: 'Orbitron', sans-serif;
}

.vp-pill--on {
  color: #ccfbf1;
  background: rgba(13, 148, 136, 0.35);
  border: 1px solid rgba(45, 212, 191, 0.45);
}

.vp-pill--off {
  color: rgba(148, 163, 184, 0.9);
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(71, 85, 105, 0.45);
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

.vp-lab {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.45);
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

.vp-block {
  padding-top: 0.65rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
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
