import { ref, watch, watchEffect } from 'vue'
import { RoomEvent, Track } from 'livekit-client'

const DEFAULT_MAX_VIDEO = 4

/**
 * Селективна підписка на відео (до maxVideo потоків) + аудіо на всіх.
 * Пріоритет: active speakers → speaker slot → spotlight → решта.
 *
 * @param {import('vue').ShallowRef<import('livekit-client').Room | null>} roomRef
 * @param {{
 *   spotlightSlot: import('vue').Ref<string | null> | import('vue').ComputedRef<string | null>,
 *   speakerSlot: import('vue').Ref<string | null> | import('vue').ComputedRef<string | null>,
 *   includeLocal: import('vue').Ref<boolean> | import('vue').ComputedRef<boolean>,
 *   maxVideo?: number,
 *   playerLabels: import('vue').Ref<Record<string, string>> | import('vue').ComputedRef<Record<string, string>>,
 *   volumeByIdentity: import('vue').Ref<Record<string, number>>,
 * }} options
 */
export function useMediaTracks(roomRef, options) {
  const {
    spotlightSlot,
    speakerSlot,
    includeLocal,
    maxVideo = DEFAULT_MAX_VIDEO,
    playerLabels,
    volumeByIdentity,
  } = options

  /** @type {import('vue').Ref<Array<{
   *  identity: string,
   *  participant: import('livekit-client').Participant,
   *  isLocal: boolean,
   *  showVideo: boolean,
   *  isSpeaking: boolean,
   *  isMuted: boolean,
   *  label: string,
   * }>>} */
  const tiles = ref([])

  function sortRemoteIds(room) {
    const ids = [...room.remoteParticipants.keys()]
    const sp = String(speakerSlot.value ?? '').trim()
    const st = String(spotlightSlot.value ?? '').trim()
    const activeIds = new Set(room.activeSpeakers.map((p) => p.identity))

    const rank = (id) => {
      let s = 0
      if (activeIds.has(id)) s += 1000
      if (sp && id === sp) s += 100
      if (st && id === st) s += 50
      return s
    }
    return ids.sort((a, b) => rank(b) - rank(a) || a.localeCompare(b))
  }

  function applySubscriptions(room) {
    const local = room.localParticipant
    const localCam = local?.isCameraEnabled === true
    const remoteBudget = Math.max(0, maxVideo - (localCam && includeLocal.value ? 1 : 0))
    const ordered = sortRemoteIds(room)
    const videoSet = new Set(ordered.slice(0, remoteBudget))

    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.kind === Track.Kind.Audio) {
          try {
            pub.setSubscribed(true)
          } catch {
            /* */
          }
        } else if (pub.kind === Track.Kind.Video) {
          try {
            pub.setSubscribed(videoSet.has(p.identity))
          } catch {
            /* */
          }
        }
      }
    }
  }

  function applyVolume(room) {
    const vols = volumeByIdentity?.value ?? {}
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) {
        if (pub.kind === Track.Kind.Audio && pub.track) {
          const v = vols[p.identity]
          const n = typeof v === 'number' && v >= 0 && v <= 1 ? v : 1
          try {
            pub.track.setVolume(n)
          } catch {
            /* */
          }
        }
      }
    }
  }

  function rebuild(room) {
    if (!room) {
      tiles.value = []
      return
    }
    applySubscriptions(room)
    applyVolume(room)

    const speaking = new Set(room.activeSpeakers.map((p) => p.identity))
    const local = room.localParticipant
    const ordered = sortRemoteIds(room)
    const localCam = local.isCameraEnabled === true
    const remoteBudget = Math.max(0, maxVideo - (localCam && includeLocal.value ? 1 : 0))
    const videoSet = new Set(ordered.slice(0, remoteBudget))
    const labels = playerLabels.value ?? {}

    const out = []
    if (includeLocal.value) {
      out.push({
        identity: local.identity,
        participant: local,
        isLocal: true,
        showVideo: localCam,
        isSpeaking: speaking.has(local.identity),
        isMuted: !local.isMicrophoneEnabled,
        label: String(labels[local.identity] || local.identity),
      })
    }
    for (const id of ordered) {
      const p = room.remoteParticipants.get(id)
      if (!p) continue
      const hasSubscribedVideo = [...p.trackPublications.values()].some(
        (pub) => pub.kind === Track.Kind.Video && pub.isSubscribed && pub.track,
      )
      out.push({
        identity: id,
        participant: p,
        isLocal: false,
        showVideo: videoSet.has(id) && hasSubscribedVideo,
        isSpeaking: speaking.has(id),
        isMuted: !p.isMicrophoneEnabled,
        label: String(labels[id] || id),
      })
    }
    tiles.value = out
  }

  watchEffect((onCleanup) => {
    const room = roomRef.value
    if (!room) {
      tiles.value = []
      return
    }

    const handler = () => rebuild(room)
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackSubscriptionStatusChanged,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
    ]
    for (const e of events) {
      room.on(e, handler)
    }
    handler()

    onCleanup(() => {
      for (const e of events) {
        try {
          room.off(e, handler)
        } catch {
          /* */
        }
      }
    })
  })

  watch(
    () => ({ ...volumeByIdentity.value }),
    () => {
      const room = roomRef.value
      if (room) applyVolume(room)
    },
    { deep: true },
  )

  watch(
    () => [String(spotlightSlot.value ?? ''), String(speakerSlot.value ?? ''), includeLocal.value],
    () => {
      const room = roomRef.value
      if (room) rebuild(room)
    },
  )

  return { tiles }
}
