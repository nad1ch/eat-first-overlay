<script setup>
import { computed } from 'vue'
import { hostControlChromeStore as store } from '../../composables/hostControlChrome.js'

function slotNum(slot) {
  const s = String(slot ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

function choiceGlyph(c) {
  return c === 'against' ? '👎' : '👍'
}

const lines = computed(() =>
  (store.votesLive || []).map((v) => ({
    voterId: v.id,
    label: `${slotNum(v.id)} → ${slotNum(v.targetPlayer)} ${choiceGlyph(v.choice)}`,
  })),
)

const roundNow = computed(() =>
  Math.min(8, Math.max(1, Math.floor(Number(store.gameRoom?.round) || 1))),
)

const canDec = computed(() => roundNow.value > 1)
const canInc = computed(() => roundNow.value < 8)

const targetPlayerId = computed(() => String(store.gameRoom?.voting?.targetPlayer ?? '').trim())

const votingActive = computed(() => Boolean(store.gameRoom?.voting?.active))

const canStart = computed(() => Boolean(targetPlayerId.value) && !votingActive.value)

const countFor = computed(() => (store.votesLive || []).filter((v) => v.choice !== 'against').length)

const countAgainst = computed(() => (store.votesLive || []).filter((v) => v.choice === 'against').length)

const showLiveScore = computed(() => countFor.value + countAgainst.value > 0)

const phaseLabel = computed(() => String(store.gameRoom?.gamePhase || 'intro'))

const raisedHandSlots = computed(() => {
  const h = store.gameRoom?.hands
  if (!h || typeof h !== 'object') return []
  return Object.keys(h)
    .filter((k) => h[k] === true)
    .sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }),
    )
})

function act(name, ...args) {
  const fn = store.actions?.[name]
  if (typeof fn === 'function') fn(...args)
}
</script>

<template>
  <div class="hcc" :class="{ 'hcc--vote-on': votingActive }">
    <div class="hcc-split">
      <aside class="hcc-left">
        <p class="hcc-summary" role="status" :title="store.summaryLine">{{ store.summaryLine }}</p>
        <p v-if="raisedHandSlots.length" class="hcc-hands-row" role="status">
          ✋ Підняті:
          <strong>{{ raisedHandSlots.map(slotNum).join(', ') }}</strong>
        </p>

        <div class="hcc-left-round">
          <span class="hcc-left-lab">Раунд</span>
          <div class="hcc-round">
            <button
              type="button"
              class="hcc-step"
              :disabled="!canDec"
              aria-label="Мінус раунд"
              @click="act('roundDelta', -1)"
            >
              −
            </button>
            <span class="hcc-round__mid">R{{ roundNow }}</span>
            <button
              type="button"
              class="hcc-step"
              :disabled="!canInc"
              aria-label="Плюс раунд"
              @click="act('roundDelta', 1)"
            >
              +
            </button>
          </div>
        </div>

        <p class="hcc-left-lab hcc-left-lab--spaced">Шоу</p>
        <div class="hcc-show-btns">
          <button type="button" class="hcc-btn-sm hcc-btn-sm--go" @click="act('startRound')">Start</button>
          <button type="button" class="hcc-btn-sm hcc-btn-sm--pause" @click="act('pauseShow')">Pause</button>
          <button type="button" class="hcc-btn-sm hcc-btn-sm--reset" @click="act('resetRoom')">Reset</button>
        </div>

        <p class="hcc-left-lab hcc-left-lab--spaced">Фаза</p>
        <div class="hcc-phase-chips">
          <button
            v-for="ph in store.phaseOptions"
            :key="ph"
            type="button"
            class="hcc-chip hcc-chip--phase"
            :class="{ on: phaseLabel === ph }"
            @click="act('setPhase', ph)"
          >
            {{ ph }}
          </button>
        </div>

        <button type="button" class="hcc-clear-hands" @click="act('clearHands')">Скинути підняті руки ✋</button>
      </aside>

      <div class="hcc-right">
        <section class="hcc-panel hcc-panel--vote" aria-label="Голосування">
          <h3 class="hcc-panel-title">Голосування</h3>
          <div class="hcc-target-block">
            <span class="hcc-target-block__lbl">Ціль</span>
            <strong class="hcc-target-block__id">{{ targetPlayerId || '—' }}</strong>
          </div>
          <div class="hcc-vote-big">
            <button
              type="button"
              class="hcc-btn-xl hcc-btn-xl--go"
              :disabled="!canStart"
              title="Почати голосування"
              @click="act('votingStart')"
            >
              ▶ Старт
            </button>
            <button
              type="button"
              class="hcc-btn-xl hcc-btn-xl--stop"
              :disabled="!votingActive"
              title="Завершити голосування"
              @click="act('votingFinish')"
            >
              ■ Стоп
            </button>
          </div>
          <details class="hcc-live">
            <summary class="hcc-live__sum">
              Live
              <template v-if="showLiveScore">
                <span class="hcc-live__sc">👍 {{ countFor }}</span>
                <span class="hcc-live__sc">👎 {{ countAgainst }}</span>
              </template>
              <span v-else class="hcc-live__empty">· 0</span>
            </summary>
            <p v-if="store.allPlayersVoted && votingActive" class="hcc-all">ВСІ ПРОГОЛОСУВАЛИ</p>
            <p v-if="!targetPlayerId && !votingActive" class="hcc-hint">Ціль — у панелі гравця</p>
            <ul v-if="lines.length" class="hcc-list">
              <li v-for="row in lines" :key="row.voterId" class="hcc-li">
                <span>{{ row.label }}</span>
                <button type="button" class="hcc-rm" @click="act('removeVote', row.voterId)">×</button>
              </li>
            </ul>
            <p v-else-if="votingActive" class="hcc-no-v">Немає голосів</p>
          </details>
        </section>

        <section class="hcc-panel hcc-panel--timer" aria-label="Таймер">
          <h3 class="hcc-panel-title">Таймер</h3>
          <div class="hcc-timer-dur">
            <button
              v-for="sec in [30, 60, 90]"
              :key="'d-' + sec"
              type="button"
              class="hcc-chip-xl"
              :class="{ on: Number(store.speakingDuration) === sec }"
              @click="act('setSpeakingDuration', sec)"
            >
              {{ sec }}s
            </button>
          </div>
          <div class="hcc-timer-big">
            <button type="button" class="hcc-btn-xl hcc-btn-xl--primary" @click="act('startTimer')">▶ Таймер</button>
            <button type="button" class="hcc-btn-xl hcc-btn-xl--ghost" @click="act('pauseTimer')">‖</button>
            <button type="button" class="hcc-btn-xl hcc-btn-xl--ghost" @click="act('resumeTimer')">▶</button>
            <button type="button" class="hcc-btn-xl hcc-btn-xl--ghost" @click="act('clearTimer')">↺</button>
            <button type="button" class="hcc-btn-xl hcc-btn-xl--next" @click="act('nextSpeaker')">Next</button>
          </div>
          <p v-if="store.gameRoom?.timerPaused" class="hcc-pause-note">Таймер на паузі</p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hcc {
  width: 100%;
  padding: 0.25rem 0 0;
  border-top: none;
  transition:
    box-shadow 0.25s ease,
    border-color 0.25s ease;
}

