/** LiveKit WebSocket URL (наприклад wss://PROJECT.livekit.cloud). */
export function liveKitConfigured() {
  return Boolean(String(import.meta.env.VITE_LIVEKIT_URL ?? '').trim())
}

export function getLiveKitServerUrl() {
  return String(import.meta.env.VITE_LIVEKIT_URL ?? '').trim()
}

/**
 * URL для POST JSON { roomName, identity, name, canPublish } → { token }.
 * Dev (Vite): /__livekit/token (middleware). Прод / preview (Vercel): /api/livekit-token.
 */
export function getLiveKitTokenUrl() {
  const u = String(import.meta.env.VITE_LIVEKIT_TOKEN_URL ?? '').trim()
  if (u) return u
  if (import.meta.env.DEV) return '/__livekit/token'
  return '/api/livekit-token'
}

/**
 * Якість відео для підписника (simulcast): high | medium | low.
 * low — мінімальний шар (~180p), medium — середній (~360p залежно від SFU), high — без обмежень у клієнті.
 * На паблішері має був увімкнений simulcast, інакше ефекту може не бути.
 */
export function getLiveKitSubscribeQualityMode() {
  return String(import.meta.env.VITE_LK_SUBSCRIBE_VIDEO_QUALITY ?? 'high').toLowerCase()
}
