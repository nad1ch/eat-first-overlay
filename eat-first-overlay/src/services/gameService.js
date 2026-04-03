import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  getDoc,
  runTransaction,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { ADMIN_KEY } from '../config/access.js'
import { pickRandomActiveCardTemplate } from '../data/activeCards.js'
import { buildRandomPlayerDocument } from '../data/randomPools.js'
import { normalizePlayerSlotId } from '../utils/playerSlot.js'
import { db } from '../firebase.js'
import { logListenerDetach } from '../utils/appLogger.js'

function gameDocRef(gameId) {
  return doc(db, 'games', gameId)
}

function playerDocRef(gameId, playerId) {
  return doc(db, 'games', gameId, 'players', playerId)
}

/** Зліпити мапу піднятих рук з документа кімнати (включаючи legacy-поля "hands.p1" на корені). */
function collectRaisedHandsMapFromGameData(data) {
  if (!data || typeof data !== 'object') return {}
  const h = {}
  const rawHands = data.hands
  if (rawHands && typeof rawHands === 'object' && !Array.isArray(rawHands)) {
    for (const [k, v] of Object.entries(rawHands)) {
      if (v === true) h[normalizePlayerSlotId(k)] = true
    }
  }
  const prefix = 'hands.'
  for (const key of Object.keys(data)) {
    if (typeof key !== 'string' || !key.startsWith(prefix)) continue
    const slot = key.slice(prefix.length)
    if (!slot) continue
    if (data[key] === true) h[normalizePlayerSlotId(slot)] = true
  }
  return h
}

/**
 * Метадані кімнати: games/{gameId} (наприклад activePlayer для spotlight).
 */
export function subscribeToGameRoom(gameId, callback) {
  return onSnapshot(
    gameDocRef(gameId),
    (snapshot) => {
      callback(snapshot.exists() ? snapshot.data() : {})
    },
    (err) => {
      logListenerDetach('subscribeToGameRoom', err, { gameId })
      callback({})
    },
  )
}

export async function saveGameRoom(gameId, partial) {
  await setDoc(
    gameDocRef(gameId),
    { ...partial, key: ADMIN_KEY },
    { merge: true },
  )
}

const GAME_PHASES = new Set(['intro', 'discussion', 'voting', 'final'])

/**
 * Таймер мовлення: games/{gameId}.currentSpeaker (окремо від activePlayer = spotlight).
 */
export async function startSpeakingTimer(gameId, speakerId, seconds) {
  const sec = Math.max(1, Math.floor(Number(seconds) || 30))
  const sp = String(speakerId || '').trim()
  await setDoc(
    gameDocRef(gameId),
    {
      currentSpeaker: sp,
      speakingTimer: sec,
      timerStartedAt: Timestamp.now(),
      timerPaused: false,
      timerRemainingFrozen: deleteField(),
      key: ADMIN_KEY,
    },
    { merge: true },
  )
}

/** Зупинити таймер і зняти currentSpeaker (activePlayer / spotlight не чіпаємо). */
export async function clearSpeakingTimer(gameId) {
  await setDoc(
    gameDocRef(gameId),
    {
      currentSpeaker: '',
      timerStartedAt: deleteField(),
      speakingTimer: 0,
      timerPaused: false,
      timerRemainingFrozen: deleteField(),
      key: ADMIN_KEY,
    },
    { merge: true },
  )
}

/** Пауза таймера з фіксацією залишку (секунди). */
export async function pauseSpeakingTimer(gameId, remainingSeconds) {
  const r = Math.max(0, Math.floor(Number(remainingSeconds) || 0))
  await setDoc(
    gameDocRef(gameId),
    {
      timerPaused: true,
      timerRemainingFrozen: r,
      timerStartedAt: deleteField(),
      key: ADMIN_KEY,
    },
    { merge: true },
  )
}

export async function resumeSpeakingTimer(gameId) {
  const snapshot = await getDoc(gameDocRef(gameId))
  const d = snapshot.exists() ? snapshot.data() : {}
  const rem = Math.max(1, Number(d.timerRemainingFrozen || d.speakingTimer) || 30)
  const sp = String(d.currentSpeaker || '').trim()
  await setDoc(
    gameDocRef(gameId),
    {
      timerPaused: false,
      speakingTimer: rem,
      timerStartedAt: Timestamp.now(),
      timerRemainingFrozen: deleteField(),
      ...(sp ? { currentSpeaker: sp } : {}),
      key: ADMIN_KEY,
    },
    { merge: true },
  )
}

export async function setGamePhase(gameId, phase) {
  const p = String(phase || 'intro')
  const next = GAME_PHASES.has(p) ? p : 'intro'
  await saveGameRoom(gameId, { gamePhase: next })
}

