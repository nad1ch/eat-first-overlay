<script setup>
import { computed, ref, watch } from 'vue'
import { fieldConfig } from '../characterState'

const HUD_LEFT = ['profession', 'health', 'phobia']
const HUD_RIGHT = ['luggage', 'fact', 'quirk']

const props = defineProps({
  player: { type: Object, required: true },
  /** Spotlight (activePlayer) */
  isSpotlight: { type: Boolean, default: false },
  /** Таймер лише для currentSpeaker */
  isTimerTarget: { type: Boolean, default: false },
  /** Глобальна сітка: затемнити, коли інший говорить */
  dimmed: { type: Boolean, default: false },
  solo: { type: Boolean, default: false },
  cinema: { type: Boolean, default: false },
  speakerTimeLeft: { type: Number, default: undefined },
  speakerTimerTotal: { type: Number, default: 30 },
  drama: { type: Boolean, default: false },
})

const labelByKey = computed(() =>
  Object.fromEntries(fieldConfig.map((f) => [f.key, f.label])),
)

/** Закрите поле в HUD: [ ПРОФЕСІЯ ] */
function fieldLabelUi(fieldKey) {
  const raw = labelByKey.value[fieldKey] ?? fieldKey
  return `[ ${String(raw).toLocaleUpperCase('uk')} ]`
}

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

/** Випадковий арт вибуття 1…12 */
const deathArtIndex = ref(null)

watch(
  () => props.player.id,
  () => {
    deathArtIndex.value = null
  },
)

watch(
  () => isEliminated(props.player),
  (elim) => {
    if (!elim) deathArtIndex.value = null
    else if (deathArtIndex.value === null) {
      deathArtIndex.value = Math.floor(Math.random() * 12) + 1
    }
  },
  { immediate: true },
)

const deathSvgSrc = computed(() => {
  const n = deathArtIndex.value ?? 1
  return `/overlay-eliminated-${n}.svg`
})

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

const timerUrgent = computed(() => {
  const t = props.speakerTimeLeft
  if (typeof t !== 'number') return false
  return t > 0 && t <= 5
})

const timerRingStyle = computed(() => {
  const pct = ringPct.value
  const urgent = timerUrgent.value
  const c = urgent ? '#ef4444' : '#a855f7'
  return {
    background: `conic-gradient(${c} ${pct}%, rgba(255,255,255,0.1) 0)`,
  }
})

const showActiveCardChip = computed(() => {
  const ac = activeCardFrom(props.player)
  if (ac.used) return false
  return Boolean(ac.title || ac.description)
})
</script>

