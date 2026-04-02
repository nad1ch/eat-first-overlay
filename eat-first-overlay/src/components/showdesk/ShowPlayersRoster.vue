<script setup>
import { computed } from 'vue'

const props = defineProps({
  players: { type: Array, default: () => [] },
  handsMap: { type: Object, default: () => ({}) },
  currentPlayerId: { type: String, default: '' },
  spotlightPlayerId: { type: String, default: '' },
  speakerId: { type: String, default: '' },
  votingTargetId: { type: String, default: '' },
  votingActive: { type: Boolean, default: false },
  /** Нормалізовані номінації [{ target, by }] */
  nominations: { type: Array, default: () => [] },
  /** Вибраний слот для панелі дій */
  selectedPlayerId: { type: String, default: '' },
  /** Режим ведучого: сітка + панель без модалки */
  useHostPanel: { type: Boolean, default: false },
  /** Слоти для чипів «хто виставляє» */
  playerSlots: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'open-editor',
  'host-command',
  'update:selectedPlayerId',
  'toggle-nomination',
])

function cardActive(p) {
  const ac = p.activeCard
  if (!ac || typeof ac !== 'object') return false
  return !ac.used
}

function slotNum(id) {
  const s = String(id ?? '')
  const m = s.match(/^p(\d+)$/i)
  if (m) return m[1]
  return s.replace(/^p/i, '') || s
}

function nominatorsFor(pid) {
  const id = String(pid ?? '')
  return props.nominations.filter((n) => String(n.target) === id).map((n) => slotNum(n.by))
}

function nominatorsLine(pid) {
  const nums = nominatorsFor(pid)
  return nums.length ? nums.join(', ') : ''
}

function statusLine(p) {
  if (p.eliminated === true) return 'Вибув'
  if (String(p.id) === String(props.spotlightPlayerId || '').trim()) return 'Spotlight'
  return '—'
}

function isSpeak(p) {
  return p.eliminated !== true && String(p.id) === String(props.speakerId || '').trim()
}

function isVoteTargetCard(p) {
  const sp = String(props.speakerId || '').trim()
  const vt = String(props.votingTargetId || '').trim()
  return (
    p.eliminated !== true &&
    props.votingActive &&
    Boolean(vt) &&
    String(p.id) === vt &&
    String(p.id) !== sp
  )
}

function isNominatedCard(p) {
  return p.eliminated !== true && nominatorsFor(p.id).length > 0
}

function showBadgesRow(p) {
  if (p.eliminated === true) return false
  if (isSpeak(p)) return true
  return isVoteTargetCard(p) || isNominatedCard(p)
}

function handUp(p) {
  return props.handsMap?.[String(p.id)] === true
}

const playersSorted = computed(() => {
  const list = [...props.players]
  list.sort((a, b) => {
    const ah = handUp(a) ? 1 : 0
    const bh = handUp(b) ? 1 : 0
    if (bh !== ah) return bh - ah
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' })
  })
  return list
})

const selectedPlayer = computed(() => {
  const id = String(props.selectedPlayerId || '').trim()
  if (!id) return null
  return props.players.find((p) => String(p.id) === id) || null
})

const selectedEliminated = computed(() => selectedPlayer.value?.eliminated === true)

const spotlightOnSelected = computed(
  () =>
    Boolean(props.selectedPlayerId) &&
    String(props.spotlightPlayerId || '').trim() === String(props.selectedPlayerId),
)

const speakerOnSelected = computed(
  () =>
    Boolean(props.selectedPlayerId) &&
    String(props.speakerId || '').trim() === String(props.selectedPlayerId),
)

function onCardClick(p) {
  if (props.useHostPanel) {
    const id = String(p.id)
    emit('update:selectedPlayerId', props.selectedPlayerId === id ? '' : id)
    return
  }
  emit('open-editor', p.id)
}

function openEditorSelected() {
  const id = props.selectedPlayerId
  if (id) emit('open-editor', id)
}

