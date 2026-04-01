<script setup>
import { computed } from 'vue'
import { fieldConfig } from '../characterState'

const HUD_LEFT = ['profession', 'health', 'phobia']
const HUD_RIGHT = ['luggage', 'fact', 'quirk']

const props = defineProps({
  player: { type: Object, required: true },
  /** Spotlight (activePlayer) */
  isSpotlight: { type: Boolean, default: false },
  /** Таймер лише для currentSpeaker */
  isTimerTarget: { type: Boolean, default: false },
  solo: { type: Boolean, default: false },
  cinema: { type: Boolean, default: false },
  speakerTimeLeft: { type: Number, default: undefined },
  speakerTimerTotal: { type: Number, default: 30 },
  drama: { type: Boolean, default: false },
})

const labelByKey = computed(() =>
  Object.fromEntries(fieldConfig.map((f) => [f.key, f.label])),
)

function chunkFor(player, key) {
  const c = player[key]
  if (c && typeof c === 'object') return c
  return { value: '', revealed: false }
}

function statDisplay(player, fieldKey) {
  const c = chunkFor(player, fieldKey)
  if (!c.revealed) return { mode: 'label', text: labelByKey.value[fieldKey] }
  const v = String(c.value ?? '').trim()
  return { mode: 'value', text: v.length ? v : '—' }
}

function identityRevealed(player) {
  return player.identityRevealed === true
}

function displayNameLine(player) {
  if (!identityRevealed(player)) return { hidden: true, text: '' }
  const n = String(player.name ?? '').trim()
  return { hidden: false, text: n.length ? n : '—' }
}

function displayAgeGenderLine(player) {
  if (!identityRevealed(player)) return { hidden: true, text: '' }
  const a = String(player.age ?? '').trim()
  const g = String(player.gender ?? '').trim()
  const left = a.length ? a : '—'
  const right = g.length ? g : '—'
  return { hidden: false, text: `${left} · ${right}` }
}

function isEliminated(player) {
  return player.eliminated === true
}

function valueRevealKey(player, rowKey) {
  const r = chunkFor(player, rowKey).revealed
  return `${player.id}-${rowKey}-${r ? 'open' : 'closed'}`
}

function playerIdDisplay(player) {
  const id = String(player.id ?? '')
  const m = id.match(/^p(\d+)$/i)
  if (m) return m[1]
  return id.replace(/^p/i, '')
}

function activeCardFrom(player) {
  const ac = player.activeCard
  if (!ac || typeof ac !== 'object') {
    return { title: '', description: '', used: false }
  }
  return {
    title: String(ac.title ?? '').trim(),
    description: String(ac.description ?? '').trim(),
    used: Boolean(ac.used),
  }
}

const showSpeakerTimer = computed(
  () => props.isTimerTarget && typeof props.speakerTimeLeft === 'number',
)

const ringPct = computed(() => {
  if (!showSpeakerTimer.value) return 0
  const total = Math.max(1, props.speakerTimerTotal || 30)
  const left = Math.max(0, props.speakerTimeLeft)
  return Math.min(100, (left / total) * 100)
})

const timerRingStyle = computed(() => {
  const pct = ringPct.value
  return {
    background: `conic-gradient(#a855f7 ${pct}%, rgba(255,255,255,0.12) 0)`,
    WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
    mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
  }
})

const acChipTitle = computed(() => {
  const t = activeCardFrom(props.player).title
  if (!t) return 'Карта'
  return t.length > 22 ? `${t.slice(0, 20)}…` : t
})
</script>

