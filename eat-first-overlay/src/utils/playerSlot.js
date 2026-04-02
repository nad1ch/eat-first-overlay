/**
 * Нормалізує id слота для Firestore (p1…p10), щоб руки та документи збігалися з URL.
 */
export function normalizePlayerSlotId(raw) {
  const s = String(raw ?? 'p1').trim()
  if (!s) return 'p1'
  const lower = s.toLowerCase()
  const m = lower.match(/^p(\d+)$/)
  if (m) return `p${parseInt(m[1], 10)}`
  const digits = lower.match(/^(\d+)$/)
  if (digits) return `p${digits[1]}`
  return lower
}
