<script setup>
import { computed } from 'vue'
import { fieldConfig } from '../characterState'

const HUD_LEFT = ['profession', 'health', 'phobia']
const HUD_RIGHT = ['luggage', 'fact', 'quirk']

const props = defineProps({
  player: { type: Object, required: true },
  highlighted: { type: Boolean, default: false },
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

function displayStat(player, fieldKey) {
  const c = chunkFor(player, fieldKey)
  if (!c.revealed) return '❓'
  const v = String(c.value ?? '').trim()
  return v.length ? v : '—'
}

function displayLine(val) {
  const s = String(val ?? '').trim()
  return s.length ? s : '—'
}

function displayName(player) {
  const n = String(player.name ?? '').trim()
  return n.length ? n : '—'
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
    title: String(ac.title ?? '').trim() || '—',
    description: String(ac.description ?? '').trim() || '—',
    used: Boolean(ac.used),
  }
}

const showSpeakerTimer = computed(
  () => props.highlighted && typeof props.speakerTimeLeft === 'number',
)

const timerRingStyle = computed(() => {
  if (!showSpeakerTimer.value) return {}
  const gr = 3
  const total = Math.max(1, props.speakerTimerTotal || 30)
  const left = Math.max(0, props.speakerTimeLeft)
  const pct = Math.min(100, (left / total) * 100)
  return {
    background: `conic-gradient(rgba(167, 139, 250, 0.92) ${pct}%, rgba(255,255,255,0.1) 0)`,
    WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${gr}px), #000 calc(100% - ${gr}px + 1px))`,
    mask: `radial-gradient(farthest-side, transparent calc(100% - ${gr}px), #000 calc(100% - ${gr}px + 1px))`,
  }
})
</script>

<template>
  <article
    v-if="!solo"
    class="card-grid"
    :class="{
      'card-grid--active': highlighted,
      'card-grid--eliminated': isEliminated(player),
      'card-grid--cinema': cinema,
    }"
  >
    <Transition name="badge-pop">
      <div v-if="isEliminated(player)" class="eliminated-badge" aria-hidden="true">ВИБУВ</div>
    </Transition>
    <div v-if="showSpeakerTimer" class="card-grid-timer" aria-hidden="true">
      <span class="card-grid-timer-ring" :style="timerRingStyle" />
      <span class="card-grid-timer-text">{{ speakerTimeLeft }}s</span>
    </div>
    <div
      class="card-grid-body"
      :class="{ 'card-grid-body--eliminated': isEliminated(player) }"
    >
      <p class="card-grid-id">{{ playerIdDisplay(player) }}</p>
      <h2 class="card-grid-name">{{ displayName(player) }}</h2>
      <ul class="stats">
        <li v-for="row in fieldConfig" :key="row.key">
          <span class="label">{{ row.label }}</span>
          <span
            :key="valueRevealKey(player, row.key)"
            class="value"
            :class="{
              hidden: !chunkFor(player, row.key).revealed,
              'value--revealed': chunkFor(player, row.key).revealed,
              'value--drama-reveal': drama && chunkFor(player, row.key).revealed,
            }"
          >
            {{ displayStat(player, row.key) }}
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
      'hud-root--active': highlighted,
      'hud-root--cinema': cinema,
      'hud-root--drama': drama,
    }"
  >
    <Transition name="badge-pop">
      <div v-if="isEliminated(player)" class="hud-eliminated-badge" aria-hidden="true">ВИБУВ</div>
    </Transition>

    <div class="hud-zones hud-zones--solo">
      <div class="hud-col-left">
        <div class="hud-block hud-tl">
          <p class="hud-meta-line hud-meta-name">
            <span class="hud-meta-k">Ім’я</span>
            <span class="hud-meta-v">{{ displayName(player) }}</span>
          </p>
          <p class="hud-meta-line">
            <span class="hud-meta-k">Вік</span>
            <span class="hud-meta-v">{{ displayLine(player.age) }}</span>
          </p>
          <p class="hud-meta-line">
            <span class="hud-meta-k">Гендер</span>
            <span class="hud-meta-v">{{ displayLine(player.gender) }}</span>
          </p>
        </div>

        <div class="hud-block hud-aml">
          <p class="hud-aml-k">Активна карта</p>
          <p class="hud-aml-title">{{ activeCardFrom(player).title }}</p>
          <p class="hud-aml-desc">{{ activeCardFrom(player).description }}</p>
          <p v-if="activeCardFrom(player).used" class="hud-aml-used">Використано</p>
        </div>
      </div>

      <div class="hud-block hud-tr">
        <span class="hud-slot">{{ playerIdDisplay(player) }}</span>
        <div v-if="showSpeakerTimer" class="hud-timer-wrap">
          <span class="hud-timer-ring" :style="timerRingStyle" aria-hidden="true" />
          <span class="hud-timer">{{ speakerTimeLeft }}s</span>
        </div>
      </div>

      <div class="hud-block hud-bl">
        <div v-for="key in HUD_LEFT" :key="key" class="hud-row">
          <span class="hud-label">{{ labelByKey[key] }}</span>
          <span
            :key="valueRevealKey(player, key)"
            class="hud-value"
            :class="{
              'hud-value--hidden': !chunkFor(player, key).revealed,
              'value--revealed': chunkFor(player, key).revealed,
              'value--drama-reveal': drama && chunkFor(player, key).revealed,
            }"
          >
            {{ displayStat(player, key) }}
          </span>
        </div>
      </div>

      <div class="hud-block hud-br">
        <div v-for="key in HUD_RIGHT" :key="key" class="hud-row">
          <span class="hud-label">{{ labelByKey[key] }}</span>
          <span
            :key="valueRevealKey(player, key)"
            class="hud-value"
            :class="{
              'hud-value--hidden': !chunkFor(player, key).revealed,
              'value--revealed': chunkFor(player, key).revealed,
              'value--drama-reveal': drama && chunkFor(player, key).revealed,
            }"
          >
            {{ displayStat(player, key) }}
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
  border-radius: 16px;
  background: rgba(14, 12, 28, 0.88);
  border: 1px solid rgba(167, 139, 250, 0.18);
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  overflow: hidden;
  transition: border-color 0.32s ease, box-shadow 0.32s ease, transform 0.35s ease;
}