<template>
  <article
    v-if="!solo"
    class="card-grid"
    :class="{
      'card-grid--spotlight': isSpotlight,
      'card-grid--timer': isTimerTarget,
      'card-grid--eliminated': isEliminated(player),
      'card-grid--cinema': cinema,
    }"
  >
    <Transition name="badge-pop">
      <div v-if="isEliminated(player)" class="eliminated-badge" aria-hidden="true">ВИБУВ</div>
    </Transition>
    <div v-if="showSpeakerTimer" class="card-grid-timer" aria-hidden="true">
      <div class="timer-ring-wrap">
        <span class="timer-ring" :style="timerRingStyle" />
        <span class="timer-num">⏱ {{ speakerTimeLeft }}s</span>
      </div>
    </div>
    <div
      class="card-grid-body"
      :class="{ 'card-grid-body--eliminated': isEliminated(player) }"
    >
      <p class="card-grid-id">{{ playerIdDisplay(player) }}</p>
      <h2 class="card-grid-name">
        <span v-if="!identityRevealed(player)" class="placeholder">•••</span>
        <span v-else>{{ displayNameLine(player).text }}</span>
      </h2>
      <p class="card-grid-meta">
        <span v-if="!identityRevealed(player)" class="placeholder">••• · •••</span>
        <span v-else>{{ displayAgeGenderLine(player).text }}</span>
      </p>
      <ul class="stats">
        <li v-for="row in fieldConfig" :key="row.key">
          <span
            :key="valueRevealKey(player, row.key)"
            class="stat-cell"
            :class="{
              'stat-cell--open': chunkFor(player, row.key).revealed,
              'stat-cell--wave': chunkFor(player, row.key).revealed,
              'stat-cell--drama': drama && chunkFor(player, row.key).revealed,
            }"
          >
            <template v-if="!chunkFor(player, row.key).revealed">
              {{ labelByKey[row.key] }}
            </template>
            <template v-else>
              {{ statDisplay(player, row.key).text }}
            </template>
          </span>
        </li>
      </ul>
    </div>
  </article>

  <div
    v-else
    class="hud-root hud-root--solo"
    :class="{
      'hud-root--eliminated': isEliminated(player),
      'hud-root--spotlight': isSpotlight,
      'hud-root--cinema': cinema,
      'hud-root--drama': drama,
    }"
  >
    <Transition name="badge-pop">
      <div v-if="isEliminated(player)" class="hud-eliminated-badge" aria-hidden="true">ВИБУВ</div>
    </Transition>

    <div
      v-if="solo && (activeCardFrom(player).title || activeCardFrom(player).description)"
      class="ac-chip"
      :class="{ 'ac-chip--used': activeCardFrom(player).used }"
      :title="activeCardFrom(player).description || activeCardFrom(player).title"
    >
      <span class="ac-chip-ico">🃏</span>
      <span class="ac-chip-t">{{ acChipTitle }}</span>
    </div>

    <div class="hud-zones">
      <div class="hud-block hud-tl">
        <p class="hud-line hud-line--name">
          <span v-if="!identityRevealed(player)" class="hud-ph">•••</span>
          <span v-else>{{ displayNameLine(player).text }}</span>
        </p>
        <p class="hud-line hud-line--sub">
          <span v-if="!identityRevealed(player)" class="hud-ph">••• · •••</span>
          <span v-else>{{ displayAgeGenderLine(player).text }}</span>
        </p>
      </div>

      <div class="hud-block hud-tr">
        <span class="hud-slot">{{ playerIdDisplay(player) }}</span>
        <div v-if="showSpeakerTimer" class="hud-timer-stack">
          <div class="hud-ring-wrap">
            <span class="hud-ring" :style="timerRingStyle" />
            <span class="hud-timer-label">⏱ {{ speakerTimeLeft }}s</span>
          </div>
        </div>
      </div>

      <div class="hud-block hud-bl">
        <div v-for="key in HUD_LEFT" :key="key" class="hud-stat">
          <span
            :key="valueRevealKey(player, key)"
            class="hud-stat-inner"
            :class="{
              'hud-stat-inner--open': chunkFor(player, key).revealed,
              'hud-stat-inner--wave': chunkFor(player, key).revealed,
              'hud-stat-inner--drama': drama && chunkFor(player, key).revealed,
            }"
          >
            <template v-if="!chunkFor(player, key).revealed">{{ labelByKey[key] }}</template>
            <template v-else>{{ statDisplay(player, key).text }}</template>
          </span>
        </div>
      </div>

      <div class="hud-block hud-br">
        <div v-for="key in HUD_RIGHT" :key="key" class="hud-stat">
          <span
            :key="valueRevealKey(player, key)"
            class="hud-stat-inner"
            :class="{
              'hud-stat-inner--open': chunkFor(player, key).revealed,
              'hud-stat-inner--wave': chunkFor(player, key).revealed,
              'hud-stat-inner--drama': drama && chunkFor(player, key).revealed,
            }"
          >
            <template v-if="!chunkFor(player, key).revealed">{{ labelByKey[key] }}</template>
            <template v-else>{{ statDisplay(player, key).text }}</template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-grid {
  position: relative;
  padding: 0;
  border-radius: 14px;
  background: rgba(12, 8, 28, 0.92);
  border: 1px solid rgba(168, 85, 247, 0.28);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  transition:
    transform 0.35s ease,
    box-shadow 0.35s ease,
    border-color 0.35s ease;
}

