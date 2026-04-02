<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
  speakingDuration: { type: [Number, String], default: 30 },
  phaseOptions: { type: Array, default: () => [] },
  roomRound: { type: Number, default: 1 },
})

const emit = defineEmits([
  'update:speakingDuration',
  'start-round',
  'pause-show',
  'reset-room',
  'set-phase',
  'start-timer',
  'pause-timer',
  'resume-timer',
  'clear-timer',
  'next-speaker',
])

function slotNum(slot) {
  const s = String(slot ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

const phaseLabel = computed(() => String(props.gameRoom?.gamePhase || 'intro'))

const votingOn = computed(() => Boolean(props.gameRoom?.voting?.active))

const statusRibbon = computed(() => {
  const ph = phaseLabel.value.toUpperCase()
  const sp = String(props.gameRoom?.currentSpeaker ?? '').trim() || '—'
  const v = votingOn.value ? 'VOTING ON' : 'VOTING OFF'
  return `${ph} · R${props.roomRound} · ${sp} · ${v}`
})
</script>

<template>
  <section class="cc">
    <h2 class="cc-title">LIVE</h2>

    <p class="cc-ribbon" role="status">{{ statusRibbon }}</p>

    <div class="cc-pult">
      <div class="cc-pult__act">
        <span class="cc-lab">Шоу</span>
        <div class="cc-btns">
          <button type="button" class="cc-btn cc-btn--go" @click="emit('start-round')">Start</button>
          <button type="button" class="cc-btn cc-btn--pause" @click="emit('pause-show')">Pause</button>
          <button type="button" class="cc-btn cc-btn--reset" @click="emit('reset-room')">Reset</button>
        </div>
        <span class="cc-lab cc-lab--mt">Timer</span>
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
        <p v-if="gameRoom.timerPaused" class="cc-pause-only">таймер на паузі</p>
      </div>
    </div>

    <div class="cc-footer">
      <div class="cc-block cc-block--phase">
        <span class="cc-lab">Фаза</span>
        <div class="cc-chips">
          <button
            v-for="ph in phaseOptions"
            :key="ph"
            type="button"
            class="chip chip--phase"
            :class="{ on: phaseLabel === ph }"
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
  background: var(--bg-card-solid);
  border: 1px solid var(--border-strong);
  box-shadow: 0 0 48px var(--accent-glow);
  margin-bottom: 1rem;
}

.cc-title {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
  font-family: 'Orbitron', sans-serif;
}

.cc-ribbon {
  margin: 0 0 0.75rem;
  padding: 0.42rem 0.55rem;
  border-radius: 8px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  line-height: 1.35;
  color: var(--text-body);
  background: var(--bg-muted-strong);
  border: 1px solid var(--border);
  font-family: 'Orbitron', sans-serif;
  word-break: break-word;
}

.cc-pult {
  margin-bottom: 0.85rem;
}

.cc-pult__act {
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  background: var(--bg-muted);
  border: 1px solid var(--border-subtle);
}

.cc-footer {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-subtle);
}

.cc-block--phase {
  padding-bottom: 0.15rem;
}

.cc-lab {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.cc-lab--mt {
  margin-top: 0.45rem;
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
  transition:
    transform 0.12s ease,
    box-shadow 0.15s ease;
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

.cc-btn--next {
  padding: 0.32rem 0.6rem;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  border: 1px solid rgba(74, 222, 128, 0.45);
  background: rgba(22, 101, 52, 0.35);
  color: #bbf7d0;
  transition: transform 0.12s ease;
}

.cc-btn--next:hover {
  transform: scale(1.04);
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

.cc-pause-only {
  margin: 0.35rem 0 0;
  font-size: 0.65rem;
  font-weight: 700;
  color: #fcd34d;
  letter-spacing: 0.04em;
}
</style>
