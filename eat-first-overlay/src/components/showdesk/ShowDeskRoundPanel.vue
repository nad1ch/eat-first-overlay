<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['round-delta'])

const roundNow = computed(() =>
  Math.min(8, Math.max(1, Math.floor(Number(props.gameRoom?.round) || 1))),
)

const canDec = computed(() => roundNow.value > 1)
const canInc = computed(() => roundNow.value < 8)
</script>

<template>
  <section class="rp">
    <h2 class="rp-title">РАУНД</h2>
    <div class="rp-head">
      <button
        type="button"
        class="rp-step"
        :disabled="!canDec"
        aria-label="Мінус раунд"
        @click="emit('round-delta', -1)"
      >
        −
      </button>
      <span class="rp-mid">ROUND {{ roundNow }}</span>
      <button
        type="button"
        class="rp-step"
        :disabled="!canInc"
        aria-label="Плюс раунд"
        @click="emit('round-delta', 1)"
      >
        +
      </button>
    </div>
  </section>
</template>

<style scoped>
.rp {
  padding: 0.85rem 1rem 1rem;
  border-radius: 16px;
  background: rgba(6, 4, 16, 0.88);
  border: 1px solid rgba(100, 116, 139, 0.22);
  margin-bottom: 1rem;
}

.rp-title {
  margin: 0 0 0.55rem;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.45);
  font-family: 'Orbitron', sans-serif;
  text-align: center;
}

.rp-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.75rem, 4vw, 1.35rem);
}

.rp-step {
  min-width: 2.85rem;
  height: 2.85rem;
  border-radius: 14px;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  border: 1px solid rgba(100, 116, 139, 0.4);
  background: rgba(15, 23, 42, 0.85);
  color: #e2e8f0;
  transition: transform 0.12s ease;
}

.rp-step:hover:not(:disabled) {
  transform: scale(1.07);
}

.rp-step:disabled {
  opacity: 0.28;
  cursor: not-allowed;
}

.rp-mid {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(1.5rem, 6vw, 2.15rem);
  font-weight: 900;
  letter-spacing: 0.12em;
  color: #f5f3ff;
  min-width: 8rem;
  text-align: center;
}
</style>
