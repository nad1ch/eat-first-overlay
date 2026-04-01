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
    <div class="rp-stepper">
      <button
        type="button"
        class="rp-step"
        :disabled="!canDec"
        @click="emit('round-delta', -1)"
      >
        −
      </button>
      <span class="rp-stepper__mid">ROUND {{ roundNow }}</span>
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
        :class="{ on: roundNow === n }"
        @click="emit('set-round', n)"
      >
        {{ n }}
      </button>
    </div>
    <button type="button" class="rp-btn rp-btn--reset" @click="emit('reset-round')">На раунд 1</button>
    <p class="rp-hint">При зміні раунду голоси очищаються. Фаза не змінюється.</p>
  </section>
</template>

<style scoped>
.rp {
  padding: 1rem 1.1rem 1.15rem;
  border-radius: 16px;
  background: rgba(6, 4, 16, 0.94);
  border: 1px solid rgba(168, 85, 247, 0.22);
  margin-bottom: 1rem;
  transition:
    transform 0.15s ease,
    box-shadow 0.2s ease;
}

.rp:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 20px rgba(168, 85, 247, 0.08);
}

.rp-title {
  margin: 0 0 0.65rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.5);
  font-family: 'Orbitron', sans-serif;
}

.rp-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.rp-step {
  min-width: 2.5rem;
  height: 2.5rem;
  border-radius: 12px;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  border: 1px solid rgba(168, 85, 247, 0.45);
  background: rgba(88, 28, 135, 0.45);
  color: #faf5ff;
  transition: transform 0.12s ease;
}

.rp-step:hover:not(:disabled) {
  transform: scale(1.05);
}

.rp-step:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.rp-stepper__mid {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.05rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: #e9d5ff;
  min-width: 8.5rem;
  text-align: center;
}

.rp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

.rp-chip {
  min-width: 2.15rem;
  padding: 0.35rem 0.5rem;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 800;
  font-family: 'Orbitron', sans-serif;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.35);
  color: #cbd5e1;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.rp-chip:hover {
  transform: scale(1.05);
}

.rp-chip.on {
  border-color: rgba(74, 222, 128, 0.55);
  background: rgba(22, 101, 52, 0.4);
  color: #bbf7d0;
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.2);
}

.rp-btn {
  padding: 0.42rem 0.75rem;
  border-radius: 10px;
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 0.12s ease;
}

.rp-btn:hover {
  transform: translateY(-1px);
}

.rp-btn--reset {
  width: 100%;
  background: rgba(80, 20, 30, 0.5);
  border-color: rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.rp-hint {
  margin: 0.55rem 0 0;
  font-size: 0.62rem;
  line-height: 1.45;
  color: rgba(148, 163, 184, 0.7);
}
</style>
