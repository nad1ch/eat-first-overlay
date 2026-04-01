<script setup>
defineProps({
  players: { type: Array, default: () => [] },
  currentPlayerId: { type: String, default: '' },
  activeSpeakerId: { type: String, default: '' },
})

const emit = defineEmits(['select'])

function cardUnused(p) {
  const ac = p.activeCard
  if (!ac || typeof ac !== 'object') return false
  return !ac.used
}

function hasRequest(p) {
  return p.activeCardRequest === true
}
</script>

<template>
  <section class="roster">
    <h2 class="block-title">Гравці</h2>
    <div class="roster-grid">
      <button
        v-for="p in players"
        :key="p.id"
        type="button"
        class="roster-card"
        :class="{
          current: p.id === currentPlayerId,
          elim: p.eliminated === true,
          speak: String(activeSpeakerId || '') === p.id,
        }"
        @click="emit('select', p.id)"
      >
        <span class="rid">{{ p.id }}</span>
        <span class="rname">{{ (p.name && String(p.name).trim()) || '—' }}</span>
        <span v-if="p.eliminated" class="tag bad">вибув</span>
        <span v-else-if="String(activeSpeakerId || '') === p.id" class="tag hot">говорить</span>
        <span v-if="cardUnused(p)" class="tag card">карта</span>
        <span v-if="hasRequest(p)" class="tag req">запит</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.roster {
  padding: 1.15rem 1.25rem;
  border-radius: 20px;
  background: rgba(10, 8, 22, 0.72);
  border: 1px solid rgba(124, 58, 237, 0.18);
  margin-bottom: 1.25rem;
}

.block-title {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #ede9fe;
  font-family: 'Orbitron', sans-serif;
}

.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}

.roster-card {
  text-align: left;
  padding: 0.55rem 0.65rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.28);
  color: #e2e8f0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.roster-card:hover {
  border-color: rgba(167, 139, 250, 0.35);
}

.roster-card.current {
  border-color: rgba(167, 139, 250, 0.55);
  box-shadow: 0 0 16px rgba(124, 58, 237, 0.2);
}

.roster-card.elim {
  opacity: 0.55;
}

.roster-card.speak {
  border-color: rgba(251, 191, 36, 0.4);
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
  background: rgba(127, 29, 29, 0.45);
  color: #fecaca;
}

.tag.hot {
  background: rgba(120, 53, 15, 0.45);
  color: #fde68a;
}

.tag.card {
  background: rgba(88, 28, 135, 0.4);
  color: #e9d5ff;
}

.tag.req {
  background: rgba(30, 58, 138, 0.5);
  color: #bfdbfe;
}
</style>
