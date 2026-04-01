<script setup>
import { computed } from 'vue'

const props = defineProps({
  players: { type: Array, default: () => [] },
  /** games/{id}.hands — підняті руки йдуть першими в сітці */
  handsMap: { type: Object, default: () => ({}) },
  currentPlayerId: { type: String, default: '' },
  spotlightPlayerId: { type: String, default: '' },
  speakerId: { type: String, default: '' },
  votingTargetId: { type: String, default: '' },
  votingActive: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])

function cardActive(p) {
  const ac = p.activeCard
  if (!ac || typeof ac !== 'object') return false
  return !ac.used
}

function slotNum(id) {
  const s = String(id ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

function statusLine(p) {
  if (p.eliminated === true) return 'Вибув'
  if (String(p.id) === String(props.speakerId || '').trim()) return 'Говорить'
  const vt = String(props.votingTargetId || '').trim()
  if (props.votingActive && vt && String(p.id) === vt) return 'Ціль голосу'
  if (String(p.id) === String(props.spotlightPlayerId || '').trim()) return 'Spotlight'
  return '—'
}

function handUp(p) {
  return props.handsMap?.[String(p.id)] === true
}

const playersSorted = computed(() => {
  const list = [...props.players]
  list.sort((a, b) => {
    const ah = handUp(a) ? 1 : 0
    const bh = handUp(b) ? 1 : 0
    if (bh !== ah) return bh - ah
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })
  })
  return list
})
</script>

<template>
  <section class="roster">
    <h2 class="block-title">Гравці</h2>
    <p class="roster-hint">Клік — редактор. Спікер / таймер / spotlight — у Control Center.</p>
    <div class="roster-grid">
      <button
        v-for="p in playersSorted"
        :key="p.id"
        type="button"
        class="pcard"
        :class="{
          on: p.id === currentPlayerId,
          elim: p.eliminated === true,
          speak: String(speakerId || '').trim() === p.id,
          spot: String(spotlightPlayerId || '').trim() === p.id,
          'pcard--hand': handUp(p),
          'pcard--vote-target':
            votingActive &&
            String(votingTargetId || '').trim() === p.id &&
            p.eliminated !== true &&
            String(speakerId || '').trim() !== p.id,
        }"
        @click="emit('select', p.id)"
      >
        <span v-if="p.eliminated === true" class="elim-badge" aria-hidden="true">ВИБУВ</span>
        <span class="num">{{ slotNum(p.id) }}</span>
        <span class="st">{{ statusLine(p) }}</span>
        <span v-if="cardActive(p)" class="card-ico" title="Є активна карта">🃏</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.roster {
  padding: 1rem 1.1rem;
  border-radius: 16px;
  background: rgba(8, 4, 20, 0.88);
  border: 1px solid rgba(168, 85, 247, 0.22);
  margin-bottom: 1rem;
}

.block-title {
  margin: 0 0 0.35rem;
  font-size: 0.88rem;
  font-weight: 800;
  color: #ede9fe;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.06em;
}

.roster-hint {
  margin: 0 0 0.85rem;
  font-size: 0.65rem;
  line-height: 1.35;
  color: rgba(196, 181, 253, 0.4);
}

.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 0.45rem;
}

.pcard {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-height: 4.5rem;
  padding: 0.5rem 0.35rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.35);
  color: #e2e8f0;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s,
    box-shadow 0.15s;
}

.pcard:hover {
  transform: scale(1.03);
  border-color: rgba(168, 85, 247, 0.45);
  box-shadow: 0 0 20px rgba(168, 85, 247, 0.2);
}

.pcard.on {
  border-color: rgba(168, 85, 247, 0.65);
  box-shadow: 0 0 18px rgba(168, 85, 247, 0.25);
}

.pcard--hand:not(.elim) {
  border-color: rgba(251, 191, 36, 0.35);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.12);
}

.pcard--vote-target:not(.elim):not(.speak) {
  border-color: rgba(56, 189, 248, 0.55);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.28);
}

.pcard--vote-target:not(.elim) .st {
  color: rgba(125, 211, 252, 0.88);
}

.pcard.speak:not(.elim) {
  border-color: rgba(168, 85, 247, 0.55);
  box-shadow: 0 0 22px rgba(168, 85, 247, 0.35);
  animation: neonPulse 2s ease-in-out infinite;
}

.pcard.spot:not(.elim):not(.speak) {
  border-color: rgba(251, 191, 36, 0.45);
}

.pcard.elim {
  position: relative;
  opacity: 0.55;
  border-color: rgba(127, 29, 29, 0.55);
  background: linear-gradient(160deg, rgba(40, 10, 14, 0.92), rgba(0, 0, 0, 0.55));
  box-shadow: inset 0 0 48px rgba(0, 0, 0, 0.65);
}

.pcard.elim::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.pcard.elim > * {
  position: relative;
  z-index: 1;
}

.elim-badge {
  position: absolute;
  top: 0.2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 0.12rem 0.35rem;
  border-radius: 6px;
  font-size: 0.5rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.92);
  border: 1px solid rgba(248, 113, 113, 0.45);
  line-height: 1;
  white-space: nowrap;
}

@keyframes neonPulse {
  0%,
  100% {
    box-shadow: 0 0 16px rgba(168, 85, 247, 0.28);
  }
  50% {
    box-shadow: 0 0 28px rgba(168, 85, 247, 0.5);
  }
}

.num {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.35rem;
  font-weight: 900;
  color: #faf5ff;
  line-height: 1;
}

.st {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.55);
}

.pcard.speak .st {
  color: #e9d5ff;
}

.pcard.elim .st {
  color: #fecaca;
}

.card-ico {
  position: absolute;
  top: 0.25rem;
  right: 0.3rem;
  font-size: 0.75rem;
  line-height: 1;
  filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.5));
}
</style>
