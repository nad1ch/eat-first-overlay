/**
 * Активна карта (1 на гру): ефекти в межах party survival після авіакатастрофи.
 * effectId обробляється в activeCardEffects.js
 */
export const ACTIVE_CARD_EFFECT_IDS = {
  NARRATIVE: 'narrative',
  REROLL_PROFESSION_SELF: 'reroll_profession_self',
  REROLL_HEALTH_SELF: 'reroll_health_self',
  REROLL_PHOBIA_SELF: 'reroll_phobia_self',
  REROLL_LUGGAGE_SELF: 'reroll_luggage_self',
  REROLL_FACT_SELF: 'reroll_fact_self',
  REROLL_QUIRK_SELF: 'reroll_quirk_self',
  REROLL_RANDOM_TRAIT_SELF: 'reroll_random_trait_self',
  REROLL_PROFESSION_ALL: 'reroll_profession_all',
  REROLL_HEALTH_ALL: 'reroll_health_all',
  REROLL_PHOBIA_ALL: 'reroll_phobia_all',
  REVEAL_ALL_SELF: 'reveal_all_self',
  HIDE_ALL_SELF: 'hide_all_self',
  EXTRA_SPEAK_ONCE: 'extra_speak_once',
  VETO_VOTE_ROUND: 'veto_vote_round',
  FORCE_REVOTE: 'force_revote',
  CANCEL_LAST_DECISION: 'cancel_last_decision',
  SECOND_CHANCE_ELIMINATION: 'second_chance_elimination',
  IMMUNITY_ONCE: 'immunity_once',
  SWAP_TWO_TRAITS_SELF: 'swap_two_traits_self',
}

