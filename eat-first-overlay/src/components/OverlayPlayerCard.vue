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
      'card-grid--spotlight': isSpotlight && !isEliminated(player),
      'card-grid--timer': isTimerTarget,
      'card-grid--eliminated': isEliminated(player),
      'card-grid--cinema': cinema,
    }"
  >
    <div v-if="isEliminated(player)" class="card-elim-screen">
      <img class="card-elim-screen__art" src="/overlay-eliminated.svg" alt="" />
      <p class="card-elim-screen__title">ВИБУВ</p>
      <p class="card-elim-screen__slot">Гравець {{ playerIdDisplay(player) }}</p>
      <p class="card-elim-screen__hint">Слот закритий</p>
    </div>

    <template v-else>
      <div v-if="showSpeakerTimer" class="card-grid-timer" aria-hidden="true">
        <div class="timer-ring-wrap">
          <span class="timer-ring" :style="timerRingStyle" />
          <span class="timer-num">⏱ {{ speakerTimeLeft }}s</span>
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
    </template>
  </article>

  <div
    v-else
    class="hud-root hud-root--solo"
    :class="{
      'hud-root--eliminated': isEliminated(player),
      'hud-root--spotlight': isSpotlight && !isEliminated(player),
      'hud-root--cinema': cinema,
      'hud-root--drama': drama,
    }"
  >
    <div v-if="isEliminated(player)" class="elim-solo-screen">
      <div class="elim-solo-screen__veil" aria-hidden="true" />
      <div class="elim-solo-screen__content">
        <img class="elim-solo-screen__art" src="/overlay-eliminated.svg" alt="" />
        <p class="elim-solo-screen__kicker">Кого ми з’їмо першим</p>
        <h2 class="elim-solo-screen__title">ВИБУВ</h2>
        <p class="elim-solo-screen__sub">Ти покинув відбір. Камера для цього слоту прихована.</p>
        <p class="elim-solo-screen__slot">Слот {{ playerIdDisplay(player) }}</p>
      </div>
    </div>

    <template v-else>
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
    </template>
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
  border-color: rgba(168, 85, 247, 0.65);
  box-shadow:
    0 0 0 2px rgba(168, 85, 247, 0.4),
    0 0 32px rgba(168, 85, 247, 0.35);
  animation: spotlightCardPulse 2.8s ease-in-out infinite;
}

.card-grid--spotlight::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
  pointer-events: none;
  z-index: 1;
  box-shadow:
    inset 0 0 0 2px rgba(168, 85, 247, 0.5),
    inset 0 0 80px rgba(168, 85, 247, 0.2);
}

@keyframes spotlightCardPulse {
  0%,
  100% {
    box-shadow:
      0 0 0 2px rgba(168, 85, 247, 0.35),
      0 0 28px rgba(168, 85, 247, 0.28);
  }
  50% {
    box-shadow:
      0 0 0 2px rgba(168, 85, 247, 0.55),
      0 0 40px rgba(168, 85, 247, 0.42);
  }
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
  z-index: 4;
  pointer-events: none;
}

.timer-ring-wrap {
  position: relative;
  width: 62px;
  height: 62px;
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
  font-size: 0.72rem;
  font-weight: 800;
  color: #faf5ff;
  font-family: 'Orbitron', sans-serif;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.card-grid-body {
  position: relative;
  z-index: 2;
  padding: 1rem 1.05rem 1.1rem;
}

.card-grid--eliminated {
  border-color: rgba(127, 29, 29, 0.65);
  background: rgba(18, 6, 10, 0.98);
  min-height: 200px;
}

.card-elim-screen {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1rem 0.75rem 1.15rem;
  min-height: 220px;
  box-sizing: border-box;
}

.card-elim-screen__art {
  width: min(72%, 160px);
  height: auto;
  border-radius: 16px;
  margin-bottom: 0.5rem;
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.5));
}

.card-elim-screen__title {
  margin: 0;
  font-family: Orbitron, sans-serif;
  font-size: clamp(1rem, 3.5vw, 1.25rem);
  font-weight: 900;
  letter-spacing: 0.2em;
  color: #fecaca;
  text-shadow: 0 0 20px rgba(248, 113, 113, 0.35);
}

.card-elim-screen__slot {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.88);
}

.card-elim-screen__hint {
  margin: 0.25rem 0 0;
  font-size: 0.68rem;
  color: rgba(196, 181, 253, 0.45);
  letter-spacing: 0.06em;
}

