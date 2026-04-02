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
    <p v-if="manyHands" class="hp-summary">✋ {{ raised.length }} ГРАВЦІВ ЧЕКАЮТЬ</p>
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
  background: var(--bg-muted);
  border: 1px solid var(--border-subtle);
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
  color: var(--text-muted);
  font-family: 'Orbitron', sans-serif;
}

.hp-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.hp-li {
  font-size: 0.72rem;
  color: var(--text-body);
  padding: 0.15rem 0;
  font-family: 'Orbitron', sans-serif;
}

.hp-summary {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-highlight);
  font-family: 'Orbitron', sans-serif;
}

.hp-empty {
  margin: 0 0 0.45rem;
  font-size: 0.66rem;
  color: var(--text-muted);
}

.hp-clear {
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border-strong);
  background: var(--bg-muted);
  color: var(--text-body);
}

.hp-clear:hover {
  transform: translateY(-1px);
}
</style>
