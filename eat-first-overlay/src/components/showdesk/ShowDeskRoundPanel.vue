<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['next-round', 'reset-round', 'set-round'])

const draft = ref(1)

watch(
  () => props.gameRoom?.round,
  (r) => {
    const n = Math.floor(Number(r) || 1)
    draft.value = n >= 1 && n <= 8 ? n : 1
  },
  { immediate: true },
)

function applySetRound() {
  const n = Math.floor(Number(draft.value) || 1)
  emit('set-round', n)
}

const roundNow = computed(() =>
  Math.min(8, Math.max(1, Math.floor(Number(props.gameRoom?.round) || 1))),
)
</script>

<template>
  <section class="rp">
    <h2 class="rp-title">РАУНД</h2>
    <p class="rp-now">
      <span class="rp-now__big">ROUND {{ roundNow }} / 8</span>
    </p>
    <div class="rp-row">
      <button type="button" class="rp-btn rp-btn--next" @click="emit('next-round')">➕ Next round</button>
      <button type="button" class="rp-btn rp-btn--reset" @click="emit('reset-round')">🔄 Reset round</button>
    </div>
    <div class="rp-set">
      <label class="rp-lab">✏️ Set round</label>
      <div class="rp-inline">
        <input v-model.number="draft" type="number" min="1" max="8" class="rp-inp" />
        <button type="button" class="rp-btn rp-btn--ok" @click="applySetRound">OK</button>
      </div>
      <p class="rp-hint">При зміні раунду голоси очищаються. Вибуті та персонажі не чіпаються.</p>
    </div>
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
  margin: 0 0 0.5rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.5);
  font-family: 'Orbitron', sans-serif;
}

.rp-now {
  margin: 0 0 0.65rem;
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.85);
}

.rp-now__big {
  display: block;
  font-family: 'Orbitron', sans-serif;
  font-size: 1.05rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: #e9d5ff;
}

.rp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 0.85rem;
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

.rp-btn--next {
  background: rgba(22, 101, 52, 0.4);
  border-color: rgba(74, 222, 128, 0.4);
  color: #bbf7d0;
}

.rp-btn--reset {
  background: rgba(80, 20, 30, 0.5);
  border-color: rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.rp-set {
  padding-top: 0.35rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.rp-lab {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.4);
}

.rp-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.rp-inp {
  width: 4.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.4);
  color: #f1f5f9;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.85rem;
}

.rp-btn--ok {
  background: rgba(88, 28, 135, 0.55);
  border-color: rgba(168, 85, 247, 0.55);
  color: #faf5ff;
}

.rp-hint {
  margin: 0.5rem 0 0;
  font-size: 0.62rem;
  line-height: 1.45;
  color: rgba(148, 163, 184, 0.7);
}
</style>