.card-grid--spotlight {
  transform: scale(1.03);
  border-color: rgba(168, 85, 247, 0.55);
  box-shadow:
    0 0 0 1px rgba(168, 85, 247, 0.35),
    0 0 24px rgba(168, 85, 247, 0.22);
}

.card-grid--timer {
  animation: timerPulse 1.4s ease-in-out infinite;
}

@keyframes timerPulse {
  0%,
  100% {
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
  }
  50% {
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.4),
      0 0 20px rgba(168, 85, 247, 0.2);
  }
}

.card-grid-timer {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  z-index: 3;
  pointer-events: none;
}

.timer-ring-wrap {
  position: relative;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
}

.timer-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transition: background 0.35s linear;
}

.timer-num {
  position: relative;
  z-index: 1;
  font-size: 0.62rem;
  font-weight: 800;
  color: #faf5ff;
  font-family: 'Orbitron', sans-serif;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.card-grid-body {
  padding: 0.85rem 0.95rem 1rem;
}

.card-grid-body--eliminated {
  opacity: 0.42;
  filter: grayscale(0.9);
}

.card-grid--eliminated {
  border-color: rgba(185, 28, 28, 0.45);
  background: rgba(28, 10, 16, 0.92);
}

.eliminated-badge {
  position: absolute;
  top: 0.45rem;
  left: 0.45rem;
  z-index: 2;
  padding: 0.15rem 0.4rem;
  border-radius: 6px;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #fecaca;
  background: rgba(70, 12, 18, 0.9);
  border: 1px solid rgba(248, 113, 113, 0.35);
  pointer-events: none;
}

.card-grid-id {
  margin: 0 0 0.2rem;
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  color: rgba(196, 181, 253, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.card-grid-name {
  margin: 0 0 0.15rem;
  font-size: clamp(0.95rem, 2vw, 1.05rem);
  font-weight: 700;
  color: #f5f3ff;
  line-height: 1.2;
}

.card-grid-meta {
  margin: 0 0 0.55rem;
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.88);
}

.placeholder {
  letter-spacing: 0.2em;
  color: rgba(196, 181, 253, 0.45);
}

.stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.stats li {
  margin: 0;
}

.stat-cell {
  display: block;
  padding: 0.38rem 0.5rem;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(196, 181, 253, 0.75);
  text-align: right;
  line-height: 1.35;
  transition:
    color 0.2s ease,
    border-color 0.2s ease;
}

.stat-cell--open {
  color: #f8fafc;
  border-color: rgba(168, 85, 247, 0.25);
  text-align: right;
}

.stat-cell--wave {
  animation: revealWave 0.55s ease-out;
}

.stat-cell--drama {
  animation: revealWave 0.85s ease-out;
}

@keyframes revealWave {
  0% {
    opacity: 0;
    filter: blur(8px);
    transform: scale(0.97);
  }
  45% {
    opacity: 1;
    filter: blur(0);
    transform: scale(1.02);
    text-shadow: 0 0 12px rgba(168, 85, 247, 0.45);
  }
  100% {
    opacity: 1;
    transform: scale(1);
    text-shadow: none;
  }
}

.badge-pop-enter-active,
.badge-pop-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.badge-pop-enter-from,
.badge-pop-leave-to {
  opacity: 0;
  transform: scale(0.88);
}

.hud-root {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: min(100vh, 100%);
  pointer-events: none;
  box-sizing: border-box;
  background: transparent;
}

.hud-root--spotlight .hud-block {
  border-color: rgba(168, 85, 247, 0.42);
  box-shadow: 0 0 18px rgba(168, 85, 247, 0.12);
}

.hud-eliminated-badge {
  position: absolute;
  top: 0.4rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
  padding: 0.2rem 0.55rem;
  border-radius: 8px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #fecaca;
  background: rgba(50, 10, 14, 0.88);
  border: 1px solid rgba(248, 113, 113, 0.35);
}

.ac-chip {
  position: absolute;
  bottom: clamp(0.55rem, 2vh, 1rem);
  left: 50%;
  transform: translateX(-50%);
  z-index: 7;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: min(88vw, 320px);
  padding: 0.28rem 0.55rem 0.28rem 0.4rem;
  border-radius: 999px;
  background: rgba(10, 6, 22, 0.92);
  border: 1px solid rgba(168, 85, 247, 0.38);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.ac-chip--used {
  opacity: 0.65;
  border-color: rgba(148, 163, 184, 0.35);
}

.ac-chip-ico {
  font-size: 0.75rem;
  line-height: 1;
}

.ac-chip-t {
  font-size: 0.68rem;
  font-weight: 700;
  color: #ede9fe;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hud-zones {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.hud-block {
  position: absolute;
  padding: 0.42rem 0.55rem;
  border-radius: 12px;
  background: rgba(8, 6, 20, 0.93);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(168, 85, 247, 0.28);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  max-width: min(40vw, 280px);
}

.hud-tl {
  top: clamp(0.45rem, 1.2vh, 1rem);
  left: clamp(0.45rem, 1.2vw, 1rem);
}

.hud-tr {
  top: clamp(0.45rem, 1.2vh, 1rem);
  right: clamp(0.45rem, 1.2vw, 1rem);
  text-align: right;
  max-width: min(38vw, 220px);
}

.hud-bl {
  bottom: clamp(0.45rem, 1.2vh, 1rem);
  left: clamp(0.45rem, 1.2vw, 1rem);
}

.hud-br {
  bottom: clamp(0.45rem, 1.2vh, 1rem);
  right: clamp(0.45rem, 1.2vw, 1rem);
  text-align: right;
}

.hud-line {
  margin: 0;
  color: #f5f3ff;
  line-height: 1.3;
}

.hud-line--name {
  font-size: clamp(0.95rem, 2.2vw, 1.15rem);
  font-weight: 700;
}

.hud-line--sub {
  margin-top: 0.2rem;
  font-size: clamp(0.78rem, 1.8vw, 0.88rem);
  color: rgba(226, 232, 240, 0.9);
}

.hud-ph {
  letter-spacing: 0.18em;
  color: rgba(196, 181, 253, 0.5);
}

.hud-slot {
  font-size: clamp(1.6rem, 4.5vw, 2.5rem);
  font-weight: 900;
  color: #faf5ff;
  font-family: 'Orbitron', sans-serif;
  line-height: 1;
  text-shadow: 0 0 14px rgba(168, 85, 247, 0.25);
}

.hud-timer-stack {
  margin-top: 0.4rem;
  display: flex;
  justify-content: flex-end;
}

.hud-ring-wrap {
  position: relative;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
}

.hud-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transition: background 0.3s linear;
}

.hud-timer-label {
  position: relative;
  z-index: 1;
  font-size: 0.65rem;
  font-weight: 800;
  font-family: 'Orbitron', sans-serif;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
}

.hud-stat {
  margin-bottom: 0.32rem;
}

.hud-stat:last-child {
  margin-bottom: 0;
}

.hud-stat-inner {
  display: block;
  padding: 0.32rem 0.45rem;
  border-radius: 10px;
  background: rgba(10, 6, 22, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: clamp(0.68rem, 1.6vw, 0.78rem);
  font-weight: 600;
  color: rgba(196, 181, 253, 0.78);
  line-height: 1.3;
}

.hud-br .hud-stat-inner {
  text-align: right;
}

.hud-stat-inner--open {
  color: #f8fafc;
  border-color: rgba(168, 85, 247, 0.28);
}

.hud-stat-inner--wave {
  animation: revealWave 0.55s ease-out;
}

.hud-stat-inner--drama {
  animation: revealWave 0.85s ease-out;
}

.hud-root--drama .hud-block {
  border-color: rgba(185, 28, 28, 0.22);
}
</style>