/** Скинути кімнату: spotlight, спікер, таймер, фаза. */
export async function resetGameRoomControls(gameId) {
  await setDoc(
    gameDocRef(gameId),
    {
      activePlayer: '',
      currentSpeaker: '',
      speakingTimer: 0,
      timerStartedAt: deleteField(),
      timerPaused: false,
      timerRemainingFrozen: deleteField(),
      gamePhase: 'intro',
      round: 1,
      nominatedPlayer: deleteField(),
      nominatedBy: deleteField(),
      nominations: deleteField(),
      hands: {},
      voting: deleteField(),
      key: ADMIN_KEY,
    },
    { merge: true },
  )
}

function votesColRef(gameId) {
  return collection(db, 'games', gameId, 'votes')
}

/** Підписка на всі голоси кімнати (для оверлею та адмінки). */
export function subscribeToVotes(gameId, callback) {
  const colRef = votesColRef(gameId)
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }),
      )
      callback(list)
    },
    (err) => {
      logListenerDetach('subscribeToVotes', err, { gameId })
      callback([])
    },
  )
}

/** Видалити всі документи в votes/ (батчами). */
export async function clearAllVotes(gameId) {
  const snap = await getDocs(votesColRef(gameId))
  let batch = writeBatch(db)
  let n = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
    n++
    if (n >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      n = 0
    }
  }
  if (n > 0) await batch.commit()
}

export async function deleteVoteDoc(gameId, voterId) {
  const v = String(voterId ?? '').trim()
  if (!v) return
  await deleteDoc(doc(db, 'games', gameId, 'votes', v))
}

/** Нормалізовані номінації: [{ target: 'p3', by: 'p1' }, …] */
export function normalizeNominations(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const x of raw) {
    const target = String(x?.target ?? '').trim()
    const by = String(x?.by ?? '').trim()
    if (target && by) out.push({ target, by })
  }
  return out
}

/** Для UI: з масиву або з legacy nominatedPlayer / nominatedBy */
export function nominationsFromRoom(gr) {
  const raw = normalizeNominations(gr?.nominations)
  if (raw.length) return raw
  const t = String(gr?.nominatedPlayer ?? '').trim()
  const b = String(gr?.nominatedBy ?? '').trim()
  if (t && b) return [{ target: t, by: b }]
  return []
}

/** Записати номінації; прибирає legacy-поля. */
export async function setGameNominations(gameId, list) {
  const next = normalizeNominations(list)
  await saveGameRoom(gameId, {
    nominations: next,
    nominatedPlayer: deleteField(),
    nominatedBy: deleteField(),
  })
}

/** Номінація + хто ініціював (slot p1… або '') — legacy, краще nominations[]. */
export async function setNominatedPlayer(gameId, playerId, nominatedBySlot) {
  const p = String(playerId ?? '').trim()
  const by = String(nominatedBySlot ?? '').trim()
  if (!p) {
    await saveGameRoom(gameId, {
      nominatedPlayer: '',
      nominatedBy: deleteField(),
      nominations: deleteField(),
    })
    return
  }
  await saveGameRoom(gameId, {
    nominatedPlayer: p,
    nominatedBy: by || deleteField(),
    nominations: deleteField(),
  })
}

const MIN_ROUND = 1
const MAX_ROUND = 8

export async function setRoomRound(gameId, nextRound, clearVotesToo = true) {
  const r = Math.min(MAX_ROUND, Math.max(MIN_ROUND, Math.floor(Number(nextRound) || 1)))
  await saveGameRoom(gameId, { round: r })
  if (clearVotesToo) await clearAllVotes(gameId)
}

export async function nextRoomRound(gameId) {
  const snap = await getDoc(gameDocRef(gameId))
  const cur = Math.floor(Number(snap.exists() ? snap.data().round : 1) || 1)
  const next = Math.min(MAX_ROUND, cur + 1)
  await saveGameRoom(gameId, { round: next })
  await clearAllVotes(gameId)
}

export async function resetRoomRoundCounter(gameId) {
  await saveGameRoom(gameId, { round: 1 })
  await clearAllVotes(gameId)
}

export async function clearAllHands(gameId) {
  await saveGameRoom(gameId, { hands: {} })
}

/** Голосування на кімнаті: { active, targetPlayer }. */
export async function setRoomVoting(gameId, active, targetPlayer) {
  const tp = String(targetPlayer ?? '').trim()
  await saveGameRoom(gameId, {
    voting: {
      active: Boolean(active),
      targetPlayer: tp,
    },
  })
}

/**
 * Піднята рука гравця: games/{gameId}.hands.{playerId}
 *
 * Транзакція + update({ hands: next }): поле `hands` цілком замінюється на `next`,
 * тож видалені слоти реально зникають у БД. set(merge) на вкладену мапу глибоко зливає
 * ключі й лишав старі true — ведучий не бачив «опущену» руку.
 * Rules: змінюється лише `hands`.
 *
 * @param {boolean} raised
 */