.hcc--vote-on {
  box-shadow: none;
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
}

.hcc-split {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1rem 1.85rem;
}

.hcc-left {
  flex: 0 1 280px;
  max-width: 100%;
  padding: 0.5rem 0.85rem 0.5rem 0;
  border-right: 1px solid var(--border-subtle);
  margin-right: 0.45rem;
}

@media (max-width: 800px) {
  .hcc-left {
    flex: 1 1 100%;
    border-right: none;
    margin-right: 0;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--border-subtle);
  }
}

.hcc-hands-row {
  margin: 0 0 0.5rem;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  line-height: 1.35;
}

.hcc-hands-row strong {
  color: var(--text-highlight);
  font-family: 'Orbitron', sans-serif;
  font-weight: 800;
}

.hcc-summary {
  margin: 0 0 0.55rem;
  padding: 0.28rem 0.45rem;
  border-radius: 8px;
  background: var(--bg-muted);
  border: 1px solid var(--border-subtle);
  font-size: 0.54rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.35;
  color: var(--text-body);
  font-family: 'Orbitron', sans-serif;
  overflow-x: auto;
  white-space: nowrap;
}

.hcc-left-lab {
  margin: 0 0 0.2rem;
  font-size: 0.48rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.hcc-left-lab--spaced {
  margin-top: 0.62rem;
}

.hcc-left-round {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.hcc-round {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.hcc-step {
  min-width: 1.6rem;
  height: 1.6rem;
  border-radius: 7px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--border-input);
  background: var(--reveal-bg);
  color: var(--text-body);
}

.hcc-step:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.hcc-round__mid {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.8rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  color: var(--text-title);
  min-width: 2rem;
  text-align: center;
}

.hcc-show-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
}

.hcc-target-block__id {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.35rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--text-highlight);
}

.hcc-btn-sm {
  padding: 0.28rem 0.5rem;
  border-radius: 7px;
  font-size: 0.62rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
}

.hcc-btn-sm--go {
  background: var(--accent-fill);
  border-color: var(--border-strong);
  color: var(--text-title);
}

.hcc-btn-sm--pause {
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.35);
  color: var(--text-highlight);
}

.hcc-btn-sm--reset {
  background: var(--reveal-off-bg);
  border-color: var(--reveal-off-border);
  color: var(--reveal-off-text);
}

.hcc-phase-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.22rem;
}

.hcc-chip {
  padding: 0.18rem 0.4rem;
  border-radius: 6px;
  font-size: 0.55rem;
  font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  text-transform: lowercase;
  border: 1px solid var(--border-input);
  background: var(--bg-muted);
  color: var(--text-body);
  cursor: pointer;
}

