<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** join | controlHost | controlPlayer | overlay */
  tourKey: { type: String, default: '' },
})

const emit = defineEmits(['update:open', 'complete', 'dismiss-save'])

const { t, tm } = useI18n()

const stepIndex = ref(0)
const saveDismiss = ref(true)

const tourTitle = computed(() => {
  const k = props.tourKey
  if (!k) return ''
  return t(`onboarding.tours.${k}.title`)
})

const steps = computed(() => {
  const k = props.tourKey
  if (!k) return []
  const raw = tm(`onboarding.tours.${k}.steps`)
  if (!Array.isArray(raw)) return []
  return raw.map((item, i) => {
    if (item && typeof item === 'object') {
      return {
        title: String(item.title ?? ''),
        text: String(item.text ?? ''),
        key: `${k}-${i}`,
      }
    }
    return { title: '', text: '', key: `${k}-${i}` }
  })
})

const total = computed(() => steps.value.length)
const currentStep = computed(() => steps.value[stepIndex.value] ?? null)
const isLast = computed(() => total.value > 0 && stepIndex.value >= total.value - 1)

watch(
  () => props.open,
  (v) => {
    if (v) {
      stepIndex.value = 0
      saveDismiss.value = true
    }
  },
)

watch(
  () => props.tourKey,
  () => {
    stepIndex.value = 0
  },
)

function close() {
  emit('update:open', false)
}

function finish() {
  emit('complete', { saveDismiss: saveDismiss.value })
  if (saveDismiss.value) emit('dismiss-save')
  emit('update:open', false)
}

function next() {
  if (isLast.value) {
    finish()
    return
  }
  stepIndex.value = Math.min(stepIndex.value + 1, Math.max(0, total.value - 1))
}

function back() {
  stepIndex.value = Math.max(0, stepIndex.value - 1)
}

function onBackdropClick() {
  close()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && tourKey && total > 0"
      class="onb"
      role="presentation"
      @keydown.escape.prevent="close"
    >
      <button type="button" class="onb__backdrop" :aria-label="t('onboarding.close')" @click="onBackdropClick" />
      <div
        class="onb__panel"
        role="dialog"
        aria-modal="true"
        :aria-label="tourTitle"
        @click.stop
      >
        <div class="onb__head">
          <h2 class="onb__title">{{ tourTitle }}</h2>
          <button type="button" class="onb__x" :aria-label="t('onboarding.close')" @click="close">×</button>
        </div>
        <p class="onb__progress">{{ t('onboarding.progress', { n: stepIndex + 1, total }) }}</p>
        <div v-if="currentStep" class="onb__body">
          <h3 class="onb__step-title">{{ currentStep.title }}</h3>
          <p class="onb__step-text">{{ currentStep.text }}</p>
        </div>
        <label class="onb__remember">
          <input v-model="saveDismiss" type="checkbox" />
          <span>{{ t('onboarding.dontShowAgain') }}</span>
        </label>
        <div class="onb__actions">
          <button type="button" class="onb__btn onb__btn--ghost" @click="close">{{ t('onboarding.close') }}</button>
          <div class="onb__nav">
            <button
              type="button"
              class="onb__btn onb__btn--ghost"
              :disabled="stepIndex <= 0"
              @click="back"
            >
              {{ t('onboarding.back') }}
            </button>
            <button type="button" class="onb__btn onb__btn--primary" @click="next">
              {{ isLast ? t('onboarding.done') : t('onboarding.next') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.onb {
  position: fixed;
  inset: 0;
  z-index: 11970;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}

.onb__backdrop {
  position: absolute;
  inset: 0;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
}

.onb__panel {
  position: relative;
  width: min(26rem, 100%);
  max-height: min(90vh, 32rem);
  overflow: auto;
  padding: 1.15rem 1.2rem 1rem;
  border-radius: 16px;
  border: 1px solid var(--border-strong);
  background: var(--bg-dropdown, var(--bg-card-solid));
  box-shadow: 0 20px 56px var(--shadow-deep);
  box-sizing: border-box;
}

.onb__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

.onb__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  font-family: var(--font-display, sans-serif);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-heading);
  line-height: 1.3;
}

.onb__x {
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  margin: -0.2rem -0.35rem 0 0;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: var(--bg-muted-strong);
  color: var(--text-muted);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.onb__x:hover {
  color: var(--text-heading);
}

.onb__progress {
  margin: 0 0 0.65rem;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-cyan-strong, #7dd3fc);
}

.onb__body {
  margin-bottom: 0.85rem;
}

.onb__step-title {
  margin: 0 0 0.45rem;
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--text-heading);
  line-height: 1.35;
}

.onb__step-text {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.5;
  color: var(--text-muted);
  white-space: pre-line;
}

.onb__remember {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0 0 0.9rem;
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1.4;
}

.onb__remember input {
  margin-top: 0.12rem;
  flex-shrink: 0;
}

.onb__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.onb__nav {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.onb__btn {
  padding: 0.42rem 0.75rem;
  border-radius: 10px;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--border-input);
  background: var(--bg-card-soft);
  color: var(--text-body);
}

.onb__btn--ghost {
  opacity: 0.92;
}

.onb__btn--primary {
  border-color: rgba(168, 85, 247, 0.45);
  background: linear-gradient(165deg, var(--btn-neon-top, #6d28d9), var(--btn-neon-bot, #4c1d95));
  color: var(--text-title, #faf5ff);
}

.onb__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
