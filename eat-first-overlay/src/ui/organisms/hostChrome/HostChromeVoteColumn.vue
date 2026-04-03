<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hostControlChromeStore as store } from '../../../composables/hostControlChrome.js'
import { useHostChromeAct } from '../../../composables/useHostChromeAct.js'

const { t } = useI18n()
const act = useHostChromeAct()

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

const targetPlayerId = computed(() => String(store.gameRoom?.voting?.targetPlayer ?? '').trim())
const votingActive = computed(() => Boolean(store.gameRoom?.voting?.active))
const canStart = computed(() => Boolean(targetPlayerId.value) && !votingActive.value)
const countFor = computed(() => (store.votesLive || []).filter((v) => v.choice !== 'against').length)
const countAgainst = computed(() => (store.votesLive || []).filter((v) => v.choice === 'against').length)
const showLiveScore = computed(() => countFor.value + countAgainst.value > 0)

const voteHistory = computed(() =>
  Array.isArray(store.voteHistorySessions) ? store.voteHistorySessions.slice(0, 15) : [],
)

const handRaiseChips = computed(() => {
  const hr = store.handRaises && typeof store.handRaises === 'object' ? store.handRaises : {}
  return Object.keys(hr)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((id) => ({ id, n: Math.max(0, Math.floor(Number(hr[id]) || 0)) }))
    .filter((x) => x.n > 0)
})

function sessionTally(sess) {
  let f = 0
  let a = 0
  for (const v of sess?.votes || []) {
    if (v.choice === 'against') a += 1
    else f += 1
  }
  return { f, a }
}
</script>

<template>
  <section class="hcc-panel hcc-panel--vote" :aria-label="t('hostChrome.voting')">
    <h3 class="hcc-panel-title">{{ t('hostChrome.voting') }}</h3>
    <div class="hcc-target-block">
      <span class="hcc-target-block__lbl">{{ t('hostChrome.target') }}</span>
      <strong class="hcc-target-block__id">{{ targetPlayerId || '—' }}</strong>
    </div>
    <div class="hcc-vote-big">
      <button
        type="button"
        class="hcc-btn-xl hcc-btn-xl--go"
        :disabled="!canStart"
        :title="t('hostChrome.startVoteTitle')"
        @click="act('votingStart')"
      >
        {{ t('hostChrome.start') }}
      </button>
      <button
        type="button"
        class="hcc-btn-xl hcc-btn-xl--stop"
        :disabled="!votingActive"
        :title="t('hostChrome.stopVoteTitle')"
        @click="act('votingFinish')"
      >
        {{ t('hostChrome.stop') }}
      </button>
    </div>
    <details class="hcc-live">
      <summary class="hcc-live__sum">
        {{ t('hostChrome.live') }}
        <template v-if="showLiveScore">
          <span class="hcc-live__sc">👍 {{ countFor }}</span>
          <span class="hcc-live__sc">👎 {{ countAgainst }}</span>
        </template>
        <span v-else class="hcc-live__empty">· 0</span>
      </summary>
      <p v-if="store.allPlayersVoted && votingActive" class="hcc-all">{{ t('hostChrome.allVoted') }}</p>
      <p v-if="!targetPlayerId && !votingActive" class="hcc-hint">{{ t('hostChrome.targetHint') }}</p>
      <ul v-if="lines.length" class="hcc-list">
        <li v-for="row in lines" :key="row.voterId" class="hcc-li">
          <span>{{ row.label }}</span>
          <button type="button" class="hcc-rm" @click="act('removeVote', row.voterId)">×</button>
        </li>
      </ul>
      <p v-else-if="votingActive" class="hcc-no-v">{{ t('hostChrome.noVotes') }}</p>
    </details>

    <details v-if="handRaiseChips.length" class="hcc-sess hcc-sess--hands">
      <summary class="hcc-sess__sum">✋ {{ t('hostChrome.sessionHands') }}</summary>
      <ul class="hcc-sess-list">
        <li v-for="row in handRaiseChips" :key="row.id" class="hcc-sess-li">
          <span>{{ row.id }}</span>
          <span class="hcc-sess-n">×{{ row.n }}</span>
        </li>
      </ul>
    </details>

    <details v-if="voteHistory.length" class="hcc-sess hcc-sess--hist">
      <summary class="hcc-sess__sum">{{ t('hostChrome.sessionHistory') }}</summary>
      <p class="hcc-sess-hint">{{ t('hostChrome.sessionHistoryHint') }}</p>
      <div class="hcc-hist-stack">
        <div v-for="sess in voteHistory" :key="sess.id" class="hcc-hist-card">
          <p class="hcc-hist-card__title">
            R{{ sess.round }} · {{ t('hostChrome.target') }} {{ sess.target || '—' }} · 👍 {{ sessionTally(sess).f }} · 👎
            {{ sessionTally(sess).a }}
          </p>
          <ul v-if="sess.votes && sess.votes.length" class="hcc-hist-ul">
            <li v-for="(v, idx) in sess.votes" :key="sess.id + '-' + idx + '-' + v.voter" class="hcc-hist-li">
              <span class="hcc-hist-voter">{{ v.voter }}</span>
              <span class="hcc-hist-glyph">{{ choiceGlyph(v.choice) }}</span>
            </li>
          </ul>
        </div>
      </div>
    </details>
  </section>
</template>