<template>
  <article
    v-if="!solo"
    class="card-grid"
    :class="{
      'card-grid--spotlight': isSpotlight && !isEliminated(player),
      'card-grid--timer': isTimerTarget,
      'card-grid--eliminated': isEliminated(player),
      'card-grid--cinema': cinema,
      'card-grid--dimmed': dimmed && !isEliminated(player),
      'card-grid--speaker': isTimerTarget && !isEliminated(player),
    }"
  >
    <div v-if="isEliminated(player)" class="card-elim-screen card-elim-screen--cut">
      <img class="card-elim-screen__art" :src="deathSvgSrc" alt="" />
      <p class="card-elim-screen__title">ВИБУВ</p>
      <p class="card-elim-screen__hint">Слот закритий до кінця гри</p>
      <p class="card-elim-screen__slot">{{ playerIdDisplay(player) }}</p>
    </div>

    <template v-else>
      <div v-if="showSpeakerTimer" class="card-grid-timer" aria-hidden="true">
        <p v-if="isTimerTarget" class="card-speak-badge">ГОВОРИШ</p>
        <div class="timer-ring-wrap" :class="{ 'timer-ring-wrap--urgent': timerUrgent }">
          <span class="timer-ring" :style="timerRingStyle" />
          <span class="timer-num" :class="{ 'timer-num--urgent': timerUrgent }">⏱ {{ speakerTimeLeft }}s</span>
        </div>
      </div>
      <div class="card-grid-body">
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
                'stat-cell--label': !chunkFor(player, row.key).revealed,
                'stat-cell--open': chunkFor(player, row.key).revealed,
                'stat-cell--wave': chunkFor(player, row.key).revealed,
                'value--revealed': chunkFor(player, row.key).revealed,
                'stat-cell--drama': drama && chunkFor(player, row.key).revealed,
              }"
            >
              <template v-if="!chunkFor(player, row.key).revealed">
                {{ fieldLabelUi(row.key) }}
              </template>
              <template v-else>
                {{ statDisplay(player, row.key).text }}
              </template>
            </span>
          </li>
        </ul>
      </div>
    </template>
  </article>

  <div
    v-else
    class="hud-root hud-root--solo"
    :class="{
      'hud-root--eliminated': isEliminated(player),
      'hud-root--spotlight': isSpotlight && !isEliminated(player),
      'hud-root--speaker': isTimerTarget && !isEliminated(player),
      'hud-root--cinema': cinema,
      'hud-root--drama': drama,
    }"
  >
    <div v-if="isEliminated(player)" class="elim-solo-screen elim-solo-screen--cut">
      <div class="elim-solo-screen__base" aria-hidden="true" />
      <img class="elim-solo-screen__mark" :src="deathSvgSrc" alt="" />
      <div class="elim-solo-screen__content">
        <p class="elim-solo-screen__kicker">Кого ми з’їмо першим</p>
        <h2 class="elim-solo-screen__title">ВИБУВ</h2>
        <p class="elim-solo-screen__subline">Слот закритий до кінця гри</p>
        <p class="elim-solo-screen__slot">Гравець {{ playerIdDisplay(player) }}</p>
      </div>
    </div>

    <template v-else>
      <div
        v-if="solo && showActiveCardChip"
        class="ac-chip"
        :title="activeCardFrom(player).description || activeCardFrom(player).title || 'Є карта'"
      >
        <span class="ac-chip-ico">🃏</span>
        <span class="ac-chip-t">Є карта</span>
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
        <div class="hud-tr-top">
          <span class="hud-slot">{{ playerIdDisplay(player) }}</span>
          <span v-if="isTimerTarget" class="hud-speak-badge">ГОВОРИШ</span>
        </div>
        <div v-if="showSpeakerTimer" class="hud-timer-stack">
          <div
            class="hud-ring-wrap"
            :class="{ 'hud-ring-wrap--urgent': timerUrgent, 'timer--danger': timerUrgent }"
          >
            <span class="hud-ring" :style="timerRingStyle" />
            <span
              class="hud-timer-label"
              :class="{ 'hud-timer-label--urgent': timerUrgent, 'timer--danger': timerUrgent }"
            >{{ speakerTimeLeft }}s</span>
          </div>
        </div>
      </div>

      <div class="hud-block hud-bl">
        <div v-for="key in HUD_LEFT" :key="key" class="hud-stat">
          <span
            :key="valueRevealKey(player, key)"
            class="hud-stat-inner"
            :class="{
              'hud-stat-inner--label': !chunkFor(player, key).revealed,
              'hud-stat-inner--open': chunkFor(player, key).revealed,
              'hud-stat-inner--wave': chunkFor(player, key).revealed,
              'value--revealed': chunkFor(player, key).revealed,
              'hud-stat-inner--drama': drama && chunkFor(player, key).revealed,
            }"
          >
            <template v-if="!chunkFor(player, key).revealed">{{ fieldLabelUi(key) }}</template>
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
              'hud-stat-inner--label': !chunkFor(player, key).revealed,
              'hud-stat-inner--open': chunkFor(player, key).revealed,
              'hud-stat-inner--wave': chunkFor(player, key).revealed,
              'value--revealed': chunkFor(player, key).revealed,
              'hud-stat-inner--drama': drama && chunkFor(player, key).revealed,
            }"
          >
            <template v-if="!chunkFor(player, key).revealed">{{ fieldLabelUi(key) }}</template>
            <template v-else>{{ statDisplay(player, key).text }}</template>
          </span>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.card-grid {
  --cg-pad-x: clamp(0.75rem, min(2.8vw, 3.2vh), 1.45rem);
  --cg-pad-y: clamp(0.85rem, min(3vw, 3.4vh), 1.5rem);
  --cg-stat-gap: clamp(0.42rem, min(1.8vw, 2.2vh), 0.75rem);
  --cg-stat-pad-y: clamp(0.52rem, min(2.2vw, 2.6vh), 1.05rem);
  --cg-stat-pad-x: clamp(0.58rem, min(2.6vw, 3vh), 1.2rem);
  --cg-stat-fs: clamp(0.9rem, min(2.8vw, 3.2vh), 1.22rem);
  --cg-id-fs: clamp(0.68rem, min(2vw, 2.2vh), 0.88rem);
  --cg-name-fs: clamp(1.05rem, min(2.8vw, 3.4vh), 1.42rem);
  --cg-meta-fs: clamp(0.88rem, min(2.2vw, 2.8vh), 1.12rem);
  --cg-timer: clamp(3.25rem, min(10vw, 11vh), 5.5rem);
  --cg-timer-num: clamp(0.68rem, min(2vw, 2.4vh), 0.9rem);

  position: relative;
  padding: 0;
  border-radius: 14px;
  background: rgba(12, 8, 28, 0.92);
  border: 1px solid rgba(168, 85, 247, 0.28);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  transition:
    transform 0.4s ease,
    box-shadow 0.4s ease,
    border-color 0.4s ease,
    opacity 0.4s ease,
    filter 0.4s ease;
}

