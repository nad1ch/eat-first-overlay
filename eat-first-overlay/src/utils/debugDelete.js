/**
 * Логи ланцюжка видалення гравця. Увімкнено в dev або якщо в .env задати VITE_DEBUG_DELETE=true.
 */
export function debugDelete(...args) {
  const on =
    import.meta.env.DEV === true || String(import.meta.env.VITE_DEBUG_DELETE ?? '') === 'true'
  if (on) console.info('[eat-first:delete]', ...args)
}
