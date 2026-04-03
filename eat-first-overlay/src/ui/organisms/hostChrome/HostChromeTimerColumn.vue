<script setup>
import { useI18n } from 'vue-i18n'
import { hostControlChromeStore as store } from '../../../composables/hostControlChrome.js'
import { useHostChromeAct } from '../../../composables/useHostChromeAct.js'

const { t } = useI18n()
const act = useHostChromeAct()
</script>

<template>
  <section class="hcc-panel hcc-panel--timer" :aria-label="t('hostChrome.timer')">
    <h3 class="hcc-panel-title">{{ t('hostChrome.timer') }}</h3>
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
      <button type="button" class="hcc-btn-xl hcc-btn-xl--primary" @click="act('startTimer')">
        {{ t('hostChrome.timerStart') }}
      </button>
      <button type="button" class="hcc-btn-xl hcc-btn-xl--ghost" @click="act('pauseTimer')">‖</button>
      <button type="button" class="hcc-btn-xl hcc-btn-xl--ghost" @click="act('resumeTimer')">▶</button>
      <button type="button" class="hcc-btn-xl hcc-btn-xl--ghost" @click="act('clearTimer')">↺</button>
      <button type="button" class="hcc-btn-xl hcc-btn-xl--next" @click="act('nextSpeaker')">
        {{ t('hostChrome.next') }}
      </button>
    </div>
    <p v-if="store.gameRoom?.timerPaused" class="hcc-pause-note">{{ t('hostChrome.timerPausedNote') }}</p>
  </section>
</template>
