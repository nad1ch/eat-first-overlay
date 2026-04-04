/**
 * Callable API: голосування та хост-операції без прямих правок клієнта у votes/*.
 *
 * Деплой:
 *   firebase functions:secrets:set HOST_PROMOTE_PASSWORD
 *   (значення = той самий рядок, що й VITE_ADMIN_KEY на фронті, поки кімната ще пишеться з клієнта по key)
 *
 * Увімкніть Anonymous Auth у Firebase Console.
 */
const admin = require('firebase-admin')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { setGlobalOptions } = require('firebase-functions/v2')

const hostPromotePassword = defineSecret('HOST_PROMOTE_PASSWORD')

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

admin.initializeApp()

const MIN_ROUND = 1
const MAX_ROUND = 8
const GAME_PHASES = new Set(['intro', 'discussion', 'voting', 'final'])

function normalizePlayerSlotId(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  const m = lower.match(/^p(\d+)$/)
  if (m) return `p${parseInt(m[1], 10)}`
  const digits = lower.match(/^(\d+)$/)
  if (digits) return `p${digits[1]}`
  return lower
}

function assertHost(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'auth-required')
  }
  if (request.auth.token.host !== true) {
    throw new HttpsError('permission-denied', 'host-only')
  }
}

async function voterSlotForUid(gameId, uid) {
  const snap = await admin.firestore().collection('games').doc(gameId).collection('players').get()
  for (const d of snap.docs) {
    if (d.data()?.linkedAuthUid === uid) return normalizePlayerSlotId(d.id)
  }
  return null
}

exports.promoteToHost = onCall({ secrets: [hostPromotePassword] }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'auth-required')
  }
  const pwd = String(request.data?.password ?? '').trim()
  const expected = hostPromotePassword.value().trim()
  if (!pwd || pwd !== expected) {
    throw new HttpsError('permission-denied', 'wrong-password')
  }
  await admin.auth().setCustomUserClaims(request.auth.uid, { host: true })
  return { ok: true }
})

exports.linkPlayerSlot = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'auth-required')
  }
  const gameId = String(request.data?.gameId ?? '').trim()
  const playerId = normalizePlayerSlotId(request.data?.playerId ?? '')
  const joinToken = String(request.data?.joinToken ?? '').trim()
  const uid = request.auth.uid

  if (!gameId || !playerId || !joinToken) {
    throw new HttpsError('invalid-argument', 'missing-fields')
  }

  const ref = admin.firestore().collection('games').doc(gameId).collection('players').doc(playerId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new HttpsError('not-found', 'no-player-doc')
  }
  const d = snap.data() || {}
  const tok = typeof d.joinToken === 'string' ? d.joinToken.trim() : ''
  if (tok !== joinToken) {
    throw new HttpsError('permission-denied', 'bad-token')
  }
  const existing = d.linkedAuthUid
  if (existing && existing !== uid) {
    throw new HttpsError('permission-denied', 'slot-linked-other')
  }
  if (existing === uid) {
    return { ok: true, already: true }
  }
  await ref.set({ linkedAuthUid: uid }, { merge: true })
  return { ok: true }
})

exports.submitVote = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'auth-required')
  }
  const gameId = String(request.data?.gameId ?? '').trim()
  const targetPlayer = normalizePlayerSlotId(request.data?.targetPlayer ?? '')
  const choiceRaw = request.data?.choice
  const choice = choiceRaw === 'against' ? 'against' : 'for'

  if (!gameId || !targetPlayer) {
    throw new HttpsError('invalid-argument', 'missing-fields')
  }

  const uid = request.auth.uid
  const voterSlot = await voterSlotForUid(gameId, uid)
  if (!voterSlot) {
    throw new HttpsError('permission-denied', 'not-linked')
  }

  const gameRef = admin.firestore().collection('games').doc(gameId)
  const gameSnap = await gameRef.get()
  if (!gameSnap.exists) {
    throw new HttpsError('failed-precondition', 'no-game')
  }
  const gr = gameSnap.data() || {}

  if (!gr.voting?.active) {
    throw new HttpsError('failed-precondition', 'voting-not-active')
  }
  const vt = String(gr.voting?.targetPlayer ?? '').trim()
  if (!vt || normalizePlayerSlotId(vt) !== targetPlayer) {
    throw new HttpsError('invalid-argument', 'bad-target')
  }

  const round = Math.min(MAX_ROUND, Math.max(MIN_ROUND, Math.floor(Number(gr.round) || 1)))

  const voterDoc = await gameRef.collection('players').doc(voterSlot).get()
  if (!voterDoc.exists || voterDoc.data()?.eliminated === true) {
    throw new HttpsError('permission-denied', 'voter-ineligible')
  }

  const voteRef = gameRef.collection('votes').doc(voterSlot)
  const existingVote = await voteRef.get()
  if (existingVote.exists) {
    const prev = existingVote.data() || {}
    if (Number(prev.round) === round) {
      return { ok: false, reason: 'already-voted' }
    }
  }

  await voteRef.set({
    choice,
    targetPlayer: normalizePlayerSlotId(targetPlayer),
    round,
    at: admin.firestore.FieldValue.serverTimestamp(),
  })

  return { ok: true }
})

exports.hostClearVotes = onCall(async (request) => {
  assertHost(request)
  const gameId = String(request.data?.gameId ?? '').trim()
  if (!gameId) {
    throw new HttpsError('invalid-argument', 'missing-game')
  }
  const col = admin.firestore().collection('games').doc(gameId).collection('votes')
  const snap = await col.get()
  let batch = admin.firestore().batch()
  let n = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    n++
    if (n >= 400) {
      await batch.commit()
      batch = admin.firestore().batch()
      n = 0
    }
  }
  if (n > 0) await batch.commit()
  return { ok: true }
})

exports.hostDeleteVote = onCall(async (request) => {
  assertHost(request)
  const gameId = String(request.data?.gameId ?? '').trim()
  const voterId = normalizePlayerSlotId(request.data?.voterId ?? '')
  if (!gameId || !voterId) {
    throw new HttpsError('invalid-argument', 'missing-fields')
  }
  await admin.firestore().collection('games').doc(gameId).collection('votes').doc(voterId).delete()
  return { ok: true }
})

exports.hostSetGamePhase = onCall(async (request) => {
  assertHost(request)
  const gameId = String(request.data?.gameId ?? '').trim()
  const phase = String(request.data?.phase ?? 'intro')
  if (!gameId) {
    throw new HttpsError('invalid-argument', 'missing-game')
  }
  const next = GAME_PHASES.has(phase) ? phase : 'intro'
  const gameRef = admin.firestore().collection('games').doc(gameId)
  await gameRef.set({ gamePhase: next }, { merge: true })
  return { ok: true }
})
