<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  players: { type: Array, default: () => [] },
  handsMap: { type: Object, default: () => ({}) },
  currentPlayerId: { type: String, default: '' },
  spotlightPlayerId: { type: String, default: '' },
  speakerId: { type: String, default: '' },
  votingTargetId: { type: String, default: '' },
  votingActive: { type: Boolean, default: false },
  nominatedPlayerId: { type: String, default: '' },
  /** Клік по картці → меню дій (ведучий) */
  useActionMenu: { type: Boolean, default: false },
})

const emit = defineEmits(['open-editor', 'host-command'])

const menuPlayerId = ref(null)

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
  const n = String(props.nominatedPlayerId || '').trim()
  return p.eliminated !== true && Boolean(n) && String(p.id) === n
}

function showBadgesRow(p) {
  if (p.eliminated === true) return false
  if (isSpeak(p)) return true
  return isVoteTargetCard(p) || isNominatedCard(p) || handUp(p)
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

const menuPlayer = computed(() => {
  const id = menuPlayerId.value
  if (!id) return null
  return props.players.find((p) => String(p.id) === id) || null
})

function onCardClick(p) {
  if (props.useActionMenu) {
    menuPlayerId.value = String(p.id)
    return
  }
  emit('open-editor', p.id)
}

function closeMenu() {
  menuPlayerId.value = null
}

function openEditor() {
  const id = menuPlayerId.value
  closeMenu()
  if (id) emit('open-editor', id)
}

function cmd(type) {
  const id = menuPlayerId.value
  if (!id) return
  emit('host-command', { type, playerId: id })
  closeMenu()
}

const menuEliminated = computed(() => menuPlayer.value?.eliminated === true)

const spotlightOnMenuPlayer = computed(
  () =>
    Boolean(menuPlayerId.value) &&
    String(props.spotlightPlayerId || '').trim() === String(menuPlayerId.value),
)
</script>

<template>
  <section class="roster">
    <h2 class="block-title">Гравці</h2>
    <p class="roster-hint">
      {{
        useActionMenu
          ? 'Клік по гравцю — дії: спікер, номінація, ціль голосу, редактор.'
          : 'Клік — відкрити картку.'
      }}
    </p>
    <div class="roster-grid">
      <button
        v-for="p in playersSorted"
        :key="p.id"
        type="button"
        class="pcard"
        :class="{
          on: p.id === currentPlayerId,
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
        <span v-if="p.eliminated === true" class="elim-badge" aria-hidden="true">ВИБУВ</span>
        <div v-else-if="showBadgesRow(p)" class="pcard-badges">
          <span v-if="isSpeak(p)" class="pcb pcb--speak">ГОВОРИТЬ</span>
          <template v-else>
            <span v-if="isVoteTargetCard(p)" class="pcb pcb--target">ЦІЛЬ</span>
            <span v-if="isNominatedCard(p)" class="pcb pcb--nom">НОМІНОВАНИЙ</span>
            <span v-if="handUp(p)" class="pcb pcb--hand">РУКА</span>
          </template>
        </div>
        <span class="num">{{ slotNum(p.id) }}</span>
        <span class="st">{{ statusLine(p) }}</span>
        <span v-if="cardActive(p)" class="card-ico" title="Є активна карта">🃏</span>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="useActionMenu && menuPlayerId"
        class="rpm-backdrop"
        role="presentation"
        @click.self="closeMenu"
      >
        <div class="rpm" role="dialog" aria-modal="true" aria-labelledby="rpm-title" @click.stop>
          <p id="rpm-title" class="rpm__title">{{ menuPlayerId }}</p>
          <button type="button" class="rpm__btn" @click="openEditor">📝 Редактор</button>
          <template v-if="!menuEliminated">
            <button type="button" class="rpm__btn" @click="cmd('speaker')">🎤 Зробити спікером</button>
            <button type="button" class="rpm__btn" @click="cmd('nominate')">⚖️ Виставити</button>
            <button type="button" class="rpm__btn" @click="cmd('vote-target')">🗳️ Зробити ціллю голосування</button>
            <button type="button" class="rpm__btn rpm__btn--soft" @click="cmd('spotlight')">
              {{ spotlightOnMenuPlayer ? '⭐ Зняти spotlight' : '⭐ Spotlight' }}
            </button>
          </template>
          <button type="button" class="rpm__btn rpm__btn--danger" @click="cmd('reset')">❌ Скинути</button>
          <button type="button" class="rpm__close" @click="closeMenu">Закрити</button>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.roster {
  padding: 1rem 1.1rem;
  border-radius: 16px;
  background: rgba(8, 4, 20, 0.88);
  border: 1px solid rgba(168, 85, 247, 0.22);
  margin-bottom: 1rem;
}

.block-title {
  margin: 0 0 0.35rem;
  font-size: 0.88rem;
  font-weight: 800;
  color: #ede9fe;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.06em;
}

.roster-hint {
  margin: 0 0 0.85rem;
  font-size: 0.65rem;
  line-height: 1.35;
  color: rgba(196, 181, 253, 0.4);
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

.pcb--hand {
  color: rgba(226, 232, 240, 0.85);
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(100, 116, 139, 0.4);
  font-weight: 700;
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.35);
  color: #e2e8f0;
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
  color: #faf5ff;
  line-height: 1;
}

.st {
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.55);
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

.rpm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
}

.rpm {
  width: min(100%, 280px);
  padding: 1rem 1rem 0.75rem;
  border-radius: 16px;
  background: rgba(10, 8, 22, 0.98);
  border: 1px solid rgba(168, 85, 247, 0.35);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
}

.rpm__title {
  margin: 0 0 0.75rem;
  font-family: 'Orbitron', sans-serif;
  font-size: 1.15rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #e9d5ff;
  text-align: center;
}

.rpm__btn {
  display: block;
  width: 100%;
  margin-bottom: 0.4rem;
  padding: 0.55rem 0.65rem;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(30, 27, 55, 0.95);
  color: #e2e8f0;
  transition:
    transform 0.1s ease,
    border-color 0.15s;
}

.rpm__btn:hover {
  transform: scale(1.02);
  border-color: rgba(168, 85, 247, 0.45);
}

.rpm__btn--soft {
  font-size: 0.72rem;
  opacity: 0.92;
}

.rpm__btn--danger {
  border-color: rgba(248, 113, 113, 0.35);
  color: #fecaca;
}

.rpm__close {
  display: block;
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.45rem;
  font-size: 0.68rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.9);
  background: transparent;
  border: none;
  cursor: pointer;
}

.rpm__close:hover {
  color: #e2e8f0;
}
</style>