function cmd(type) {
  const id = String(props.selectedPlayerId || '').trim()
  if (!id) return
  emit('host-command', { type, playerId: id })
}

function pairActive(bySlot) {
  const t = String(props.selectedPlayerId || '').trim()
  const b = String(bySlot || '').trim()
  if (!t || !b) return false
  return props.nominations.some((n) => String(n.target) === t && String(n.by) === b)
}

function toggleNom(bySlot) {
  const target = String(props.selectedPlayerId || '').trim()
  const by = String(bySlot || '').trim()
  if (!target || !by || selectedEliminated.value) return
  emit('toggle-nomination', { target, by })
}

const aliveSlotsForNom = computed(() => {
  const dead = new Set(props.players.filter((p) => p.eliminated === true).map((p) => String(p.id)))
  return props.playerSlots.filter((s) => !dead.has(String(s)))
})
</script>

<template>
  <section class="roster">
    <h2 class="block-title">Гравці</h2>
    <p class="roster-hint">
      {{
        useHostPanel
          ? 'Ліворуч — слоти. Клік виділяє; усі дії — у панелі справа.'
          : 'Клік — відкрити картку.'
      }}
    </p>

    <div class="roster-shell" :class="{ 'roster-shell--panel': useHostPanel }">
      <div class="roster-grid">
        <button
          v-for="p in playersSorted"
          :key="p.id"
          type="button"
          class="pcard"
          :class="{
            on: p.id === currentPlayerId,
            pick: useHostPanel && String(selectedPlayerId) === String(p.id),
            elim: p.eliminated === true,
            speak: String(speakerId || '').trim() === p.id,
            spot: String(spotlightPlayerId || '').trim() === p.id,
            'pcard--hand': handUp(p),
            'pcard--vote-target':
              votingActive &&
              String(votingTargetId || '').trim() === p.id &&
              p.eliminated !== true &&
              String(speakerId || '').trim() !== p.id,
          }"
          @click="onCardClick(p)"
        >
          <span
            v-if="handUp(p) && p.eliminated !== true"
            class="pcard-hand-corner"
            aria-label="Піднята рука"
            title="Піднята рука"
          >
            ✋
          </span>
          <span v-if="p.eliminated === true" class="elim-badge" aria-hidden="true">ВИБУВ</span>
          <div v-else-if="showBadgesRow(p)" class="pcard-badges">
            <span v-if="isSpeak(p)" class="pcb pcb--speak">ГОВОРИТЬ</span>
            <template v-else>
              <span v-if="isVoteTargetCard(p)" class="pcb pcb--target">ЦІЛЬ</span>
              <template v-if="isNominatedCard(p)">
                <span class="pcb pcb--nom">НОМІН.</span>
                <span class="pcb pcb--nom-who">{{ nominatorsLine(p.id) }}</span>
              </template>
            </template>
          </div>
          <span class="num">{{ slotNum(p.id) }}</span>
          <span class="st">{{ statusLine(p) }}</span>
          <span v-if="cardActive(p)" class="card-ico" title="Є активна карта">🃏</span>
        </button>
      </div>

      <aside v-if="useHostPanel" class="act-panel">
        <template v-if="selectedPlayer">
          <p class="act-panel__id">{{ selectedPlayerId }}</p>
          <button type="button" class="act-btn act-btn--soft" @click="openEditorSelected">📝 Редактор</button>

          <template v-if="!selectedEliminated">
            <button v-if="!speakerOnSelected" type="button" class="act-btn" @click="cmd('speaker')">
              🎤 Спікер
            </button>
            <button v-else type="button" class="act-btn" @click="cmd('speaker')">✖ Забрати спікера</button>

            <p class="act-sub">⚖️ Номінувати</p>
            <p class="act-micro">Вибери хто виставляє:</p>
            <div class="act-chips">
              <button
                v-for="slot in aliveSlotsForNom"
                :key="'nom-' + slot"
                type="button"
                class="nchip"
                :class="{ 'nchip--on': pairActive(slot), 'nchip--self': String(slot) === String(selectedPlayerId) }"
                :disabled="String(slot) === String(selectedPlayerId)"
                @click="toggleNom(slot)"
              >
                {{ slotNum(slot) }}
              </button>
            </div>

            <button type="button" class="act-btn" @click="cmd('vote-target')">🗳️ Ціль голосування</button>
            <button type="button" class="act-btn act-btn--soft" @click="cmd('spotlight')">
              {{ spotlightOnSelected ? '⭐ Зняти spotlight' : '⭐ Spotlight' }}
            </button>
          </template>

          <button type="button" class="act-btn act-btn--danger" @click="cmd('reset')">❌ Скинути</button>
        </template>
        <p v-else class="act-empty">Оберіть слот зліва</p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.roster {
  padding: 1rem 1.1rem;
  border-radius: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  margin-bottom: 1rem;
}

