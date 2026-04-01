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
  <section class="host-tools">
    <h2 class="block-title">Control Center</h2>
    <div class="row-actions">
      <button type="button" class="btn-primary" @click="emit('start-round')">Start round</button>
      <button type="button" class="btn-amber" @click="emit('pause-show')">Pause</button>
      <button type="button" class="btn-danger" @click="emit('reset-room')">Reset</button>
    </div>

    <p class="micro-label">Speaker</p>
    <div class="chip-row">
      <button
        v-for="slot in playerSlots"
        :key="'spk-' + slot"
        type="button"
        class="chip chip-slot"
        :class="{ on: String(gameRoom.currentSpeaker || '').trim() === slot }"
        @click="emit('set-speaker', slot)"
      >
        {{ slotNum(slot) }}
      </button>
    </div>

    <p class="micro-label">Timer</p>
    <div class="chip-row">
      <button
        v-for="sec in [30, 60, 90]"
        :key="'d-' + sec"
        type="button"
        class="chip"
        :class="{ on: Number(speakingDuration) === sec }"
        @click="emit('update:speakingDuration', sec)"
      >
        {{ sec }}s
      </button>
    </div>
    <div class="row-actions tight">
      <button type="button" class="btn-primary wide" @click="emit('start-timer')">Start</button>
      <button type="button" class="btn-soft" @click="emit('pause-timer')">Pause</button>
      <button type="button" class="btn-soft" @click="emit('resume-timer')">Resume</button>
      <button type="button" class="btn-soft" @click="emit('clear-timer')">Reset</button>
    </div>
    <p class="hint-line">
      Зараз говорить:
      <strong>{{ String(gameRoom.currentSpeaker || '').trim() || '—' }}</strong>
      <span v-if="gameRoom.timerPaused" class="paused">· на паузі</span>
    </p>

    <p class="micro-label">Spotlight (оверлей)</p>
    <div class="chip-row">
      <button
        v-for="slot in playerSlots"
        :key="'sp-' + slot"
        type="button"
        class="chip chip-sp"
        :class="{ on: String(gameRoom.activePlayer || '') === slot }"
        @click="emit('spotlight', slot)"
      >
        {{ slotNum(slot) }}
      </button>
      <button type="button" class="btn-soft" @click="emit('spotlight-clear')">Вимкнути</button>
    </div>

    <p class="micro-label">Фаза шоу</p>
    <div class="chip-row">
      <button
        v-for="ph in phaseOptions"
        :key="ph"
        type="button"
        class="chip"
        :class="{ on: String(gameRoom.gamePhase || 'intro') === ph }"
        @click="emit('set-phase', ph)"
      >
        {{ ph }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.host-tools {
  padding: 1.15rem 1.25rem;
  border-radius: 20px;
  background: rgba(10, 8, 22, 0.72);
  border: 1px solid rgba(168, 85, 247, 0.22);
  margin-bottom: 1.25rem;
}

.block-title {
  margin: 0 0 0.85rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: #ede9fe;
  font-family: 'Orbitron', sans-serif;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.row-actions.tight {
  margin-top: 0.5rem;
  margin-bottom: 0.65rem;
}

.btn-primary,
.btn-amber,
.btn-danger,
.btn-soft {
  padding: 0.55rem 1rem;
  border-radius: 12px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-primary {
  background: rgba(88, 28, 135, 0.45);
  border-color: rgba(168, 85, 247, 0.45);
  color: #f5f3ff;
}

.btn-primary.wide {
  flex: 1;
  min-width: 100px;
}

.btn-amber {
  background: rgba(120, 53, 15, 0.4);
  border-color: rgba(251, 191, 36, 0.35);
  color: #fef3c7;
}

.btn-danger {
  background: rgba(80, 20, 30, 0.45);
  border-color: rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.btn-soft {
  background: rgba(30, 27, 46, 0.9);
  border-color: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
}

.micro-label {
  margin: 0 0 0.35rem;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.45);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.65rem;
}

.chip {
  padding: 0.32rem 0.55rem;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.25);
  color: #cbd5e1;
  cursor: pointer;
}

.chip.on {
  border-color: rgba(168, 85, 247, 0.55);
  background: rgba(88, 28, 135, 0.38);
  color: #fff;
}

.chip-sp.on {
  border-color: rgba(251, 191, 36, 0.45);
  background: rgba(120, 53, 15, 0.35);
}

.hint-line {
  margin: 0 0 1rem;
  font-size: 0.8rem;
  color: rgba(186, 181, 200, 0.9);
}

.hint-line strong {
  color: #e9d5ff;
}

.paused {
  color: #fcd34d;
}
</style>