@media (min-width: 1600px) {
  .card-grid {
    --cg-stat-fs: clamp(1rem, 1.1vw, 1.35rem);
  }
}

/* Spotlight: окремо від спікера — статична фіолетова рамка + м’яке світіння */
.card-grid--spotlight:not(.card-grid--speaker) {
  transform: scale(1.01);
  border-color: rgba(168, 85, 247, 0.55);
  box-shadow:
    0 0 0 1px rgba(168, 85, 247, 0.45),
    0 0 24px rgba(168, 85, 247, 0.22);
}

.card-grid--spotlight:not(.card-grid--speaker)::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  pointer-events: none;
  z-index: 1;
  box-shadow: inset 0 0 0 1px rgba(168, 85, 247, 0.35);
}

.card-grid--dimmed {
  opacity: 0.5;
  filter: saturate(0.55) brightness(0.92);
  transition:
    opacity 0.45s ease,
    filter 0.45s ease;
}

/* Спікер у глобальній сітці — помітніший, без агресивного scale */
.card-grid--speaker {
  opacity: 1;
  filter: none;
  z-index: 2;
  transform: scale(1.025);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.35),
    0 0 20px rgba(168, 85, 247, 0.38),
    0 0 36px rgba(168, 85, 247, 0.2);
  animation: speakerCardGlow 2.5s ease-in-out infinite;
}

@keyframes speakerCardGlow {
  0%,
  100% {
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.35),
      0 0 18px rgba(168, 85, 247, 0.32),
      0 0 32px rgba(168, 85, 247, 0.16);
  }
  50% {
    box-shadow:
      0 8px 24px rgba(0, 0, 0, 0.35),
      0 0 26px rgba(168, 85, 247, 0.48),
      0 0 40px rgba(168, 85, 247, 0.24);
  }
}

.card-speak-badge {
  margin: 0;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  font-size: clamp(0.5rem, min(1.5vw, 1.7vh), 0.62rem);
  font-weight: 800;
  letter-spacing: 0.1em;
  color: rgba(250, 245, 255, 0.92);
  background: rgba(168, 85, 247, 0.22);
  border: 1px solid rgba(168, 85, 247, 0.35);
  line-height: 1;
}

.timer-ring-wrap--urgent {
  animation: timerDangerPulse 0.6s ease-in-out infinite;
}

@keyframes timerDangerPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.92;
    transform: scale(1.04);
  }
}

.timer-num--urgent {
  color: #fecaca !important;
  text-shadow: 0 0 10px rgba(239, 68, 68, 0.6) !important;
}

.card-grid > .card-grid-timer {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  z-index: 4;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

.timer-ring-wrap {
  position: relative;
  width: var(--cg-timer, 62px);
  height: var(--cg-timer, 62px);
  display: grid;
  place-items: center;
}

.timer-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transition: background 0.35s linear;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 3px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 3px));
}

