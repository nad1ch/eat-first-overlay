import { reactive } from 'vue'

const FIELD_KEYS = ['profession', 'health', 'phobia', 'luggage', 'fact', 'quirk']

export const characterState = reactive({
  eliminated: false,
  name: '',
  age: '',
  gender: '',
  profession: { value: '', revealed: false },
  health: { value: '', revealed: false },
  phobia: { value: '', revealed: false },
  luggage: { value: '', revealed: false },
  fact: { value: '', revealed: false },
  quirk: { value: '', revealed: false },
})

export const fieldConfig = [
  { key: 'profession', label: 'Професія' },
  { key: 'health', label: 'Здоров’я' },
  { key: 'phobia', label: 'Фобія' },
  { key: 'luggage', label: 'Багаж' },
  { key: 'fact', label: 'Факт' },
  { key: 'quirk', label: 'Особливість' },
]

export function resetCharacterState(target = characterState) {
  target.eliminated = false
  target.name = ''
  target.age = ''
  target.gender = ''
  for (const key of FIELD_KEYS) {
    target[key].value = ''
    target[key].revealed = false
  }
}

/** Застосувати дані з Firestore до reactive-стану (поле key ігнорується — лише для rules). */
export function applyRemoteCharacterData(target, data) {
  if (!data || typeof data !== 'object') {
    resetCharacterState(target)
    return
  }
  target.eliminated = Boolean(data.eliminated)
  if (typeof data.name === 'string') target.name = data.name
  else target.name = ''
  if (typeof data.age === 'string') target.age = data.age
  else target.age = ''
  if (typeof data.gender === 'string') target.gender = data.gender
  else target.gender = ''
  for (const key of FIELD_KEYS) {
    const chunk = data[key]
    if (chunk && typeof chunk === 'object') {
      target[key].value = typeof chunk.value === 'string' ? chunk.value : ''
      target[key].revealed = Boolean(chunk.revealed)
    } else {
      target[key].value = ''
      target[key].revealed = false
    }
  }
}

/** Плоский знімок для збереження в Firestore (key додає gameService). */
export function snapshotCharacter(target = characterState) {
  const out = {
    eliminated: Boolean(target.eliminated),
    name: target.name,
    age: target.age,
    gender: target.gender,
  }
  for (const key of FIELD_KEYS) {
    out[key] = {
      value: target[key].value,
      revealed: target[key].revealed,
    }
  }
  return out
}