.card-grid-id {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  color: rgba(196, 181, 253, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.card-grid-name {
  margin: 0 0 0.2rem;
  font-size: clamp(1.05rem, 2.4vw, 1.25rem);
  font-weight: 700;
  color: #f5f3ff;
  line-height: 1.2;
}

.card-grid-meta {
  margin: 0 0 0.65rem;
  font-size: clamp(0.88rem, 2vw, 1rem);
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
  gap: 0.45rem;
}

.stats li {
  margin: 0;
}

.stat-cell {
  display: block;
  padding: 0.48rem 0.6rem;
  border-radius: 11px;
  background: rgba(0, 0, 0, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: clamp(0.8rem, 2.1vw, 0.95rem);
  font-weight: 600;
  color: rgba(196, 181, 253, 0.82);
  text-align: right;
  line-height: 1.4;
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
  border-color: rgba(168, 85, 247, 0.65);
  box-shadow:
    inset 0 0 28px rgba(168, 85, 247, 0.16),
    0 0 0 1px rgba(168, 85, 247, 0.45),
    0 0 26px rgba(168, 85, 247, 0.32);
  animation: hudSpotPulse 2.6s ease-in-out infinite;
}

@keyframes hudSpotPulse {
  0%,
  100% {
    box-shadow:
      inset 0 0 22px rgba(168, 85, 247, 0.12),
      0 0 0 1px rgba(168, 85, 247, 0.38),
      0 0 20px rgba(168, 85, 247, 0.22);
  }
  50% {
    box-shadow:
      inset 0 0 36px rgba(168, 85, 247, 0.22),
      0 0 0 1px rgba(168, 85, 247, 0.55),
      0 0 34px rgba(168, 85, 247, 0.4);
  }
}

.hud-root--spotlight .hud-stat-inner {
  border-color: rgba(168, 85, 247, 0.32);
  box-shadow: inset 0 0 14px rgba(168, 85, 247, 0.08);
}

.elim-solo-screen {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  padding: clamp(1rem, 4vw, 2rem);
  box-sizing: border-box;
}

.elim-solo-screen__veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 85% 70% at 50% 45%, rgba(30, 10, 20, 0.55), rgba(4, 2, 10, 0.97)),
    rgba(4, 2, 10, 0.96);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.elim-solo-screen__content {
  position: relative;
  z-index: 1;
  max-width: min(92vw, 400px);
  text-align: center;
}

.elim-solo-screen__art {
  width: min(72vw, 260px);
  height: auto;
  margin: 0 auto 1rem;
  display: block;
  border-radius: 20px;
  filter: drop-shadow(0 12px 40px rgba(0, 0, 0, 0.55));
}

.elim-solo-screen__kicker {
  margin: 0 0 0.35rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.5);
  font-family: 'Orbitron', sans-serif;
}

.elim-solo-screen__title {
  margin: 0;
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(1.75rem, 6vw, 2.5rem);
  font-weight: 900;
  letter-spacing: 0.16em;
  color: #fecaca;
  text-shadow:
    0 0 28px rgba(248, 113, 113, 0.35),
    0 2px 12px rgba(0, 0, 0, 0.6);
}

.elim-solo-screen__sub {
  margin: 0.85rem 0 0;
  font-size: clamp(0.88rem, 2.4vw, 1.05rem);
  line-height: 1.5;
  color: rgba(226, 232, 240, 0.88);
}

.elim-solo-screen__slot {
  margin: 1rem 0 0;
  font-size: 0.82rem;
  font-weight: 700;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.12em;
  color: rgba(196, 181, 253, 0.65);
}

.ac-chip {
  position: absolute;
  bottom: clamp(0.55rem, 2vh, 1rem);
  left: 50%;
  transform: translateX(-50%);
  z-index: 7;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  max-width: min(90vw, 380px);
  padding: 0.4rem 0.75rem 0.4rem 0.55rem;
  border-radius: 999px;
  background: rgba(10, 6, 22, 0.94);
  border: 1px solid rgba(168, 85, 247, 0.42);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.ac-chip--used {
  opacity: 0.65;
  border-color: rgba(148, 163, 184, 0.35);
}

.ac-chip-ico {
  font-size: 0.9rem;
  line-height: 1;
}

.ac-chip-t {
  font-size: clamp(0.78rem, 2vw, 0.9rem);
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
  padding: 0.58rem 0.72rem;
  border-radius: 14px;
  background: rgba(8, 6, 20, 0.94);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(168, 85, 247, 0.32);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  max-width: min(48vw, 340px);
}

.hud-tl {
  top: clamp(0.5rem, 1.4vh, 1.1rem);
  left: clamp(0.5rem, 1.4vw, 1.1rem);
}

.hud-tr {
  top: clamp(0.5rem, 1.4vh, 1.1rem);
  right: clamp(0.5rem, 1.4vw, 1.1rem);
  text-align: right;
  max-width: min(44vw, 260px);
}

.hud-bl {
  bottom: clamp(0.5rem, 1.4vh, 1.1rem);
  left: clamp(0.5rem, 1.4vw, 1.1rem);
}

.hud-br {
  bottom: clamp(0.5rem, 1.4vh, 1.1rem);
  right: clamp(0.5rem, 1.4vw, 1.1rem);
  text-align: right;
}

.hud-line {
  margin: 0;
  color: #f5f3ff;
  line-height: 1.3;
}

.hud-line--name {
  font-size: clamp(1.08rem, 2.8vw, 1.38rem);
  font-weight: 700;
}

.hud-line--sub {
  margin-top: 0.25rem;
  font-size: clamp(0.9rem, 2.2vw, 1.05rem);
  color: rgba(226, 232, 240, 0.92);
}

.hud-ph {
  letter-spacing: 0.18em;
  color: rgba(196, 181, 253, 0.5);
}

.hud-slot {
  font-size: clamp(1.85rem, 5.2vw, 2.85rem);
  font-weight: 900;
  color: #faf5ff;
  font-family: 'Orbitron', sans-serif;
  line-height: 1;
  text-shadow: 0 0 18px rgba(168, 85, 247, 0.32);
}

.hud-timer-stack {
  margin-top: 0.4rem;
  display: flex;
  justify-content: flex-end;
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
}

.hud-timer-label {
  position: relative;
  z-index: 1;
  font-size: 0.78rem;
  font-weight: 800;
  font-family: 'Orbitron', sans-serif;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
}

.hud-stat {
  margin-bottom: 0.4rem;
}

.hud-stat:last-child {
  margin-bottom: 0;
}

.hud-stat-inner {
  display: block;
  padding: 0.45rem 0.58rem;
  border-radius: 11px;
  background: rgba(10, 6, 22, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: clamp(0.82rem, 2.1vw, 0.98rem);
  font-weight: 600;
  color: rgba(196, 181, 253, 0.82);
  line-height: 1.35;
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