.timer-num {
  position: relative;
  z-index: 1;
  font-size: var(--cg-timer-num, 0.72rem);
  font-weight: 800;
  color: #faf5ff;
  font-family: 'Orbitron', sans-serif;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.card-grid-body {
  position: relative;
  z-index: 2;
  padding: var(--cg-pad-y) var(--cg-pad-x);
}

.card-grid--eliminated {
  border-color: rgba(80, 20, 28, 0.75);
  background: #050308;
  min-height: 200px;
  box-shadow: inset 0 0 64px rgba(0, 0, 0, 0.75);
}

.card-elim-screen {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1.25rem 1rem;
  min-height: 220px;
  box-sizing: border-box;
}

.card-elim-screen--cut {
  animation: deathCutCard 0.48s ease-out both;
}

@keyframes deathCutCard {
  0% {
    transform: scale(1);
    filter: brightness(1);
    opacity: 0;
  }
  40% {
    transform: scale(1.05);
    filter: brightness(1.5);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    filter: brightness(1);
    opacity: 1;
  }
}

.card-elim-screen__art {
  width: min(56%, 140px);
  height: auto;
  margin: 0 0 0.5rem;
  opacity: 0.9;
  filter: drop-shadow(0 0 12px rgba(168, 85, 247, 0.25));
}

.card-elim-screen__title {
  margin: 0;
  font-family: Orbitron, sans-serif;
  font-size: clamp(1.15rem, 4vw, 1.5rem);
  font-weight: 900;
  letter-spacing: 0.22em;
  color: #fca5a5;
}

.card-elim-screen__hint {
  margin: 0.65rem 0 0;
  font-size: clamp(0.68rem, 2vw, 0.78rem);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(196, 181, 253, 0.42);
  line-height: 1.4;
  max-width: 16rem;
}

.card-elim-screen__slot {
  margin: 1rem 0 0;
  font-size: clamp(1.5rem, 5vw, 2rem);
  font-weight: 900;
  font-family: Orbitron, sans-serif;
  color: rgba(248, 250, 252, 0.88);
  letter-spacing: 0.08em;
}

.card-grid-id {
  margin: 0 0 0.25rem;
  font-size: var(--cg-id-fs);
  letter-spacing: 0.14em;
  color: rgba(196, 181, 253, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.card-grid-name {
  margin: 0 0 0.2rem;
  font-size: var(--cg-name-fs);
  font-weight: 700;
  color: #f5f3ff;
  line-height: 1.2;
}

.card-grid-meta {
  margin: 0 0 clamp(0.5rem, min(2vw, 2.2vh), 0.85rem);
  font-size: var(--cg-meta-fs);
  color: rgba(226, 232, 240, 0.9);
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
  gap: var(--cg-stat-gap);
}

.stats li {
  margin: 0;
}

.stat-cell {
  display: block;
  padding: var(--cg-stat-pad-y) var(--cg-stat-pad-x);
  border-radius: clamp(10px, 1.8vmin, 14px);
  background: rgba(0, 0, 0, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: var(--cg-stat-fs);
  font-weight: 600;
  text-align: right;
  line-height: 1.45;
  transition:
    color 0.28s ease,
    border-color 0.28s ease,
    background 0.28s ease;
}

.stat-cell--label {
  color: rgba(148, 140, 180, 0.78);
  font-weight: 700;
  font-size: clamp(0.72rem, min(2.1vw, 2.5vh), 0.92rem);
  letter-spacing: 0.1em;
  font-family: ui-monospace, 'Cascadia Mono', monospace;
}

.stat-cell--open {
  color: #f1f5f9;
  border-color: rgba(168, 85, 247, 0.28);
  text-align: right;
}

.stat-cell--wave {
  animation: revealWave 0.55s ease-out;
}

.stat-cell--drama {
  animation: revealWave 0.85s ease-out;
}

.stat-cell.value--revealed {
  animation: revealWave 0.55s ease-out, revealFlash 0.5s ease;
}

@keyframes revealFlash {
  0% {
    background-color: rgba(255, 255, 255, 0.45);
    color: #0f172a;
  }
  35% {
    background-color: rgba(255, 255, 255, 0.2);
  }
  100% {
    background-color: transparent;
  }
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

/**
 * Персональний HUD: vmin/vw/vh — масштаб від розміру екрана.
 * Бічні колонки (bl/br) ширші за верхні (tl/tr).
 */
.hud-root--solo {
  --hud-edge: clamp(0.55rem, min(2vw, 2.6vh), 2.15rem);
  --hud-side-max: min(48vw, clamp(16.5rem, 44vmin, 38rem));
  --hud-top-max: min(52vw, clamp(13rem, 36vmin, 26rem));
  --hud-pad-side: clamp(0.78rem, min(2.8vw, 3.2vh), 1.55rem);
  --hud-pad-top: clamp(0.68rem, min(2.2vw, 2.8vh), 1.25rem);
  --hud-stat-gap: clamp(0.45rem, min(1.7vw, 2vh), 0.85rem);
  --hud-stat-pad-y: clamp(0.68rem, min(2.8vw, 3.2vh), 1.35rem);
  --hud-stat-pad-x: clamp(0.75rem, min(3.2vw, 3.6vh), 1.55rem);
  --hud-stat-font: clamp(0.98rem, min(3.3vw, 3.6vh), 1.55rem);
  --hud-name: clamp(1.2rem, min(3.8vw, 4.2vh), 1.95rem);
  --hud-sub: clamp(1.02rem, min(2.9vw, 3.4vh), 1.38rem);
  --hud-slot: clamp(2.25rem, min(7.5vw, 8.5vh), 4.25rem);
  --hud-timer-ring: clamp(5.15rem, min(14vw, 15vh), 8rem);
  --hud-timer-fs: clamp(0.88rem, min(2.8vw, 3vh), 1.22rem);
  --hud-br: clamp(14px, 2.2vmin, 20px);
}

@media (max-width: 480px) {
  .hud-root--solo {
    --hud-side-max: min(48vw, 17.5rem);
    --hud-stat-font: clamp(0.85rem, min(3.4vw, 3.6vh), 1.15rem);
  }
}

@media (min-width: 1920px) {
  .hud-root--solo {
    --hud-stat-font: clamp(1.05rem, 1.05vw, 1.5rem);
    --hud-side-max: min(40vw, 38rem);
  }
}

/* Spotlight без спікера: окремий стиль — рамка + м’який glow, без пульсу */
.hud-root--solo.hud-root--spotlight:not(.hud-root--speaker) .hud-block {
  border-color: rgba(168, 85, 247, 0.48);
  box-shadow:
    0 2px 12px rgba(0, 0, 0, 0.32),
    0 0 0 1px rgba(168, 85, 247, 0.38),
    0 0 22px rgba(168, 85, 247, 0.16);
}

.hud-root--solo.hud-root--spotlight:not(.hud-root--speaker) .hud-stat-inner {
  border-color: rgba(168, 85, 247, 0.26);
}

/* Легкий «дихаючий» фокус для спікера + слабкий центральний градієнт */
.hud-root--solo.hud-root--speaker:not(.hud-root--eliminated) {
  animation: speakerBreath 2.5s ease-in-out infinite;
  transform-origin: center center;
}

@keyframes speakerBreath {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.015);
  }
}

.hud-root--solo.hud-root--speaker:not(.hud-root--eliminated)::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(circle at center, rgba(168, 85, 247, 0.07), transparent 60%);
}

.hud-root--solo.hud-root--speaker:not(.hud-root--eliminated)::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(circle at center, rgba(168, 85, 247, 0.12), transparent 70%);
}

.hud-root--solo.hud-root--speaker:not(.hud-root--eliminated) .hud-block {
  box-shadow:
    0 2px 14px rgba(0, 0, 0, 0.28),
    0 0 0 1px rgba(168, 85, 247, 0.28),
    0 0 12px rgba(168, 85, 247, 0.22),
    0 0 28px rgba(168, 85, 247, 0.12);
}

.hud-tr-top {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
}

.hud-speak-badge {
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: clamp(0.52rem, min(1.55vw, 1.75vh), 0.65rem);
  font-weight: 800;
  letter-spacing: 0.12em;
  color: rgba(250, 245, 255, 0.9);
  background: rgba(168, 85, 247, 0.2);
  border: 1px solid rgba(168, 85, 247, 0.32);
  line-height: 1;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.hud-ring-wrap--urgent,
.hud-ring-wrap.timer--danger {
  animation: timerDangerPulse 0.6s ease-in-out infinite;
}

.hud-timer-label--urgent,
.hud-timer-label.timer--danger {
  color: #ef4444 !important;
  text-shadow:
    0 0 10px rgba(239, 68, 68, 0.45),
    0 1px 3px rgba(0, 0, 0, 0.5) !important;
}

.hud-root--solo .hud-timer-label:not(.hud-timer-label--urgent) {
  text-shadow:
    0 0 12px rgba(168, 85, 247, 0.28),
    0 1px 3px rgba(0, 0, 0, 0.45);
}

.hud-stat-inner.value--revealed {
  animation: revealWave 0.55s ease-out, revealFlash 0.5s ease;
}

.elim-solo-screen {
  position: absolute;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  padding: clamp(1rem, 4vw, 2rem);
  box-sizing: border-box;
  overflow: hidden;
}

.elim-solo-screen--cut {
  animation: deathCutSolo 0.48s ease-out both;
}

@keyframes deathCutSolo {
  0% {
    transform: scale(1);
    filter: brightness(1);
  }
  40% {
    transform: scale(1.04);
    filter: brightness(1.55);
  }
  100% {
    transform: scale(1);
    filter: brightness(1);
  }
}

.elim-solo-screen__base {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-color: #050308;
  opacity: 1;
}

.elim-solo-screen__base::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.15) 0%, rgba(0, 0, 0, 0.65) 100%);
  pointer-events: none;
}

