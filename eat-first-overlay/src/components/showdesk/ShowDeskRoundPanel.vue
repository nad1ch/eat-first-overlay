<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['reset-round', 'set-round', 'round-delta'])

const roundNow = computed(() =>
  Math.min(8, Math.max(1, Math.floor(Number(props.gameRoom?.round) || 1))),
)

const canDec = computed(() => roundNow.value > 1)
const canInc = computed(() => roundNow.value < 8)
</script>

<template>
  <section class="rp">
    <h2 class="rp-title">РАУНД</h2>
    <p class="rp-hero">ROUND {{ roundNow }} / 8</p>
    <div class="rp-stepper">
      <button
        type="button"
        class="rp-step"
        :disabled="!canDec"
        @click="emit('round-delta', -1)"
      >
        −
      </button>
      <button
        type="button"
        class="rp-step"
        :disabled="!canInc"
        @click="emit('round-delta', 1)"
      >
        +
      </button>
    </div>
    <div class="rp-chips">
      <button
        v-for="n in 8"
        :key="'r' + n"
        type="button"
        class="rp-chip"
        :class="{ 'rp-chip--current': roundNow === n }"
        @click="emit('set-round', n)"
      >
        {{ n }}
      </button>
    </div>
    <button type="button" class="rp-btn rp-btn--secondary" @click="emit('reset-round')">На раунд 1</button>
    <p class="rp-hint">Раунд: голоси очищаються. Фаза без змін.</p>
  </section>
</template>

<style scoped>
.rp {
  padding: 1rem 1.1rem 1.15rem;
  border-radius: 16px;
  background: rgba(6, 4, 16, 0.88);
  border: 1px solid rgba(100, 116, 139, 0.22);
  margin-bottom: 1rem;
  transition:
    transform 0.12s ease,
    box-shadow 0.2s ease;
}

.rp:hover {
  transform: translateY(-1px);
}

.rp-title {
  margin: 0 0 0.35rem;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.45);
  font-family: 'Orbitron', sans-serif;
}

.rp-hero {
  margin: 0 0 0.65rem;
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(1.35rem, 4vw, 1.85rem);
  font-weight: 900;
  letter-spacing: 0.1em;
  color: #e9d5ff;
  text-align: center;
}

.rp-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.rp-step {
  min-width: 2.75rem;
  height: 2.75rem;
  border-radius: 12px;
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  border: 1px solid rgba(100, 116, 139, 0.35);
  background: rgba(15, 23, 42, 0.75);
  color: #cbd5e1;
  transition: transform 0.12s ease;
}

.rp-step:hover:not(:disabled) {
  transform: scale(1.06);
}

.rp-step:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.rp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: center;
  margin-bottom: 0.85rem;
}

.rp-chip {
  min-width: 2.35rem;
  padding: 0.42rem 0.55rem;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 800;
  font-family: 'Orbitron', sans-serif;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.35);
  color: #94a3b8;
  cursor: pointer;
  transition:
    transform 0.1s ease,
    box-shadow 0.15s ease;
}

.rp-chip:hover {
  transform: scale(1.06);
}

.rp-chip--current {
  border-color: rgba(74, 222, 128, 0.65);
  background: rgba(22, 101, 52, 0.55);
  color: #ecfdf5;
  box-shadow:
    0 0 0 2px rgba(74, 222, 128, 0.25),
    0 0 18px rgba(74, 222, 128, 0.25);
  transform: scale(1.08);
}

.rp-btn {
  width: 100%;
  padding: 0.38rem 0.75rem;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    border-color 0.15s;
}

.rp-btn--secondary {
  border: 1px solid rgba(71, 85, 105, 0.55);
  background: transparent;
  color: rgba(148, 163, 184, 0.95);
}

.rp-btn--secondary:hover {
  transform: translateY(-1px);
  border-color: rgba(148, 163, 184, 0.45);
  color: #e2e8f0;
}

.rp-hint {
  margin: 0.55rem 0 0;
  font-size: 0.6rem;
  line-height: 1.45;
  color: rgba(100, 116, 139, 0.75);
}
</style>