.card-grid-timer {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.45rem 0.2rem 0.35rem;
  border-radius: 999px;
  background: rgba(8, 6, 22, 0.82);
  border: 1px solid rgba(167, 139, 250, 0.4);
  box-shadow: 0 0 14px rgba(124, 58, 237, 0.25);
  pointer-events: none;
}

.card-grid-timer-ring {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  flex-shrink: 0;
}

.card-grid-timer-text {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #f5f3ff;
  font-family: 'Orbitron', ui-sans-serif, system-ui, sans-serif;
}

.card-grid--cinema {
  border-radius: 18px;
}

.card-grid-body {
  padding: 1rem 1.1rem 1.15rem;
  transition: opacity 0.32s ease, filter 0.32s ease;
}

.card-grid-body--eliminated {
  opacity: 0.35;
  filter: grayscale(1);
}

.card-grid--active {
  transform: scale(1.04);
  z-index: 2;
  border-color: rgba(167, 139, 250, 0.5);
  box-shadow:
    0 0 0 1px rgba(167, 139, 250, 0.35),
    0 0 28px rgba(124, 58, 237, 0.35),
    0 16px 40px rgba(0, 0, 0, 0.5);
}

.card-grid--eliminated {
  background: rgba(24, 10, 14, 0.9);
  border-color: rgba(185, 28, 28, 0.45);
}

.eliminated-badge {
  position: absolute;
  top: 0.55rem;
  left: 0.55rem;
  z-index: 2;
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #fecaca;
  background: rgba(80, 15, 22, 0.82);
  border: 1px solid rgba(248, 113, 113, 0.4);
  pointer-events: none;
}

.card-grid-id {
  margin: 0 0 0.25rem;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  color: rgba(196, 181, 253, 0.55);
  font-family: 'Orbitron', sans-serif;
}

.card-grid-name {
  margin: 0 0 0.65rem;
  font-size: clamp(0.95rem, 2vw, 1.1rem);
  font-weight: 600;
  color: #e9d5ff;
  line-height: 1.25;
}

.stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.stats li {
  display: grid;
  grid-template-columns: 1fr minmax(0, 1.15fr);
  gap: 0.5rem;
  align-items: baseline;
  padding: 0.4rem 0.5rem;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.label {
  font-size: 0.68rem;
  color: rgba(226, 232, 255, 0.45);
}

.value {
  display: inline-block;
  font-size: 0.75rem;
  color: #f1f5ff;
  text-align: right;
  word-break: break-word;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.value.hidden {
  font-size: 0.85rem;
  opacity: 0.9;
}

.value--revealed {
  animation: flashReveal 0.4s ease-out forwards;
}

@keyframes flashReveal {
  0% {
    opacity: 0;
    filter: blur(6px);
    transform: scale(0.98);
  }
  100% {
    opacity: 1;
    filter: blur(0);
    transform: scale(1);
  }
}

.value--drama-reveal {
  animation: flashRevealDrama 1s ease-out forwards;
}

@keyframes flashRevealDrama {
  0% {
    opacity: 0;
    filter: blur(10px);
  }
  50% {
    box-shadow: 0 0 16px rgba(185, 28, 28, 0.35);
  }
  100% {
    opacity: 1;
    filter: blur(0);
  }
}

.badge-pop-enter-active,
.badge-pop-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
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
}

.hud-root--solo {
  background: transparent;
}

.hud-zones {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.hud-eliminated-badge {
  position: absolute;
  top: clamp(0.5rem, 1.5vh, 1rem);
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  padding: 0.25rem 0.7rem;
  border-radius: 8px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: #fecaca;
  background: rgba(60, 12, 18, 0.75);
  border: 1px solid rgba(248, 113, 113, 0.4);
  pointer-events: none;
}

.hud-zones--solo {
  animation: none;
}

.hud-root--active .hud-zones--solo {
  animation: none;
}

.hud-col-left {
  position: absolute;
  top: clamp(0.5rem, 1.5vh, 1.25rem);
  left: clamp(0.5rem, 1.5vw, 1.25rem);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-width: min(42vw, 300px);
  z-index: 2;
}

.hud-block {
  padding: 0.45rem 0.6rem;
  border-radius: 12px;
  background: rgba(8, 6, 22, 0.45);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(167, 139, 250, 0.22);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  opacity: 0;
  animation: hudFadeIn 0.45s ease-out forwards;
}

.hud-tl {
  position: relative;
  top: auto;
  left: auto;
  max-width: none;
  width: 100%;
}

.hud-aml {
  position: relative;
  padding: 0.4rem 0.55rem;
}

.hud-aml-k {
  margin: 0 0 0.2rem;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.65);
}

.hud-aml-title {
  margin: 0 0 0.25rem;
  font-size: clamp(12px, 2vw, 13px);
  font-weight: 700;
  color: #f5f3ff;
  line-height: 1.25;
}

.hud-aml-desc {
  margin: 0;
  font-size: clamp(10px, 1.65vw, 11px);
  line-height: 1.35;
  color: rgba(226, 232, 240, 0.82);
}

.hud-aml-used {
  margin: 0.35rem 0 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(167, 139, 250, 0.95);
}

.hud-tr {
  position: absolute;
  top: clamp(0.5rem, 1.5vh, 1.25rem);
  right: clamp(0.5rem, 1.5vw, 1.25rem);
  text-align: right;
  max-width: min(36vw, 200px);
}

.hud-bl {
  position: absolute;
  bottom: clamp(0.5rem, 1.5vh, 1.25rem);
  left: clamp(0.5rem, 1.5vw, 1.25rem);
  max-width: min(42vw, 320px);
}

.hud-br {
  position: absolute;
  bottom: clamp(0.5rem, 1.5vh, 1.25rem);
  right: clamp(0.5rem, 1.5vw, 1.25rem);
  text-align: right;
  max-width: min(42vw, 320px);
}

@keyframes hudFadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hud-timer-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  margin-top: 0.35rem;
}

.hud-timer-ring {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
}

.hud-timer {
  font-size: clamp(0.78rem, 2vw, 0.95rem);
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #faf5ff;
  font-family: 'Orbitron', ui-sans-serif, system-ui, sans-serif;
}

.hud-meta-line {
  margin: 0 0 0.28rem;
  font-size: 13px;
  line-height: 1.3;
  color: #e2e8f0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 0.45rem;
  align-items: baseline;
}

.hud-meta-line:last-child {
  margin-bottom: 0;
}

.hud-meta-k {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.55);
  min-width: 3.2rem;
}

.hud-meta-v {
  font-weight: 600;
  color: #f8fafc;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.hud-meta-name .hud-meta-v {
  font-size: 14px;
}

.hud-slot {
  font-size: clamp(1.75rem, 5vw, 2.75rem);
  font-weight: 900;
  letter-spacing: 0.04em;
  color: #f5f3ff;
  text-shadow: 0 0 18px rgba(124, 58, 237, 0.35);
  font-family: 'Orbitron', sans-serif;
  line-height: 1;
}

.hud-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 0.3rem 0.5rem;
  align-items: baseline;
  padding: 0.3rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.hud-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.hud-row:first-child {
  padding-top: 0;
}

.hud-label {
  font-size: clamp(10px, 1.6vw, 11px);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.55);
  text-align: left;
}

.hud-value {
  font-size: clamp(12px, 2vw, 15px);
  font-weight: 600;
  color: #f8fafc;
  text-align: right;
  word-break: break-word;
  line-height: 1.2;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
}

.hud-value--hidden {
  font-size: clamp(14px, 2.2vw, 17px);
  opacity: 0.92;
}

.hud-value.value--revealed {
  animation: flashReveal 0.4s ease-out forwards;
}

.hud-root--cinema .hud-block {
  padding: 0.55rem 0.7rem;
}

.hud-root--drama .hud-block {
  border-color: rgba(185, 28, 28, 0.28);
}
</style>