.elim-solo-screen__mark {
  position: absolute;
  left: 50%;
  top: 26%;
  transform: translate(-50%, -50%);
  z-index: 1;
  width: min(48vw, 220px);
  height: auto;
  opacity: 0.88;
  pointer-events: none;
  filter: drop-shadow(0 0 20px rgba(168, 85, 247, 0.2));
}

.elim-solo-screen__content {
  position: relative;
  z-index: 2;
  max-width: min(92vw, 420px);
  text-align: center;
  margin-top: clamp(4.5rem, 22vh, 7rem);
  animation: elimSoloIn 0.65s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
}

@keyframes elimSoloIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.elim-solo-screen__kicker {
  margin: 0 0 0.5rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.38);
  font-family: 'Orbitron', sans-serif;
}

.elim-solo-screen__title {
  margin: 0;
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(2.25rem, 10vw, 3.75rem);
  font-weight: 900;
  letter-spacing: 0.14em;
  line-height: 1.05;
  color: #fecaca;
}

.elim-solo-screen__subline {
  margin: 1rem 0 0;
  font-size: clamp(0.88rem, 2.8vw, 1.05rem);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgba(203, 213, 225, 0.78);
  line-height: 1.45;
}

.elim-solo-screen__slot {
  margin: 1.35rem 0 0;
  font-size: clamp(1.35rem, 5vw, 2rem);
  font-weight: 900;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.1em;
  color: rgba(248, 250, 252, 0.9);
}

