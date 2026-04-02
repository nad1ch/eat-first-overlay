/**
 * Клонує вкладені поля кімнати, щоб Vue гарантовано бачив оновлення (напр. hands.p1).
 */
export function normalizeGameRoomPayload(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = { ...raw }
  out.hands = raw.hands && typeof raw.hands === 'object' ? { ...raw.hands } : {}
  if (raw.voting && typeof raw.voting === 'object') {
    out.voting = { ...raw.voting }
  }
  if (Array.isArray(raw.nominations)) {
    out.nominations = raw.nominations.map((n) => (n && typeof n === 'object' ? { ...n } : n))
  }
  return out
}
