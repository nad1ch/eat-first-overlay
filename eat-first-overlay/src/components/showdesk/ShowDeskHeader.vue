<script setup>
defineProps({
  gameTitle: { type: String, required: true },
  gameId: { type: String, required: true },
  gamePhase: { type: String, default: 'intro' },
  scenarioLabel: { type: String, default: '' },
  aliveCount: { type: Number, default: 0 },
  personalUrl: { type: String, default: '' },
  globalUrl: { type: String, default: '' },
})

const emit = defineEmits(['copy-personal', 'copy-global'])
</script>

<template>
  <header class="desk-header">
    <div class="desk-header-top">
      <div>
        <h1 class="desk-title">{{ gameTitle }}</h1>
        <p class="desk-sub">Кімната: <code>{{ gameId }}</code></p>
      </div>
      <div class="desk-stats">
        <span class="pill">Живих: <strong>{{ aliveCount }}</strong></span>
        <span class="pill">Фаза: <strong>{{ gamePhase }}</strong></span>
        <span v-if="scenarioLabel" class="pill dim">Сценарій: {{ scenarioLabel }}</span>
      </div>
    </div>
    <div class="desk-copy-row">
      <div class="copy-block">
        <span class="copy-label">Overlay стрімера</span>
        <p class="copy-url">{{ personalUrl }}</p>
        <button type="button" class="btn-copy" @click="emit('copy-personal')">Копіювати</button>
      </div>
      <div class="copy-block">
        <span class="copy-label">Overlay усіх</span>
        <p class="copy-url">{{ globalUrl }}</p>
        <button type="button" class="btn-copy" @click="emit('copy-global')">Копіювати</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.desk-header {
  padding: 1.25rem 1.5rem;
  border-radius: 20px;
  background: rgba(12, 10, 26, 0.75);
  border: 1px solid rgba(124, 58, 237, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  margin-bottom: 1.25rem;
}

.desk-header-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.desk-title {
  margin: 0 0 0.25rem;
  font-size: 1.35rem;
  font-weight: 700;
  color: #f5f3ff;
  font-family: 'Orbitron', sans-serif;
  letter-spacing: 0.02em;
}

.desk-sub {
  margin: 0;
  font-size: 0.82rem;
  color: rgba(196, 181, 253, 0.55);
}

.desk-sub code {
  font-size: 0.85em;
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
  color: #e9d5ff;
}

.desk-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.pill {
  font-size: 0.72rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: rgba(88, 28, 135, 0.25);
  border: 1px solid rgba(167, 139, 250, 0.25);
  color: #ddd6fe;
}

.pill.dim {
  opacity: 0.85;
}

.pill strong {
  color: #fff;
  text-transform: capitalize;
}

.desk-copy-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

@media (max-width: 720px) {
  .desk-copy-row {
    grid-template-columns: 1fr;
  }
}

.copy-block {
  padding: 0.65rem 0.75rem;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.copy-label {
  display: block;
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(196, 181, 253, 0.45);
  margin-bottom: 0.35rem;
}

.copy-url {
  margin: 0 0 0.5rem;
  font-size: 0.68rem;
  line-height: 1.35;
  color: #cbd5e1;
  word-break: break-all;
}

.btn-copy {
  padding: 0.35rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(167, 139, 250, 0.4);
  background: rgba(88, 28, 135, 0.3);
  color: #ede9fe;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-copy:hover {
  background: rgba(109, 40, 217, 0.4);
}
</style>
