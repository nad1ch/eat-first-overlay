<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
  playerSlots: { type: Array, default: () => [] },
})

const emit = defineEmits(['clear-hands'])

function slotNum(slot) {
  const s = String(slot ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

const raised = computed(() => {
  const slots = props.playerSlots.filter((s) => props.gameRoom?.hands?.[s] === true)
  return [...slots].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }),
  )
})

const manyHands = computed(() => raised.value.length > 3)
</script>

<template>
  <section class="hp">
    <h3 class="hp-title">Руки</h3>
    <p v-if="manyHands" class="hp-summary">3 руки чекають</p>
    <ul v-else-if="raised.length" class="hp-list">
      <li v-for="slot in raised" :key="slot" class="hp-li">✋ p{{ slotNum(slot) }}</li>
    </ul>
    <p v-else class="hp-empty">Ніхто не підняв руку</p>
    <button type="button" class="hp-clear" @click="emit('clear-hands')">Clear hands</button>
  </section>
</template>

<style scoped>
.hp {
  margin-top: 0.65rem;
  padding: 0.65rem 0.85rem 0.75rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: transform 0.12s ease;
}

.hp:hover {
  transform: translateY(-1px);
}

.hp-title {
  margin: 0 0 0.4rem;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.38);
  font-family: 'Orbitron', sans-serif;
}

.hp-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.hp-li {
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.88);
  padding: 0.15rem 0;
  font-family: 'Orbitron', sans-serif;
}

.hp-summary {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgba(254, 240, 138, 0.92);
  font-family: 'Orbitron', sans-serif;
}

.hp-empty {
  margin: 0 0 0.45rem;
  font-size: 0.66rem;
  color: rgba(148, 163, 184, 0.6);
}

.hp-clear {
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgba(251, 191, 36, 0.28);
  background: rgba(55, 48, 40, 0.45);
  color: #fef3c7;
}

.hp-clear:hover {
  transform: translateY(-1px);
}
</style>
