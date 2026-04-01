import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  getDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { ADMIN_KEY } from '../config/access.js'
import { buildRandomPlayerDocument } from '../data/randomPools.js'
import { db } from '../firebase.js'

function gameDocRef(gameId) {
  return doc(db, 'games', gameId)
}

function playerDocRef(gameId, playerId) {
  return doc(db, 'games', gameId, 'players', playerId)
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
      console.error('[subscribeToGameRoom]', err)
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
      hands: deleteField(),
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
      console.error('[subscribeToVotes]', err)
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

/** Номінація + хто ініціював (slot p1… або ''). */
export async function setNominatedPlayer(gameId, playerId, nominatedBySlot) {
  const p = String(playerId ?? '').trim()
  const by = String(nominatedBySlot ?? '').trim()
  if (!p) {
    await saveGameRoom(gameId, { nominatedPlayer: '', nominatedBy: deleteField() })
    return
  }
  await saveGameRoom(gameId, {
    nominatedPlayer: p,
    nominatedBy: by || deleteField(),
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
  await setDoc(
    gameDocRef(gameId),
    { hands: deleteField(), key: ADMIN_KEY },
    { merge: true },
  )
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
 * @param {boolean} raised
 */
export async function setGameHandRaised(gameId, playerId, raised) {
  const pid = String(playerId ?? '').trim()
  if (!pid) return
  await setDoc(
    gameDocRef(gameId),
    {
      [`hands.${pid}`]: Boolean(raised),
      key: ADMIN_KEY,
    },
    { merge: true },
  )
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
  return onSnapshot(playerDocRef(gameId, playerId), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null)
      return
    }
    callback(snapshot.data())
  })
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
      console.error('[subscribeToPlayers]', err)
      callback([])
    },
  )
}