.block-title {
  margin: 0 0 0.35rem;
  font-size: 0.88rem;
  font-weight: 800;
  color: var(--text-heading);
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.06em;
}

.roster-hint {
  margin: 0 0 0.85rem;
  font-size: 0.65rem;
  line-height: 1.35;
  color: var(--text-muted);
}

.roster-shell {
  display: block;
}

.roster-shell--panel {
  display: grid;
  grid-template-columns: 1fr minmax(200px, 38%);
  gap: 0.75rem;
  align-items: start;
}

@media (max-width: 720px) {
  .roster-shell--panel {
    grid-template-columns: 1fr;
  }
}

.roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 0.45rem;
}

.pcard-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.2rem;
  margin-bottom: 0.15rem;
  min-height: 1rem;
}

.pcb {
  padding: 0.1rem 0.28rem;
  border-radius: 4px;
  font-size: 0.45rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  line-height: 1.2;
  white-space: nowrap;
}

.pcb--speak {
  color: #faf5ff;
  background: rgba(109, 40, 217, 0.75);
  border: 1px solid rgba(196, 181, 253, 0.55);
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.35);
}

.pcb--target {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.65);
  border: 1px solid rgba(248, 113, 113, 0.45);
}

.pcb--nom {
  color: #fde68a;
  background: rgba(120, 53, 15, 0.5);
  border: 1px solid rgba(251, 191, 36, 0.35);
  font-size: 0.42rem;
}

.pcb--nom-who {
  color: #fef3c7;
  background: rgba(55, 35, 10, 0.55);
  border: 1px solid rgba(251, 191, 36, 0.25);
  font-size: 0.4rem;
  font-weight: 800;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pcard-hand-corner {
  position: absolute;
  left: 0.2rem;
  top: 0.2rem;
  z-index: 3;
  font-size: 1rem;
  line-height: 1;
  filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.55));
  pointer-events: none;
}

.pcard {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-height: 4.85rem;
  padding: 0.45rem 0.35rem 0.5rem;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-muted);
  color: var(--text-body);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    border-color 0.15s,
    box-shadow 0.15s;
}

.pcard:hover {
  transform: scale(1.03);
  border-color: rgba(168, 85, 247, 0.45);
  box-shadow: 0 0 20px rgba(168, 85, 247, 0.2);
}

.pcard.on {
  border-color: rgba(168, 85, 247, 0.65);
  box-shadow: 0 0 18px rgba(168, 85, 247, 0.25);
}

.pcard.pick:not(.elim) {
  border-color: rgba(52, 211, 153, 0.55);
  box-shadow: 0 0 20px rgba(45, 212, 191, 0.22);
}

.pcard--hand:not(.elim) {
  border-color: rgba(251, 191, 36, 0.35);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.12);
}

.pcard--vote-target:not(.elim):not(.speak) {
  border: 2px solid rgba(239, 68, 68, 0.7);
  box-shadow:
    0 0 25px rgba(239, 68, 68, 0.3),
    inset 0 0 10px rgba(239, 68, 68, 0.2);
}

.pcard--vote-target:not(.elim) .st {
  color: rgba(252, 165, 165, 0.95);
}