export async function setGameHandRaised(gameId, playerId, raised) {
  const raw = String(playerId ?? '').trim()
  if (!raw) return
  const pid = normalizePlayerSlotId(playerId)
  const ref = gameDocRef(gameId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) {
      throw new Error('Документ кімнати не знайдено. Відкрий гру на пульті ведучого.')
    }
    const next = { ...collectRaisedHandsMapFromGameData(snap.data()) }
    if (raised) next[pid] = true
    else delete next[pid]
    tx.update(ref, { hands: next })
  })
}

/**
 * Голос з персонального оверлею: games/{gameId}/votes/{voterPlayerId}
 * Один голос на раунд: якщо вже є запис з тим самим round — не писати.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export async function saveVote(gameId, voterPlayerId, targetPlayer, choice, round) {
  const voter = String(voterPlayerId ?? '').trim()
  const target = String(targetPlayer ?? '').trim()
  const r = Math.floor(Number(round) || 0)
  if (!voter || !target || r < MIN_ROUND) return { ok: false, reason: 'invalid' }
  const c = choice === 'against' ? 'against' : 'for'
  const voteRef = doc(db, 'games', gameId, 'votes', voter)
  const existing = await getDoc(voteRef)
  if (existing.exists()) {
    const prev = existing.data()
    if (Number(prev.round) === r) return { ok: false, reason: 'already-voted' }
  }
  await setDoc(voteRef, {
    choice: c,
    targetPlayer: target,
    round: r,
    at: Timestamp.now(),
  })
  return { ok: true }
}

export async function regenerateAllPlayersRandom(gameId, scenarioId) {
  const colRef = collection(db, 'games', gameId, 'players')
  const snapshot = await getDocs(colRef)
  const sid = String(scenarioId || 'classic_crash')
  for (const d of snapshot.docs) {
    const docPayload = buildRandomPlayerDocument(sid)
    await setDoc(d.ref, { ...docPayload, key: ADMIN_KEY }, { merge: true })
  }
}

/** Нова випадкова активна карта для кожного гравця в кімнаті. */
export async function regenerateAllPlayersActiveCards(gameId) {
  const colRef = collection(db, 'games', gameId, 'players')
  const snapshot = await getDocs(colRef)
  for (const d of snapshot.docs) {
    const t = pickRandomActiveCardTemplate()
    await setDoc(
      d.ref,
      {
        activeCard: {
          title: t.title,
          description: t.description,
          used: false,
          effectId: t.effectId,
          templateId: t.templateId,
        },
        activeCardRequest: false,
        key: ADMIN_KEY,
      },
      { merge: true },
    )
  }
}

/**
 * Оновити всіх гравців у кімнаті: одне поле { value, revealed }.
 * @param {string} gameId
 * @param {string} fieldKey
 * @param {() => string} valueGenerator
 */
export async function applyGlobalAction(gameId, fieldKey, valueGenerator) {
  const colRef = collection(db, 'games', gameId, 'players')
  const snapshot = await getDocs(colRef)
  for (const d of snapshot.docs) {
    const val = valueGenerator()
    await setDoc(
      d.ref,
      {
        [fieldKey]: { value: val, revealed: true },
        key: ADMIN_KEY,
      },
      { merge: true },
    )
  }
}

/**
 * Записує дані персонажа: games/{gameId}/players/{playerId}
 * @param {string} gameId
 * @param {string} playerId
 * @param {Record<string, unknown>} data — плоский об’єкт для Firestore
 */
export async function saveCharacter(gameId, playerId, data) {
  await setDoc(
    playerDocRef(gameId, playerId),
    { ...data, key: ADMIN_KEY },
    { merge: true },
  )
}

/**
 * Підписка на зміни документа гравця.
 * @returns {() => void} функція відписки
 */
export function subscribeToCharacter(gameId, playerId, callback) {
  return onSnapshot(
    playerDocRef(gameId, playerId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null)
        return
      }
      callback(snapshot.data())
    },
    (err) => {
      logListenerDetach('subscribeToCharacter', err, { gameId, playerId })
      callback(null)
    },
  )
}

/** Одноразове читання (для Control після перезавантаження). */
export async function fetchCharacter(gameId, playerId) {
  const snapshot = await getDoc(playerDocRef(gameId, playerId))
  if (!snapshot.exists()) return null
  return snapshot.data()
}

/**
 * Підписка на всіх гравців кімнати: games/{gameId}/players/*
 * @param {string} gameId
 * @param {(players: Array<{ id: string } & Record<string, unknown>>) => void} callback
 * @returns {() => void}
 */
export function subscribeToPlayers(gameId, callback) {
  const colRef = collection(db, 'games', gameId, 'players')
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }),
      )
      callback(list)
    },
    (err) => {
      logListenerDetach('subscribeToPlayers', err, { gameId })
      callback([])
    },
  )
}
