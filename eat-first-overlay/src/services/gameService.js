import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  getDoc,
  Timestamp,
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

/** Активний спікер + зворотний відлік (секунди від timerStartedAt). */
export async function startSpeakingTimer(gameId, activePlayerId, seconds) {
  const sec = Math.max(1, Math.floor(Number(seconds) || 30))
  await setDoc(
    gameDocRef(gameId),
    {
      activePlayer: String(activePlayerId || '').trim(),
      speakingTimer: sec,
      timerStartedAt: Timestamp.now(),
      timerPaused: false,
      timerRemainingFrozen: deleteField(),
      key: ADMIN_KEY,
    },
    { merge: true },
  )
}

/** Зупинити відображення таймера (spotlight можна лишити). */
export async function clearSpeakingTimer(gameId) {
  await setDoc(
    gameDocRef(gameId),
    {
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
  const ap = String(d.activePlayer || '').trim()
  await setDoc(
    gameDocRef(gameId),
    {
      timerPaused: false,
      speakingTimer: rem,
      timerStartedAt: Timestamp.now(),
      timerRemainingFrozen: deleteField(),
      ...(ap ? { activePlayer: ap } : {}),
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

/** Скинути кімнату: spotlight, таймер, фаза. */
export async function resetGameRoomControls(gameId) {
  await setDoc(
    gameDocRef(gameId),
    {
      activePlayer: '',
      speakingTimer: 0,
      timerStartedAt: deleteField(),
      timerPaused: false,
      timerRemainingFrozen: deleteField(),
      gamePhase: 'intro',
      key: ADMIN_KEY,
    },
    { merge: true },
  )
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
