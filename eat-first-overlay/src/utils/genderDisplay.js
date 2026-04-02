/** Повна форма для ефіру / UI (старі дані могли бути «Чол.» / «Жін.»). */
export function formatGenderDisplay(gender) {
  const s = String(gender ?? '').trim()
  if (!s) return '—'
  const lower = s.toLowerCase()
  if (s === 'Чол.' || lower.startsWith('чол')) return 'Чоловік'
  if (s === 'Жін.' || lower.startsWith('жін')) return 'Жінка'
  return s
}
