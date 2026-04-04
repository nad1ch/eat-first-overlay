<script setup>
import { computed, ref, watch } from 'vue'
import { ConnectionState } from 'livekit-client'
import { liveKitConfigured } from '../config/livekit.js'
import { useLiveKitRoom } from '../composables/useLiveKitRoom.js'
import { useMediaTracks } from '../composables/useMediaTracks.js'
import { useAudioControls } from '../composables/useAudioControls.js'
import ParticipantTile from './ParticipantTile.vue'

const props = defineProps({
  overlayReady: { type: Boolean, default: false },
  gameId: { type: String, required: true },
  localIdentity: { type: String, required: true },
  displayName: { type: String, default: '' },
  /** Чи можна публікувати аудіо/відео (слот гравця, не spectator, не елімінація). */
  canPublish: { type: Boolean, default: false },
  spotlightSlot: { type: String, default: '' },
  speakerSlot: { type: String, default: '' },
  /** true: лиш активний спікер (speakerSlot) може залишати мік увімкненим. */
  spotlightUnmuteMode: { type: Boolean, default: false },
  eliminatedLocal: { type: Boolean, default: false },
  playerNameMap: { type: Object, default: () => ({}) },
})

const enabled = computed(
  () =>
    liveKitConfigured() &&
    props.overlayReady &&
    Boolean(String(props.gameId || '').trim()) &&
    Boolean(String(props.localIdentity || '').trim()),
)

const roomName = computed(() => String(props.gameId || '').trim())
const identity = computed(() => String(props.localIdentity || '').trim())
const displayName = computed(() => String(props.displayName || props.localIdentity || '').trim())
const canPublishRef = computed(() => props.canPublish)

const { room, connectionState, error } = useLiveKitRoom({
  enabled,
  roomName,
  identity,
  displayName,
  canPublish: canPublishRef,
})

const volumeByIdentity = ref({})

const playerLabels = computed(() => props.playerNameMap || {})

const includeLocal = computed(() => props.canPublish)

const { tiles } = useMediaTracks(room, {
  spotlightSlot: computed(() => props.spotlightSlot || null),
  speakerSlot: computed(() => props.speakerSlot || null),
  includeLocal,
  maxVideo: 4,
  playerLabels,
  volumeByIdentity,
})

const {
  micEnabled,
  cameraEnabled,
  audioInputDevices,
  audioOutputDevices,
  videoInputDevices,
  refreshDevices,
  setMicEnabled,
  setCameraEnabled,
  setAudioInput,
  setAudioOutput,
  setVideoInput,
} = useAudioControls(room, {
  canControl: canPublishRef,
})

/** До 4 відео-плиток; решта лише аудіо-рядок. */
const videoTiles = computed(() => {
  const v = []
  const a = []
  for (const t of tiles.value) {
    if (t.showVideo) v.push(t)
    else a.push(t)
  }
  return { video: v.slice(0, 4), audioOnly: a }
})

function volFor(id) {
  const v = volumeByIdentity.value[id]
  return typeof v === 'number' ? v : 1
}

function setVolume(id, v) {
  volumeByIdentity.value = { ...volumeByIdentity.value, [id]: v }
}

watch(
  () => props.eliminatedLocal,
  async (elim) => {
    if (elim && room.value) {
      await setMicEnabled(false).catch(() => {})
      await setCameraEnabled(false).catch(() => {})
    }
  },
)

watch(
  () => [props.spotlightUnmuteMode, props.speakerSlot, props.localIdentity, props.eliminatedLocal, props.canPublish],
  async () => {
    if (!room.value || props.eliminatedLocal || !props.canPublish) return
    if (!props.spotlightUnmuteMode) return
    const sp = String(props.speakerSlot || '').trim()
    const me = String(props.localIdentity || '').trim()
    if (sp && me && me !== sp) {
      await setMicEnabled(false).catch(() => {})
    }
  },
)

const statusLine = computed(() => {
  if (!liveKitConfigured()) return ''
  const s = connectionState.value
  if (s === ConnectionState.Connected) return 'LiveKit · OK'
  if (s === ConnectionState.Connecting || s === ConnectionState.Reconnecting) return 'LiveKit · …'
  if (error.value) return `LiveKit · ${error.value.message}`
  return 'LiveKit · off'
})
</script>

