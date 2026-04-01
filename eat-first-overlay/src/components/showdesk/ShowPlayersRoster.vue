<script setup>
defineProps({
  players: { type: Array, default: () => [] },
  /** Відкритий у редакторі */
  currentPlayerId: { type: String, default: '' },
  /** Хто зараз у spotlight (activePlayer) */
  spotlightPlayerId: { type: String, default: '' },
  /** Хто говорить — таймер (currentSpeaker) */
  speakerId: { type: String, default: '' },
})

const emit = defineEmits(['pick', 'set-spotlight'])

function onMainClick(e, id) {
  emit('pick', id, { shiftKey: e.shiftKey })
}

function cardUnused(p) {
  const ac = p.activeCard
  if (!ac || typeof ac !== 'object') return false
  return !ac.used
}

function hasRequest(p) {
  return p.activeCardRequest === true
}

function slotNum(id) {
  const s = String(id ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}
</script>

<template>
  <section class="roster">
    <h2 class="block-title">Гравці</h2>
    <p class="roster-hint">
      Клік — спікер + таймер + редактор. Shift+клік — spotlight. ★ — лише spotlight.
    </p>
    <div class="roster-grid">
      <div
        v-for="p in players"
        :key="p.id"
        class="roster-card"
        :class="{
          current: p.id === currentPlayerId,
          spotlight: String(spotlightPlayerId || '').trim() === p.id,
          speaking: String(speakerId || '').trim() === p.id,
          elim: p.eliminated === true,
          muted:
            Boolean(String(speakerId || '').trim()) &&
            String(speakerId || '').trim() !== p.id &&
            p.eliminated !== true,
        }"
      >
        <button type="button" class="roster-main" @click="onMainClick($event, p.id)">
          <span class="rid">{{ slotNum(p.id) }}</span>
          <span class="rname">{{ (p.name && String(p.name).trim()) || '—' }}</span>
          <span v-if="p.eliminated" class="tag bad">вибув</span>
          <span v-else-if="String(speakerId || '').trim() === p.id" class="tag hot">говорить</span>
          <span v-if="cardUnused(p)" class="tag card" title="Є активна карта">🃏</span>
          <span v-if="hasRequest(p)" class="req-line">ХОЧЕ ВИКОРИСТАТИ КАРТУ</span>
        </button>
        <button
          type="button"
          class="spot-btn"
          :class="{ on: String(spotlightPlayerId || '').trim() === p.id }"
          title="Spotlight на оверлеї"
          @click.stop="emit('set-spotlight', p.id)"
        >
          ★
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.roster {
  padding: 1.15rem 1.25rem;
  border-radius: 20px;
  background: rgba(10, 8, 22, 0.78);
  border: 1px solid rgba(168, 85, 247, 0.2);
  margin-bottom: 1.25rem;
}

.block-title {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #ede9fe;
  font-family: 'Orbitron', sans-serif;
}

.roster-hint {
  margin: 0 0 0.75rem;
  font-size: 0.68rem;
  line-height: 1.35;
  color: rgba(196, 181, 253, 0.45);
}

.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 0.5rem;
}

.roster-card {
  position: relative;
  display: flex;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.32);
  overflow: hidden;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.roster-card.spotlight {
  border-color: rgba(168, 85, 247, 0.55);
  box-shadow:
    0 0 0 1px rgba(168, 85, 247, 0.25),
    0 0 20px rgba(168, 85, 247, 0.28);
}

.roster-card.speaking:not(.elim) {
  animation: speakPulse 1.6s ease-in-out infinite;
}

@keyframes speakPulse {
  0%,
  100% {
    border-color: rgba(251, 191, 36, 0.35);
    box-shadow: 0 0 0 rgba(251, 191, 36, 0);
  }
  50% {
    border-color: rgba(251, 191, 36, 0.65);
    box-shadow: 0 0 14px rgba(251, 191, 36, 0.22);
  }
}

.roster-card.current {
  border-color: rgba(168, 85, 247, 0.4);
}

.roster-card.elim {
  opacity: 0.52;
  border-color: rgba(185, 28, 28, 0.45);
  background: rgba(40, 10, 14, 0.35);
}

.roster-card.muted:not(.speaking):not(.elim) {
  opacity: 0.72;
}

.roster-main {
  flex: 1;
  text-align: left;
  padding: 0.55rem 0.5rem 0.55rem 0.65rem;
  border: none;
  background: transparent;
  color: #e2e8f0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.roster-main:hover {
  background: rgba(255, 255, 255, 0.04);
}

.spot-btn {
  flex-shrink: 0;
  width: 2rem;
  border: none;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.2);
  color: rgba(196, 181, 253, 0.45);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.spot-btn:hover {
  color: #fde68a;
  background: rgba(120, 53, 15, 0.25);
}

.spot-btn.on {
  color: #fde68a;
  background: rgba(120, 53, 15, 0.35);
}

.rid {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: rgba(196, 181, 253, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.rname {
  font-size: 0.82rem;
  font-weight: 600;
  color: #f5f3ff;
}

.tag {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  align-self: flex-start;
  padding: 0.12rem 0.35rem;
  border-radius: 6px;
}

.tag.bad {
  background: rgba(127, 29, 29, 0.55);
  color: #fecaca;
}

.tag.hot {
  background: rgba(120, 53, 15, 0.5);
  color: #fde68a;
}

.tag.card {
  background: rgba(88, 28, 135, 0.45);
  color: #e9d5ff;
  font-size: 0.75rem;
  text-transform: none;
  letter-spacing: 0;
  padding: 0.08rem 0.3rem;
}

.req-line {
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #93c5fd;
  line-height: 1.25;
  margin-top: 0.15rem;
}
</style>
