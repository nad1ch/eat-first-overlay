import { FIELD_KEYS, assignRandomActiveCard } from '../characterState'
import { scenarios } from './scenarios.js'
import {
  professions,
  healthConditions,
  phobias,
  baggage,
  facts,
  quirks,
} from './pools/characterPools.js'

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export const ages = ['20', '22', '24', '26', '28', '30', '32', '35', '38', '41', '45']

export const genders = ['Чол.', 'Жін.', 'Non-binary', 'Не вказано']

export const displayNames = [
  'Олексій',
  'Марія',
  'Дмитро',
  'Катерина',
  'Андрій',
  'Олена',
  'Бодя',
  'Настя',
  'Сергій',
  'Ірина',
  'Макс',
  'Юля',
  'Тарас',
  'Світлана',
  'Ігор',
  'Христина',
  'Віка',
  'Роман',
  'Леся',
  'Петро',
]

const DEFAULT_POOLS = {
  profession: professions,
  health: healthConditions,
  phobia: phobias,
  luggage: baggage,
  fact: facts,
  quirk: quirks,
}

export function poolForScenarioField(scenarioId, fieldKey) {
  const sc = scenarioId && scenarios[scenarioId]
  if (sc && Array.isArray(sc[fieldKey]) && sc[fieldKey].length) {
    return sc[fieldKey]
  }
  return DEFAULT_POOLS[fieldKey] ?? ['—']
}

/**
 * @param {import('vue').Reactive | object} target
 * @param {{ scenarioId?: string, keys?: string[], skipActiveCard?: boolean }} [options]
 */
export function rollRandomIntoCharacter(target, options = {}) {
  const sid =
    options.scenarioId && scenarios[options.scenarioId] ? options.scenarioId : 'classic_crash'
  const keys = Array.isArray(options.keys) && options.keys.length ? options.keys : FIELD_KEYS

  target.name = pick(displayNames)
  target.age = pick(ages)
  target.gender = pick(genders)
  for (const key of keys) {
    const slot = target[key]
    if (!slot || typeof slot !== 'object') continue
    const pool = poolForScenarioField(sid, key)
    slot.value = pick(pool)
    slot.revealed = false
  }
  if (!options.skipActiveCard) {
    assignRandomActiveCard(target)
  }
}

export function rollFieldValue(fieldKey, scenarioId = 'classic_crash') {
  const pool = poolForScenarioField(scenarioId, fieldKey)
  return pick(pool)
}

export function rollKeysIntoCharacter(target, keys, scenarioId = 'classic_crash') {
  const sid = scenarioId && scenarios[scenarioId] ? scenarioId : 'classic_crash'
  for (const key of keys) {
    const slot = target[key]
    if (!slot || typeof slot !== 'object') continue
    const pool = poolForScenarioField(sid, key)
    slot.value = pick(pool)
    slot.revealed = false
  }
}

export function buildRandomPlayerDocument(scenarioId = 'classic_crash') {
  const sid = scenarioId && scenarios[scenarioId] ? scenarioId : 'classic_crash'
  const out = {
    eliminated: false,
    name: pick(displayNames),
    age: pick(ages),
    gender: pick(genders),
    activeCardRequest: false,
  }
  for (const key of FIELD_KEYS) {
    out[key] = {
      value: pick(poolForScenarioField(sid, key)),
      revealed: false,
    }
  }
  assignRandomActiveCard(out)
  return out
}