<template>
  <aside v-if="liveKitConfigured()" class="vvg" aria-label="Voice / video">
    <div class="vvg__head">
      <span class="vvg__status">{{ statusLine }}</span>
    </div>

    <div class="vvg__grid">
      <ParticipantTile
        v-for="t in videoTiles.video"
        :key="t.identity + '-v'"
        :tile="t"
        :volume="volFor(t.identity)"
        @update:volume="setVolume(t.identity, $event)"
      />
    </div>

    <div v-if="videoTiles.audioOnly.length" class="vvg__audio-row">
      <ParticipantTile
        v-for="t in videoTiles.audioOnly"
        :key="t.identity + '-a'"
        :tile="{ ...t, showVideo: false }"
        :volume="volFor(t.identity)"
        @update:volume="setVolume(t.identity, $event)"
      />
    </div>

    <div v-if="canPublish" class="vvg__ctrl">
      <button
        type="button"
        class="vvg__btn"
        :class="{ 'vvg__btn--off': !micEnabled }"
        @click="setMicEnabled(!micEnabled)"
      >
        {{ micEnabled ? 'Mic on' : 'Mic off' }}
      </button>
      <button
        type="button"
        class="vvg__btn"
        :class="{ 'vvg__btn--off': !cameraEnabled }"
        @click="setCameraEnabled(!cameraEnabled)"
      >
        {{ cameraEnabled ? 'Cam on' : 'Cam off' }}
      </button>
    </div>

    <div v-if="canPublish" class="vvg__devices">
      <label class="vvg__lbl"
        >In
        <select @change="setAudioInput(($event.target).value)">
          <option value="">Default mic</option>
          <option v-for="d in audioInputDevices" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || d.deviceId }}
          </option>
        </select>
      </label>
      <label class="vvg__lbl"
        >Out
        <select @change="setAudioOutput(($event.target).value)">
          <option value="">Default speaker</option>
          <option v-for="d in audioOutputDevices" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || d.deviceId }}
          </option>
        </select>
      </label>
      <label class="vvg__lbl"
        >Cam
        <select @change="setVideoInput(($event.target).value)">
          <option value="">Default camera</option>
          <option v-for="d in videoInputDevices" :key="d.deviceId" :value="d.deviceId">
            {{ d.label || d.deviceId }}
          </option>
        </select>
      </label>
      <button type="button" class="vvg__linkish" @click="refreshDevices()">Refresh devices</button>
    </div>
  </aside>
</template>

<style scoped>
.vvg {
  position: fixed;
  right: 0.6rem;
  bottom: 0.6rem;
  z-index: 60;
  width: min(22rem, 42vw);
  max-height: min(72vh, 28rem);
  overflow: auto;
  padding: 0.5rem;
  border-radius: 12px;
  background: rgba(8, 6, 14, 0.92);
  border: 1px solid rgba(167, 139, 250, 0.28);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  font-size: 0.72rem;
  color: rgba(245, 245, 250, 0.92);
}
.vvg__head {
  margin-bottom: 0.35rem;
  opacity: 0.85;
}
.vvg__status {
  font-variant-numeric: tabular-nums;
}
.vvg__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}
.vvg__audio-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.35rem;
}
.vvg__ctrl {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.45rem;
  flex-wrap: wrap;
}
.vvg__btn {
  flex: 1;
  min-width: 4.5rem;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(40, 32, 58, 0.95);
  color: inherit;
  cursor: pointer;
  font-size: 0.68rem;
}
.vvg__btn--off {
  opacity: 0.65;
  border-style: dashed;
}
.vvg__devices {
  margin-top: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.vvg__lbl {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.62rem;
  opacity: 0.9;
}
.vvg__lbl select {
  max-width: 100%;
  font-size: 0.65rem;
  padding: 0.2rem;
  border-radius: 6px;
}
.vvg__linkish {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: #c4b5fd;
  cursor: pointer;
  font-size: 0.62rem;
  text-decoration: underline;
}
</style>
