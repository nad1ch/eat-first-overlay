<script setup>
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { Track } from 'livekit-client'

const props = defineProps({
  tile: { type: Object, required: true },
  volume: { type: Number, default: 1 },
})

const emit = defineEmits(['update:volume'])

const videoRef = ref(null)
/** @type {import('livekit-client').VideoTrack | null} */
let attached = null

function detach() {
  const el = videoRef.value
  if (attached && el) {
    try {
      attached.detach(el)
    } catch {
      /* */
    }
  }
  attached = null
}

watch(
  () => [props.tile.participant, props.tile.showVideo, props.tile.identity],
  async () => {
    await nextTick()
    detach()
    if (!props.tile.showVideo) return
    const el = videoRef.value
    if (!el) return
    try {
      const pub = props.tile.participant.getTrackPublication(Track.Source.Camera)
      const vt = pub?.videoTrack
      if (vt) {
        vt.attach(el)
        el.muted = !!props.tile.isLocal
        attached = vt
      }
    } catch {
      /* */
    }
  },
  { immediate: true, flush: 'post' },
)

onUnmounted(() => {
  detach()
})
</script>

<template>
  <div
    class="ptile"
    :class="{ 'ptile--speaking': tile.isSpeaking, 'ptile--audio': !tile.showVideo }"
  >
    <video
      v-show="tile.showVideo"
      ref="videoRef"
      class="ptile__video"
      playsinline
      autoplay
    />
    <div v-show="!tile.showVideo" class="ptile__avatar" aria-hidden="true">
      <span class="ptile__mono">{{
        String(tile.label || tile.identity)
          .slice(0, 2)
          .toUpperCase()
      }}</span>
    </div>
    <div class="ptile__meta">
      <span class="ptile__name">{{ tile.label }}</span>
      <span v-if="tile.isMuted" class="ptile__muted" title="Muted" aria-label="Muted">🔇</span>
    </div>
    <label v-if="!tile.isLocal" class="ptile__vol">
      <span class="sr-only">Volume</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        :value="volume"
        @input="(e) => emit('update:volume', Number(e.target.value))"
      />
    </label>
  </div>
</template>

<style scoped>
.ptile {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: #121018;
  border: 2px solid transparent;
  min-height: 0;
  aspect-ratio: 16 / 10;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.ptile--speaking {
  border-color: rgba(34, 197, 94, 0.75);
  box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.35);
}
.ptile--audio {
  aspect-ratio: auto;
  min-height: 5rem;
}
.ptile__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}
.ptile__avatar {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #2a2438, #15121c);
}
.ptile__mono {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.85);
}
.ptile__meta {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.45rem;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.82));
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.92);
}
.ptile__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ptile__muted {
  opacity: 0.85;
  font-size: 0.85rem;
}
.ptile__vol {
  position: relative;
  z-index: 1;
  display: flex;
  padding: 0 0.45rem 0.4rem;
}
.ptile__vol input {
  width: 100%;
  accent-color: #a78bfa;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