.pcard.speak:not(.elim) {
  border-color: rgba(168, 85, 247, 0.55);
  box-shadow: 0 0 22px rgba(168, 85, 247, 0.35);
  animation: neonPulse 2s ease-in-out infinite;
}

.pcard.spot:not(.elim):not(.speak) {
  border-color: rgba(251, 191, 36, 0.45);
}

.pcard.elim {
  position: relative;
  opacity: 0.55;
  border-color: rgba(127, 29, 29, 0.55);
  background: linear-gradient(160deg, rgba(40, 10, 14, 0.92), rgba(0, 0, 0, 0.55));
  box-shadow: inset 0 0 48px rgba(0, 0, 0, 0.65);
}

.pcard.elim::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.pcard.elim > * {
  position: relative;
  z-index: 1;
}

.elim-badge {
  position: absolute;
  top: 0.2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 0.12rem 0.35rem;
  border-radius: 6px;
  font-size: 0.5rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #fecaca;
  background: rgba(127, 29, 29, 0.92);
  border: 1px solid rgba(248, 113, 113, 0.45);
  line-height: 1;
  white-space: nowrap;
}

@keyframes neonPulse {
  0%,
  100% {
    box-shadow: 0 0 16px rgba(168, 85, 247, 0.28);
  }
  50% {
    box-shadow: 0 0 28px rgba(168, 85, 247, 0.5);
  }
}

.num {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.35rem;
  font-weight: 900;
  color: var(--text-title);
  line-height: 1;
}

.st {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.pcard.speak .st {
  color: #e9d5ff;
}

.pcard.elim .st {
  color: #fecaca;
}

.card-ico {
  position: absolute;
  top: 0.25rem;
  right: 0.3rem;
  font-size: 0.75rem;
  line-height: 1;
  filter: drop-shadow(0 0 6px rgba(168, 85, 247, 0.5));
}

.act-panel {
  position: sticky;
  top: 0.5rem;
  padding: 0.75rem 0.8rem;
  border-radius: 14px;
  background: var(--bg-card-solid);
  border: 1px solid var(--border-strong);
  box-shadow: 0 8px 28px var(--shadow-deep);
}

.act-panel__id {
  margin: 0 0 0.6rem;
  font-family: 'Orbitron', sans-serif;
  font-size: 1.1rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: var(--text-heading);
  text-align: center;
}

.act-sub {
  margin: 0.65rem 0 0.2rem;
  font-size: 0.72rem;
  font-weight: 800;
  color: #fde68a;
}

.act-micro {
  margin: 0 0 0.35rem;
  font-size: 0.58rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.85);
}

.act-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.55rem;
}

.nchip {
  min-width: 2.1rem;
  padding: 0.28rem 0.4rem;
  border-radius: 8px;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.72rem;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.4);
  color: #cbd5e1;
  transition: transform 0.1s ease;
}

.nchip:hover:not(:disabled) {
  transform: scale(1.06);
  border-color: rgba(251, 191, 36, 0.4);
}

.nchip--on {
  border-color: rgba(251, 191, 36, 0.65);
  background: rgba(120, 53, 15, 0.55);
  color: #fef3c7;
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.2);
}

.nchip:disabled,
.nchip--self {
  opacity: 0.35;
  cursor: not-allowed;
}

.act-btn {
  display: block;
  width: 100%;
  margin-bottom: 0.38rem;
  padding: 0.48rem 0.55rem;
  border-radius: 10px;
  font-size: 0.74rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  border: 1px solid var(--border-input);
  background: var(--bg-card-soft);
  color: var(--text-body);
  transition:
    transform 0.1s ease,
    border-color 0.15s;
}

.act-btn:hover {
  transform: scale(1.01);
  border-color: rgba(168, 85, 247, 0.45);
}

.act-btn--soft {
  font-size: 0.7rem;
  opacity: 0.95;
}

.act-btn--danger {
  border-color: rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.act-empty {
  margin: 0;
  font-size: 0.72rem;
  color: var(--text-muted);
  text-align: center;
  padding: 1.2rem 0.25rem;
}
</style>