.hcc-chip.on {
  border-color: var(--border-strong);
  background: var(--accent-fill-soft);
  color: var(--text-title);
}

.hcc-chip--phase.on {
  border-color: var(--border-cyan-strong);
  background: var(--glow-vote-inner);
}

.hcc-clear-hands {
  margin-top: 0.55rem;
  width: 100%;
  padding: 0.32rem 0.45rem;
  border-radius: 8px;
  font-size: 0.58rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--border-input);
  background: var(--bg-muted);
  color: var(--text-body);
}

.hcc-clear-hands:hover {
  border-color: rgba(251, 191, 36, 0.45);
  color: var(--text-highlight);
}

.hcc-right {
  flex: 1 1 420px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
  min-width: min(100%, 320px);
}

@media (max-width: 720px) {
  .hcc-right {
    grid-template-columns: 1fr;
  }
}

.hcc-panel {
  padding: 0.65rem 0.75rem 0.75rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--bg-muted);
  box-shadow: 0 2px 12px var(--shadow-elevated);
}

.hcc-panel-title {
  margin: 0 0 0.4rem;
  font-size: 0.52rem;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: var(--text-muted);
}

.hcc-target-block {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 0.45rem;
  padding: 0.35rem 0.45rem;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--bg-card-solid);
}

.hcc-target-block__lbl {
  font-size: 0.48rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--text-muted);
}

.hcc-vote-big {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.hcc-btn-xl {
  flex: 1 1 auto;
  min-width: 5.5rem;
  padding: 0.55rem 0.75rem;
  border-radius: 11px;
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
  border: 2px solid transparent;
}

.hcc-btn-xl:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.hcc-btn-xl--go {
  border-color: var(--reveal-on-border);
  background: var(--reveal-on-bg);
  color: var(--reveal-on-text);
}

.hcc-btn-xl--stop {
  border-color: var(--reveal-off-border);
  background: var(--reveal-off-bg);
  color: var(--reveal-off-text);
}

.hcc-btn-xl--primary {
  border-color: var(--border-strong);
  background: var(--accent-fill);
  color: var(--text-title);
}

.hcc-btn-xl--ghost {
  flex: 0 0 auto;
  min-width: 2.75rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  border-color: var(--border-input);
  background: var(--bg-card-solid);
  color: var(--text-body);
  font-size: 0.95rem;
}

.hcc-btn-xl--next {
  border-color: var(--reveal-on-border);
  background: var(--reveal-on-bg);
  color: var(--reveal-on-text);
  font-size: 0.72rem;
}

.hcc-timer-dur {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.45rem;
}

.hcc-chip-xl {
  min-width: 3.2rem;
  padding: 0.42rem 0.55rem;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 800;
  font-family: 'Orbitron', sans-serif;
  border: 2px solid var(--border-input);
  background: var(--bg-card-solid);
  color: var(--text-body);
  cursor: pointer;
}

.hcc-chip-xl.on {
  border-color: var(--border-strong);
  background: var(--accent-fill-soft);
  color: var(--text-title);
}

.hcc-timer-big {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.hcc-timer-big .hcc-btn-xl--primary {
  flex: 1 1 100%;
  min-width: 0;
}

.hcc-pause-note {
  margin: 0.4rem 0 0;
  font-size: 0.62rem;
  font-weight: 800;
  color: var(--text-highlight);
}

.hcc-live {
  border: 1px solid var(--border-cyan);
  border-radius: 10px;
  padding: 0.25rem 0.4rem 0.4rem;
  background: var(--bg-obs-hint);
}

.hcc-live__sum {
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--text-cyan);
  cursor: pointer;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}

.hcc-live__sum::-webkit-details-marker {
  display: none;
}

.hcc-live__sc {
  font-family: 'Orbitron', sans-serif;
  color: var(--text-body);
}

.hcc-live__empty {
  color: var(--text-muted);
  font-weight: 600;
}

.hcc-all {
  margin: 0.2rem 0 0;
  font-size: 0.5rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: var(--reveal-on-text);
}

.hcc-hint {
  margin: 0.2rem 0 0;
  font-size: 0.52rem;
  color: var(--text-highlight);
  font-weight: 600;
}

.hcc-list {
  list-style: none;
  margin: 0.2rem 0 0;
  padding: 0;
  max-height: 5rem;
  overflow-y: auto;
}

.hcc-li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.55rem;
  font-family: 'Orbitron', sans-serif;
  color: var(--text-body);
  padding: 0.1rem 0;
  border-bottom: 1px solid var(--border-subtle);
}

.hcc-rm {
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 5px;
  border: 1px solid var(--reveal-off-border);
  background: var(--reveal-off-bg);
  color: var(--reveal-off-text);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 0.75rem;
  line-height: 1;
}

.hcc-no-v {
  margin: 0.15rem 0 0;
  font-size: 0.52rem;
  color: var(--text-muted);
}
</style>
