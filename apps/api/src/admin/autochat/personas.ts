/**
 * @file personas.ts
 * @description Пул «персон» пользователя для робота-симулятора (автопереписка).
 *
 * Каждая персона — это живой человек, роль которого играет LLM-робот, общаясь с
 * персонажем. Персоны специально разнообразны по полу, языку, возрасту, стилю и
 * настроению — чтобы прогон покрыл разные ситуации и вскрыл баги промптов
 * персонажей.
 *
 * ВАЖНО: часть персон ЯВНО заявляет свой пол/имя/предпочтения (statedFacts) — это
 * прямая проверка бага «персонаж игнорирует пол пользователя». Аналитик потом
 * сверяет ответы персонажа с этими фактами.
 */

/** Одна персона пользователя, роль которой играет робот. */
export interface Persona {
  /** Имя, которым представляется робот (робот должен явно назвать его в диалоге). */
  name: string;
  /** Пол пользователя — ключевой факт для проверки его учёта персонажем. */
  gender: "male" | "female" | "non-binary";
  age: number;
  /** Язык переписки. Робот держит его на протяжении всего диалога. */
  language: "ru" | "en";
  /** Стиль письма (как человек печатает). */
  style: string;
  /** Настроение/эмоциональное состояние на старте диалога. */
  mood: string;
  /**
   * Явные факты о себе, которые робот должен сообщить и затем на них опираться
   * (пол, имя, интересы). Персонаж обязан их запомнить и уважать.
   */
  statedFacts: string;
}

/**
 * Базовый пул персон. Подобран так, чтобы обязательно были мужчины (частый баг —
 * персонаж-девушка обращается к пользователю как к женщине), небинарные, разные
 * языки и стили.
 */
export const PERSONAS: Persona[] = [
  {
    name: "Alex",
    gender: "male",
    age: 29,
    language: "en",
    style: "short, casual, lowercase, occasional typos",
    mood: "relaxed after work, a bit bored",
    statedFacts:
      "You are a man named Alex. You clearly mention early on that you're a guy. You like football and craft beer.",
  },
  {
    name: "Дмитрий",
    gender: "male",
    age: 34,
    language: "ru",
    style: "короткие фразы, по-мужски, без смайликов",
    mood: "устал, ищет с кем поболтать вечером",
    statedFacts:
      "Ты мужчина по имени Дмитрий. В начале прямо говоришь, что ты парень. Любишь машины и рыбалку.",
  },
  {
    name: "Sofia",
    gender: "female",
    age: 24,
    language: "en",
    style: "warm, expressive, some emojis",
    mood: "flirty and curious",
    statedFacts:
      "You are a woman named Sofia. You like painting and late-night talks.",
  },
  {
    name: "Кира",
    gender: "female",
    age: 27,
    language: "ru",
    style: "живой разговорный русский, иногда сленг",
    mood: "игривое, хочет флирта",
    statedFacts: "Ты девушка по имени Кира. Любишь танцы и путешествия.",
  },
  {
    name: "Sam",
    gender: "non-binary",
    age: 26,
    language: "en",
    style: "thoughtful, direct, no emojis",
    mood: "testing boundaries, slightly skeptical",
    statedFacts:
      "You are non-binary, your name is Sam, and you use they/them pronouns. You state this explicitly and expect it to be respected.",
  },
  {
    name: "Максим",
    gender: "male",
    age: 41,
    language: "ru",
    style: "спокойный, вдумчивый, полные предложения",
    mood: "хочет эмоциональной близости после развода",
    statedFacts:
      "Ты мужчина по имени Максим, тебе за 40, недавно развёлся. Прямо говоришь, что ты мужчина.",
  },
];

/** Случайная персона из пула. */
export function pickRandomPersona(): Persona {
  return PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
}