.hud-root--solo .ac-chip {
  bottom: var(--hud-edge);
  max-width: min(92vw, clamp(18rem, 58vmin, 36rem));
  padding: clamp(0.42rem, min(1.8vw, 2vh), 0.62rem) clamp(0.72rem, min(2.6vw, 2.8vh), 1.15rem)
    clamp(0.42rem, min(1.8vw, 2vh), 0.62rem) clamp(0.55rem, min(2.2vw, 2.4vh), 0.85rem);
}

.ac-chip {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
  display: inline-flex;
  align-items: center;
  gap: clamp(0.35rem, 1.5vmin, 0.55rem);
  border-radius: 999px;
  background: rgba(10, 6, 22, 0.94);
  border: 1px solid rgba(168, 85, 247, 0.38);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.32);
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.ac-chip--used {
  opacity: 0.65;
  border-color: rgba(148, 163, 184, 0.35);
}

.ac-chip-ico {
  font-size: clamp(0.85rem, min(2.6vw, 2.8vh), 1.15rem);
  line-height: 1;
}

.hud-root--solo .ac-chip-t {
  font-size: clamp(0.82rem, min(2.5vw, 2.7vh), 1.12rem);
}

.ac-chip-t {
  font-weight: 700;
  color: #ede9fe;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hud-zones {
  position: absolute;
  inset: 0;
  z-index: 3;
}

.hud-block {
  position: absolute;
  background: rgba(6, 4, 16, 0.96);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(168, 85, 247, 0.32);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.38);
  transition:
    border-color 0.35s ease,
    box-shadow 0.35s ease;
}

.hud-root--solo .hud-block {
  border-radius: var(--hud-br);
}

