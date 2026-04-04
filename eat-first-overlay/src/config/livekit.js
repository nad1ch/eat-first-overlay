/** LiveKit WebSocket URL (наприклад wss://PROJECT.livekit.cloud). */
export function liveKitConfigured() {
  return Boolean(String(import.meta.env.VITE_LIVEKIT_URL ?? '').trim())
}

export function getLiveKitServerUrl() {
  return String(import.meta.env.VITE_LIVEKIT_URL ?? '').trim()
}

/** URL для POST JSON { roomName, identity, name, canPublish } → { token }. Dev: /__livekit/token */
export function getLiveKitTokenUrl() {
  const u = String(import.meta.env.VITE_LIVEKIT_TOKEN_URL ?? '').trim()
  if (u) return u
  return '/__livekit/token'
}