export const ACTIVE_CARD_TEMPLATES = [
  {
    id: 'immunity_once',
    title: 'Імунітет (один раунд)',
    description: 'Один раз не підлягаєш виключенню за результатом голосу цього раунду (ведучий фіксує).',
    effectId: ACTIVE_CARD_EFFECT_IDS.IMMUNITY_ONCE,
  },
  {
    id: 'second_chance',
    title: 'Другий шанс',
    description: 'Якщо тебе «вибули» — ведучий може повернути в гру один раз (за сюжетом шоу).',
    effectId: ACTIVE_CARD_EFFECT_IDS.SECOND_CHANCE_ELIMINATION,
  },
  {
    id: 'reroll_prof',
    title: 'Нова професія',
    description: 'Перекинути свою професію випадково (ведучий підтверджує).',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_PROFESSION_SELF,
  },
  {
    id: 'reroll_health',
    title: 'Новий медичний стан',
    description: 'Перекинути картку здоров’я для себе.',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_HEALTH_SELF,
  },
  {
    id: 'reroll_phobia',
    title: 'Інша фобія',
    description: 'Перекинути фобію для себе.',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_PHOBIA_SELF,
  },
  {
    id: 'reroll_bag',
    title: 'Новий багаж',
    description: 'Перекинути предмет багажу.',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_LUGGAGE_SELF,
  },
  {
    id: 'reroll_fact',
    title: 'Інший факт',
    description: 'Перекинути факт з біографії.',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_FACT_SELF,
  },
  {
    id: 'reroll_quirk',
    title: 'Нова особливість',
    description: 'Перекинути особливість характеру.',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_QUIRK_SELF,
  },
  {
    id: 'lucky_draw',
    title: 'Щасливий жереб',
    description: 'Ведучий перекидає випадкову одну з твоїх закритих карт і відкриває її.',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_RANDOM_TRAIT_SELF,
  },
  {
    id: 'all_prof',
    title: 'Хаос професій',
    description: 'Усім гравцям нова професія (ведучий оголошує).',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_PROFESSION_ALL,
  },
  {
    id: 'all_health',
    title: 'Медичний перегляд',
    description: 'Усім новий стан здоров’я.',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_HEALTH_ALL,
  },
  {
    id: 'all_phobia',
    title: 'Колективний страх',
    description: 'Усім нова фобія.',
    effectId: ACTIVE_CARD_EFFECT_IDS.REROLL_PHOBIA_ALL,
  },
  {
    id: 'reveal_self',
    title: 'Повне розкриття',
    description: 'Відкрити всі свої картки на оверлеї (ведучий підтверджує).',
    effectId: ACTIVE_CARD_EFFECT_IDS.REVEAL_ALL_SELF,
  },
  {
    id: 'hide_self',
    title: 'Чистий лист',
    description: 'Закрити всі свої картки знову.',
    effectId: ACTIVE_CARD_EFFECT_IDS.HIDE_ALL_SELF,
  },
  {
    id: 'extra_minute',
    title: 'Хвилина правди',
    description: 'Додатковий час на висловлювання в дискусії (ведучий дає таймер).',
    effectId: ACTIVE_CARD_EFFECT_IDS.EXTRA_SPEAK_ONCE,
  },
  {
    id: 'silence_vote',
    title: 'Заборона голосу',
    description: 'Один гравець не голосує цей раунд (ведучий вибирає кого).',
    effectId: ACTIVE_CARD_EFFECT_IDS.VETO_VOTE_ROUND,
  },
  {
    id: 'revote',
    title: 'Переголосування',
    description: 'Скасувати поточне голосування і голосувати знову.',
    effectId: ACTIVE_CARD_EFFECT_IDS.FORCE_REVOTE,
  },
  {
    id: 'cancel_decision',
    title: 'Скасування',
    description: 'Скасувати останнє рішення ради / голосу (ведучий формулює).',
    effectId: ACTIVE_CARD_EFFECT_IDS.CANCEL_LAST_DECISION,
  },
  {
    id: 'barter',
    title: 'Обмін умовами',
    description: 'Обмінятися однією карткою з іншим гравцем за згодою ведучого.',
    effectId: ACTIVE_CARD_EFFECT_IDS.SWAP_TWO_TRAITS_SELF,
  },
  {
    id: 'appeal',
    title: 'Апеляція',
    description: 'Повторно відстоюєш позицію перед фінальним голосом (наратив).',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
  {
    id: 'witness',
    title: 'Свідок',
    description: 'Один факт з зони катастрофи «бачив на власні очі» — ведучий додає деталь.',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
  {
    id: 'ration',
    title: 'Додатковий пайок',
    description: 'Лор: отримуєш частку провізії; механіка — на розсуд ведучого.',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
  {
    id: 'map_fragment',
    title: 'Уривок маршруту',
    description: 'Підказка щодо місцевості (ведучий озвучує без автоперемоги).',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
  {
    id: 'signal_try',
    title: 'Спроба сигналу',
    description: 'Одна спроба подати сигнал рятувальникам (сюжетний хід).',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
  {
    id: 'confession',
    title: 'Зізнання',
    description: 'Можеш публічно змінити одну заяву про себе (без автозміни карток).',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
  {
    id: 'alliance',
    title: 'Тимчасовий союз',
    description: 'Оголосити союз з одним гравцем на один раунд дискусії.',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
  {
    id: 'challenge',
    title: 'Виклик',
    description: 'Публічно ставиш під сумнів одну відкриту карту іншого (без автоперевірки).',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
  {
    id: 'calm',
    title: 'Заспокоєння табору',
    description: 'Зняти одну «гостру» суперечку — лише рольова дія, без зміни статів.',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
  {
    id: 'last_words',
    title: 'Останнє слово',
    description: 'Якщо тебе виганяють — 30 сек на прощання в ефірі.',
    effectId: ACTIVE_CARD_EFFECT_IDS.NARRATIVE,
  },
]

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function pickRandomActiveCardTemplate() {
  const t = pick(ACTIVE_CARD_TEMPLATES)
  return {
    title: t.title,
    description: t.description,
    effectId: t.effectId,
    templateId: t.id,
    used: false,
  }
}