.hud-root--solo .hud-block.hud-tl,
.hud-root--solo .hud-block.hud-tr {
  max-width: var(--hud-top-max);
  padding: var(--hud-pad-top) clamp(0.55rem, min(2vw, 2.4vh), 1rem);
}

.hud-root--solo .hud-block.hud-bl,
.hud-root--solo .hud-block.hud-br {
  max-width: var(--hud-side-max);
  padding: var(--hud-pad-side);
}

.hud-tl {
  top: var(--hud-edge, clamp(0.5rem, 1.4vh, 1.1rem));
  left: var(--hud-edge, clamp(0.5rem, 1.4vw, 1.1rem));
}

.hud-tr {
  top: var(--hud-edge, clamp(0.5rem, 1.4vh, 1.1rem));
  right: var(--hud-edge, clamp(0.5rem, 1.4vw, 1.1rem));
  text-align: right;
}

.hud-bl {
  bottom: var(--hud-edge, clamp(0.5rem, 1.4vh, 1.1rem));
  left: var(--hud-edge, clamp(0.5rem, 1.4vw, 1.1rem));
}

.hud-br {
  bottom: var(--hud-edge, clamp(0.5rem, 1.4vh, 1.1rem));
  right: var(--hud-edge, clamp(0.5rem, 1.4vw, 1.1rem));
  text-align: right;
}

.hud-line {
  margin: 0;
  color: #f5f3ff;
  line-height: 1.3;
}

.hud-root--solo .hud-line--name {
  font-size: var(--hud-name);
}

.hud-line--name {
  font-weight: 700;
}

.hud-root--solo .hud-line--sub {
  font-size: var(--hud-sub);
}

.hud-line--sub {
  margin-top: 0.25rem;
  color: rgba(226, 232, 240, 0.92);
}

.hud-ph {
  letter-spacing: 0.18em;
  color: rgba(196, 181, 253, 0.5);
}

.hud-root--solo .hud-slot {
  font-size: var(--hud-slot);
}

.hud-slot {
  font-weight: 900;
  color: #faf5ff;
  font-family: 'Orbitron', sans-serif;
  line-height: 1;
  text-shadow: 0 0 14px rgba(168, 85, 247, 0.22);
}

.hud-timer-stack {
  margin-top: clamp(0.35rem, min(1.4vw, 1.6vh), 0.55rem);
  display: flex;
  justify-content: flex-end;
}

.hud-root--solo .hud-ring-wrap {
  width: var(--hud-timer-ring);
  height: var(--hud-timer-ring);
}

.hud-ring-wrap {
  position: relative;
  width: 74px;
  height: 74px;
  display: grid;
  place-items: center;
}

.hud-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transition: background 0.3s linear;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 3px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 3px));
}

.hud-root--solo .hud-timer-label {
  font-size: var(--hud-timer-fs);
}

.hud-timer-label {
  position: relative;
  z-index: 1;
  font-weight: 800;
  font-family: 'Orbitron', sans-serif;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
}

.hud-root--solo .hud-stat {
  margin-bottom: var(--hud-stat-gap);
}

.hud-stat {
  margin-bottom: 0.4rem;
}

.hud-stat:last-child {
  margin-bottom: 0;
}

.hud-root--solo .hud-stat-inner {
  padding: var(--hud-stat-pad-y) var(--hud-stat-pad-x);
  font-size: var(--hud-stat-font);
  border-radius: clamp(10px, 1.8vmin, 14px);
}

.hud-stat-inner {
  display: block;
  padding: 0.45rem 0.58rem;
  border-radius: 11px;
  background: rgba(10, 6, 22, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-weight: 600;
  line-height: 1.38;
  transition:
    color 0.28s ease,
    border-color 0.28s ease;
}

.hud-stat-inner--label {
  color: rgba(148, 140, 180, 0.82);
  font-weight: 700;
  font-size: clamp(0.72rem, min(2.4vw, 2.7vh), 0.95rem);
  letter-spacing: 0.1em;
  font-family: ui-monospace, 'Cascadia Mono', monospace;
}

.hud-br .hud-stat-inner {
  text-align: right;
}

.hud-stat-inner--open {
  color: #f1f5f9;
  border-color: rgba(168, 85, 247, 0.3);
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
