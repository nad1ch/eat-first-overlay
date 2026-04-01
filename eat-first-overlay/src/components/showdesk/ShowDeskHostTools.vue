<script setup>
import { computed } from 'vue'

const props = defineProps({
  gameRoom: { type: Object, default: () => ({}) },
  playerSlots: { type: Array, default: () => [] },
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
  'set-speaker',
  'start-timer',
  'pause-timer',
  'resume-timer',
  'clear-timer',
  'spotlight',
  'spotlight-clear',
  'next-speaker',
])

function slotNum(slot) {
  const s = String(slot ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

const speakerSlot = computed(() => String(props.gameRoom?.currentSpeaker ?? '').trim())

const speakerLine = computed(() => (speakerSlot.value ? `[${speakerSlot.value}]` : '— НІХТО —'))

const phaseLabel = computed(() => String(props.gameRoom?.gamePhase || 'intro'))
</script>

<template>
  <section class="cc">
    <h2 class="cc-title">LIVE</h2>

    <div class="cc-pult">
      <aside class="cc-pult__state">
        <p class="cc-state-k">СТАН</p>
        <div class="cc-stat">
          <span class="cc-stat__k">PHASE</span>
          <b class="cc-stat__v">{{ phaseLabel }}</b>
        </div>
        <div class="cc-stat">
          <span class="cc-stat__k">ROUND</span>
          <b class="cc-stat__v">{{ roomRound }}</b>
        </div>
        <div class="cc-stat cc-stat--speaker">
          <span class="cc-stat__k">🎤 SPEAKER</span>
          <b class="cc-stat__v cc-stat__v--wide">{{ speakerLine }}</b>
          <button type="button" class="cc-clear" @click="emit('clear-timer')">✖ CLEAR</button>
        </div>
      </aside>

      <div class="cc-pult__act">
        <span class="cc-lab">Кнопки</span>
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
        <p class="cc-hint">
          {{ speakerSlot || '—' }}
          <span v-if="gameRoom.timerPaused" class="cc-paused">· пауза</span>
        </p>
      </div>
    </div>

    <div class="cc-footer">
      <div class="cc-block">
        <span class="cc-lab">Обрати спікера</span>
        <div class="cc-chips cc-chips--speaker">
          <button
            v-for="slot in playerSlots"
            :key="'spk-' + slot"
            type="button"
            class="chip"
            :class="{ on: speakerSlot === slot }"
            @click="emit('set-speaker', slot)"
          >
            {{ slotNum(slot) }}
          </button>
          <button
            type="button"
            class="cc-btn cc-btn--next"
            title="Наступний живий гравець + таймер 30s"
            @click="emit('next-speaker')"
          >
            Next ▶
          </button>
        </div>
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
  background: rgba(8, 4, 20, 0.92);
  border: 1px solid rgba(168, 85, 247, 0.35);
  box-shadow: 0 0 40px rgba(168, 85, 247, 0.08);
  margin-bottom: 1rem;
}

.cc-title {
  margin: 0 0 0.75rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.cc-pult {
  display: grid;
  gap: 0.85rem 1rem;
  margin-bottom: 0.85rem;
}

@media (min-width: 720px) {
  .cc-pult {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    align-items: start;
  }
}

.cc-pult__state {
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(168, 85, 247, 0.18);
}

.cc-state-k {
  margin: 0 0 0.5rem;
  font-size: 0.55rem;
  font-weight: 900;
  letter-spacing: 0.22em;
  color: rgba(196, 181, 253, 0.45);
  font-family: 'Orbitron', sans-serif;
}

.cc-stat {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.5rem;
  margin-bottom: 0.4rem;
}

.cc-stat--speaker {
  flex-direction: column;
  align-items: stretch;
  gap: 0.4rem;
}

.cc-stat__k {
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: rgba(148, 163, 184, 0.85);
  min-width: 5.5rem;
}

.cc-stat__v {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.88rem;
  font-weight: 800;
  color: #e9d5ff;
}

.cc-stat__v--wide {
  font-size: 0.95rem;
  letter-spacing: 0.04em;
}

.cc-clear {
  align-self: flex-start;
  padding: 0.32rem 0.55rem;
  border-radius: 8px;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  border: 1px solid rgba(248, 113, 113, 0.4);
  background: rgba(80, 20, 30, 0.45);
  color: #fecaca;
  transition: transform 0.12s ease;
}

.cc-clear:hover {
  transform: scale(1.05);
}

.cc-pult__act {
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.cc-footer {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
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
  color: rgba(196, 181, 253, 0.45);
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

.cc-chips--speaker {
  align-items: center;
}

.cc-btn--next {
  padding: 0.3rem 0.55rem;
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

.cc-hint {
  margin: 0.35rem 0 0;
  font-size: 0.68rem;
  color: rgba(186, 181, 200, 0.75);
}

.cc-paused {
  color: #fcd34d;
}
</style>
