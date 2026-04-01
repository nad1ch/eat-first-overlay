<script setup>
import { computed } from 'vue'
import { fieldConfig } from '../characterState'

const HUD_LEFT = ['profession', 'health', 'phobia']
const HUD_RIGHT = ['luggage', 'fact', 'quirk']

const props = defineProps({
  player: { type: Object, required: true },
  highlighted: { type: Boolean, default: false },
  solo: { type: Boolean, default: false },
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
  return String(player.id ?? '').toUpperCase()
}
</script>

<template>
  <!-- Режим шоу: компактна картка в grid -->
  <article
    v-if="!solo"
    class="card-grid"
    :class="{
      'card-grid--hl': highlighted,
      'card-grid--eliminated': isEliminated(player),
    }"
  >
    <Transition name="badge-pop">
      <div v-if="isEliminated(player)" class="eliminated-badge" aria-hidden="true">ВИБУВ</div>
    </Transition>
    <div
      class="card-grid-body"
      :class="{ 'card-grid-body--eliminated': isEliminated(player) }"
    >
      <p class="card-grid-id">{{ player.id }}</p>
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
            }"
          >
            {{ displayStat(player, row.key) }}
          </span>
        </li>
      </ul>
    </div>
  </article>

  <!-- Персональний стрім: HUD по краях, центр вільний під вебку -->
  <div
    v-else
    class="hud-root"
    :class="{
      'hud-root--eliminated': isEliminated(player),
      'hud-root--active': highlighted,
    }"
  >
    <div v-if="isEliminated(player)" class="hud-eliminated-veil" aria-hidden="true" />
    <Transition name="badge-pop">
      <div v-if="isEliminated(player)" class="hud-eliminated-badge" aria-hidden="true">ВИБУВ</div>
    </Transition>

    <div class="hud-zones">
      <div class="hud-block hud-tl">
        <p class="hud-meta-line">
          <span class="hud-meta-k">Вік</span>
          <span class="hud-meta-v">{{ displayLine(player.age) }}</span>
        </p>
        <p class="hud-meta-line">
          <span class="hud-meta-k">Гендер</span>
          <span class="hud-meta-v">{{ displayLine(player.gender) }}</span>
        </p>
        <p class="hud-meta-line hud-meta-name">
          <span class="hud-meta-k">Ім’я</span>
          <span class="hud-meta-v">{{ displayName(player) }}</span>
        </p>
      </div>

      <div class="hud-block hud-tr">
        <span class="hud-slot">{{ playerIdDisplay(player) }}</span>
      </div>

      <div class="hud-block hud-bl">
        <div
          v-for="key in HUD_LEFT"
          :key="key"
          class="hud-row"
        >
          <span class="hud-label">{{ labelByKey[key] }}</span>
          <span
            :key="valueRevealKey(player, key)"
            class="hud-value"
            :class="{
              'hud-value--hidden': !chunkFor(player, key).revealed,
              'value--revealed': chunkFor(player, key).revealed,
            }"
          >
            {{ displayStat(player, key) }}
          </span>
        </div>
      </div>

      <div class="hud-block hud-br">
        <div
          v-for="key in HUD_RIGHT"
          :key="key"
          class="hud-row"
        >
          <span class="hud-label">{{ labelByKey[key] }}</span>
          <span
            :key="valueRevealKey(player, key)"
            class="hud-value"
            :class="{
              'hud-value--hidden': !chunkFor(player, key).revealed,
              'value--revealed': chunkFor(player, key).revealed,
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
/* ========== Grid (глобальний overlay) ========== */
.card-grid {
  position: relative;
  padding: 0;
  border-radius: 16px;
  background: rgba(18, 22, 34, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  overflow: hidden;
  transition: border-color 0.32s ease, box-shadow 0.32s ease, background 0.32s ease;
}

.card-grid-body {
  padding: 1rem 1.1rem 1.15rem;
  transition: opacity 0.32s ease, filter 0.32s ease;
}

.card-grid-body--eliminated {
  opacity: 0.3;
  filter: grayscale(1);
}

.card-grid--hl {
  border-color: rgba(129, 140, 248, 0.55);
  box-shadow:
    0 0 0 1px rgba(129, 140, 248, 0.25),
    0 16px 36px rgba(0, 0, 0, 0.45),
    0 0 24px rgba(129, 140, 248, 0.15);
}

.card-grid--eliminated {
  background: rgba(22, 8, 12, 0.92);
  border-color: rgba(220, 38, 38, 0.5);
  box-shadow:
    0 0 32px rgba(239, 68, 68, 0.38),
    inset 0 0 48px rgba(127, 29, 29, 0.35),
    0 12px 28px rgba(0, 0, 0, 0.5);
}

.eliminated-badge {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  z-index: 2;
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.75);
  border: 1px solid rgba(248, 113, 113, 0.45);
  text-shadow: 0 0 12px rgba(220, 38, 38, 0.65);
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.35);
}

.card-grid-id {
  margin: 0 0 0.25rem;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.65);
}

