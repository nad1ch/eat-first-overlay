<script setup>
defineProps({
  gameRoom: { type: Object, default: () => ({}) },
  playerSlots: { type: Array, default: () => [] },
  speakingDuration: { type: [Number, String], default: 30 },
  phaseOptions: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'update:speakingDuration',
  'start-round',
  'pause-show',
  'reset-room',
  'set-phase',
  'set-speaker',
  'start-timer',
  'pause-timer',
  'resume-timer',
  'clear-timer',
  'spotlight',
  'spotlight-clear',
])

function slotNum(slot) {
  const s = String(slot ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}
</script>

<template>
  <section class="cc">
    <h2 class="cc-title">Control Center</h2>

    <div class="cc-grid">
      <div class="cc-block cc-block--actions">
        <span class="cc-lab">Шоу</span>
        <div class="cc-btns">
          <button type="button" class="cc-btn cc-btn--go" @click="emit('start-round')">Start</button>
          <button type="button" class="cc-btn cc-btn--pause" @click="emit('pause-show')">Pause</button>
          <button type="button" class="cc-btn cc-btn--reset" @click="emit('reset-room')">Reset</button>
        </div>
      </div>

      <div class="cc-block">
        <span class="cc-lab">🎤 Speaker</span>
        <div class="cc-chips">
          <button
            v-for="slot in playerSlots"
            :key="'spk-' + slot"
            type="button"
            class="chip"
            :class="{ on: String(gameRoom.currentSpeaker || '').trim() === slot }"
            @click="emit('set-speaker', slot)"
          >
            {{ slotNum(slot) }}
          </button>
        </div>
      </div>

      <div class="cc-block">
        <span class="cc-lab">⏱ Timer</span>
        <div class="cc-row">
          <div class="cc-chips">
            <button
              v-for="sec in [30, 60, 90]"
              :key="'d-' + sec"
              type="button"
              class="chip"
              :class="{ on: Number(speakingDuration) === sec }"
              @click="emit('update:speakingDuration', sec)"
            >
              {{ sec }}
            </button>
          </div>
          <div class="cc-timer-actions">
            <button type="button" class="cc-btn cc-btn--primary" @click="emit('start-timer')">Start</button>
            <button type="button" class="cc-btn cc-btn--ghost" @click="emit('pause-timer')">‖</button>
            <button type="button" class="cc-btn cc-btn--ghost" @click="emit('resume-timer')">▶</button>
            <button type="button" class="cc-btn cc-btn--ghost" @click="emit('clear-timer')">↺</button>
          </div>
        </div>
        <p class="cc-hint">
          {{ String(gameRoom.currentSpeaker || '').trim() || '—' }}
          <span v-if="gameRoom.timerPaused" class="cc-paused">· пауза</span>
        </p>
      </div>

      <div class="cc-block">
        <span class="cc-lab">⭐ Spotlight</span>
        <div class="cc-chips">
          <button
            v-for="slot in playerSlots"
            :key="'sp-' + slot"
            type="button"
            class="chip chip--gold"
            :class="{ on: String(gameRoom.activePlayer || '') === slot }"
            @click="emit('spotlight', slot)"
          >
            {{ slotNum(slot) }}
          </button>
          <button type="button" class="cc-btn cc-btn--ghost cc-btn--xs" @click="emit('spotlight-clear')">×</button>
        </div>
      </div>

      <div class="cc-block cc-block--phase">
        <span class="cc-lab">Фаза</span>
        <div class="cc-chips">
          <button
            v-for="ph in phaseOptions"
            :key="ph"
            type="button"
            class="chip chip--phase"
            :class="{ on: String(gameRoom.gamePhase || 'intro') === ph }"
            @click="emit('set-phase', ph)"
          >
            {{ ph }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cc {
  padding: 1rem 1.1rem 1.15rem;
  border-radius: 16px;
  background: rgba(8, 4, 20, 0.92);
  border: 1px solid rgba(168, 85, 247, 0.35);
  box-shadow: 0 0 40px rgba(168, 85, 247, 0.08);
  margin-bottom: 1rem;
}

.cc-title {
  margin: 0 0 0.85rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.cc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.85rem 1rem;
  align-items: start;
}

@media (min-width: 720px) {
  .cc-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1000px) {
  .cc-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.cc-block--actions {
  grid-column: 1 / -1;
}

@media (min-width: 720px) {
  .cc-block--actions {
    grid-column: span 1;
  }
}

.cc-block--phase {
  grid-column: 1 / -1;
}

.cc-lab {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.45);
}

.cc-btns,
.cc-timer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.cc-row {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.cc-btn {
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 0.12s ease;
}

.cc-btn:hover {
  transform: scale(1.04);
}

.cc-btn--go {
  background: rgba(88, 28, 135, 0.55);
  border-color: rgba(168, 85, 247, 0.55);
  color: #faf5ff;
}

.cc-btn--pause {
  background: rgba(120, 53, 15, 0.45);
  border-color: rgba(251, 191, 36, 0.35);
  color: #fef3c7;
}

.cc-btn--reset {
  background: rgba(80, 20, 30, 0.5);
  border-color: rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.cc-btn--primary {
  background: rgba(168, 85, 247, 0.35);
  border-color: rgba(168, 85, 247, 0.55);
  color: #fff;
}

.cc-btn--ghost {
  background: rgba(0, 0, 0, 0.35);
  border-color: rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  min-width: 2.25rem;
}

.cc-btn--xs {
  padding: 0.35rem 0.55rem;
  font-size: 1rem;
  line-height: 1;
}

.cc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.chip {
  min-width: 2rem;
  padding: 0.3rem 0.5rem;
  border-radius: 8px;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.35);
  color: #cbd5e1;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.chip:hover {
  transform: scale(1.06);
}

.chip.on {
  border-color: rgba(168, 85, 247, 0.65);
  background: rgba(168, 85, 247, 0.25);
  color: #fff;
  box-shadow: 0 0 14px rgba(168, 85, 247, 0.35);
}

.chip--gold.on {
  border-color: rgba(251, 191, 36, 0.55);
  background: rgba(120, 53, 15, 0.4);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.2);
}

.chip--phase.on {
  border-color: rgba(129, 140, 248, 0.5);
  background: rgba(49, 46, 129, 0.4);
}

.cc-hint {
  margin: 0.35rem 0 0;
  font-size: 0.68rem;
  color: rgba(186, 181, 200, 0.75);
}

.cc-paused {
  color: #fcd34d;
}
</style>