.card-grid-name {
  margin: 0 0 0.65rem;
  font-size: clamp(0.95rem, 2vw, 1.1rem);
  font-weight: 600;
  color: #a5b4fc;
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
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.label {
  font-size: 0.68rem;
  color: rgba(226, 232, 255, 0.5);
}

.value {
  display: inline-block;
  font-size: 0.75rem;
  color: #f1f5ff;
  text-align: right;
  word-break: break-word;
  transform-origin: center right;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.value.hidden {
  font-size: 0.85rem;
  opacity: 0.92;
  transition:
    opacity 0.3s ease,
    filter 0.3s ease,
    transform 0.3s ease;
}

.value--revealed {
  animation: valueReveal 0.48s ease forwards;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

@keyframes valueReveal {
  0% {
    opacity: 0;
    filter: blur(10px);
    transform: scale(0.96);
  }
  55% {
    opacity: 1;
    filter: blur(0);
    transform: scale(1.05);
  }
  100% {
    opacity: 1;
    filter: blur(0);
    transform: scale(1);
  }
}

.badge-pop-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.badge-pop-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.badge-pop-enter-from,
.badge-pop-leave-to {
  opacity: 0;
  transform: scale(0.88);
}

.badge-pop-enter-to,
.badge-pop-leave-from {
  opacity: 1;
  transform: scale(1);
}

/* ========== HUD (персональний overlay) ========== */
.hud-root {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  min-height: min(100vh, 100%);
  pointer-events: none;
  box-sizing: border-box;
}

.hud-eliminated-veil {
  position: absolute;
  inset: 0;
  z-index: 4;
  background: rgba(90, 20, 30, 0.2);
  transition: background 0.35s ease, opacity 0.35s ease;
  pointer-events: none;
}

.hud-root--eliminated .hud-eliminated-veil {
  background: rgba(100, 25, 35, 0.28);
}

.hud-eliminated-badge {
  position: absolute;
  top: clamp(4rem, 10vh, 5.5rem);
  right: clamp(0.75rem, 2vw, 1.5rem);
  z-index: 6;
  padding: 0.3rem 0.65rem;
  border-radius: 8px;
  font-size: clamp(0.72rem, 1.8vw, 0.85rem);
  font-weight: 900;
  letter-spacing: 0.18em;
  color: #fecaca;
  background: rgba(80, 15, 22, 0.82);
  border: 1px solid rgba(248, 113, 113, 0.55);
  text-shadow: 0 0 14px rgba(220, 38, 38, 0.75);
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
  pointer-events: none;
}

.hud-zones {
  position: absolute;
  inset: 0;
  z-index: 2;
  animation: hudFloat 6s ease-in-out infinite;
}

.hud-root--active .hud-zones {
  animation:
    hudFloat 6s ease-in-out infinite,
    hudPulse 1.5s ease-in-out infinite;
}

@keyframes hudFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

@keyframes hudPulse {
  0%,
  100% {
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.12));
  }
  50% {
    filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.45));
  }
}

.hud-block {
  position: absolute;
  max-width: min(38vw, 360px);
  width: max-content;
  padding: 0.55rem 0.75rem;
  border-radius: 14px;
  background: rgba(10, 12, 20, 0.52);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.hud-tl {
  top: clamp(0.75rem, 2vh, 1.5rem);
  left: clamp(0.75rem, 2vw, 1.5rem);
}

.hud-tr {
  top: clamp(0.75rem, 2vh, 1.5rem);
  right: clamp(0.75rem, 2vw, 1.5rem);
  text-align: right;
  padding: 0.5rem 0.85rem;
}

.hud-bl {
  bottom: clamp(0.75rem, 2vh, 1.75rem);
  left: clamp(0.75rem, 2vw, 1.5rem);
}

.hud-br {
  bottom: clamp(0.75rem, 2vh, 1.75rem);
  right: clamp(0.75rem, 2vw, 1.5rem);
  text-align: right;
}

.hud-meta-line {
  margin: 0 0 0.35rem;
  font-size: 14px;
  line-height: 1.35;
  color: #e2e8f0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  align-items: baseline;
}

.hud-meta-line:last-child {
  margin-bottom: 0;
}

.hud-meta-k {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
  min-width: 3.5rem;
}

.hud-meta-v {
  font-weight: 600;
  color: #f8fafc;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.hud-meta-name .hud-meta-v {
  font-size: 15px;
}

.hud-slot {
  font-size: clamp(2rem, 5.5vw, 3.25rem);
  font-weight: 900;
  letter-spacing: 0.06em;
  color: #eef2ff;
  text-shadow:
    0 0 24px rgba(129, 140, 248, 0.55),
    0 2px 8px rgba(0, 0, 0, 0.6);
  line-height: 1;
}

.hud-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 0.35rem 0.65rem;
  align-items: baseline;
  padding: 0.38rem 0;
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
  font-size: clamp(11px, 1.8vw, 12px);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(186, 198, 230, 0.75);
  text-align: left;
}

.hud-br .hud-label {
  text-align: left;
}

.hud-value {
  font-size: clamp(14px, 2.2vw, 17px);
  font-weight: 700;
  color: #f8fafc;
  text-align: right;
  word-break: break-word;
  line-height: 1.25;
  transform-origin: center right;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
}

.hud-value--hidden {
  font-size: clamp(16px, 2.5vw, 20px);
  opacity: 0.95;
  transition: opacity 0.3s ease, filter 0.3s ease;
}

.hud-value.value--revealed {
  animation: valueReveal 0.48s ease forwards;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.05rem 0.2rem;
  margin: -0.05rem -0.2rem;
}
</style>
