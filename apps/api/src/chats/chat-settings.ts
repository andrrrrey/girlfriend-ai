/**
 * @file chat-settings.ts
 * @description Настройки персонажа под конкретный чат пользователя
 * (ChatSession.settings). Меняют персонажа только в этом чате: карточка
 * персонажа и чаты других пользователей не затрагиваются. {} — как в карточке.
 *
 * Списки значений продублированы в apps/web/lib/chatSettings.ts (web не зависит
 * от api) — меняйте синхронно.
 */

export const CHAT_ARCHETYPES = [
  "caring", "wise", "modest", "joker", "seductress", "dominant",
  "submissive", "romantic", "passionate", "brat", "listener", "adventurer",
] as const;

/** Кто она пользователю. Родственники (в т.ч. сводные/приёмные), учитель/ученица и школа запрещены — их нет в списке. */
export const CHAT_RELATIONSHIPS = [
  "stranger", "new_acquaintance", "friend", "girlfriend", "wife",
  "ex", "neighbor", "coworker", "boss", "fan",
] as const;

export const MEETING_SCENARIOS = ["cafe", "dating_app", "vacation", "neighbors", "office"] as const;

export const CHAT_OCCUPATIONS = [
  "artist", "nurse", "chef", "photographer", "model", "programmer", "designer", "fitness_trainer",
  "doctor", "lawyer", "bartender", "writer", "musician", "flight_attendant", "barista", "entrepreneur",
] as const;

export const CHAT_HOBBIES = [
  "sports", "books", "dancing", "cooking", "gaming", "travel", "music", "art",
  "movies", "fitness", "photography", "yoga",
] as const;

/** Что ей нравится — только разрешённые темы (запрещённых в списке нет). */
export const CHAT_LIKES = [
  "romance", "compliments", "kissing", "cuddling", "teasing", "massage", "lingerie",
  "dirty_talk", "roleplay", "slow_burn", "taking_lead", "being_led",
] as const;

export const MESSAGE_LENGTHS = ["short", "medium", "long"] as const;
export const EMOJI_LEVELS = ["none", "sometimes", "many"] as const;
export const SWEARING_LEVELS = ["none", "sometimes"] as const;
export const JEALOUSY_LEVELS = ["none", "slight"] as const;
export const VOICE_MODES = ["never", "on_request", "sometimes", "always"] as const;
export const CONTENT_LEVELS = ["flirt", "nsfw"] as const;

export const SLIDER_KEYS = ["boldness", "edge", "talkativeness", "humor"] as const;

export const LIMITS = {
  backstory: 2000,
  meetingCustom: 300,
  occupation: 60,
  hobby: 40,
  hobbies: 10,
  petName: 40,
  boundary: 120,
  boundaries: 10,
  backstoryIdea: 300,
} as const;

export interface ChatSettings {
  backstory?: string;
  /** Ключ из MEETING_SCENARIOS или "custom" (текст — meetingCustom). */
  meetingScenario?: string;
  meetingCustom?: string;
  /** Ключ из CHAT_OCCUPATIONS или своё слово. */
  occupation?: string;
  /** Ключи из CHAT_HOBBIES и/или свои слова. */
  hobbies?: string[];
  archetype?: (typeof CHAT_ARCHETYPES)[number];
  relationship?: (typeof CHAT_RELATIONSHIPS)[number];
  sliders?: Partial<Record<(typeof SLIDER_KEYS)[number], number>> & { jealousy?: (typeof JEALOUSY_LEVELS)[number] };
  style?: {
    length?: (typeof MESSAGE_LENGTHS)[number];
    emoji?: (typeof EMOJI_LEVELS)[number];
    petName?: string;
    swearing?: (typeof SWEARING_LEVELS)[number];
  };
  voiceId?: string;
  /** Сохраняется; автоматическая отправка голосовых — отдельная задача. */
  voiceMode?: (typeof VOICE_MODES)[number];
  level?: (typeof CONTENT_LEVELS)[number];
  likes?: (typeof CHAT_LIKES)[number][];
  boundaries?: string[];
}

const RELATIVES_AND_SCHOOL = new RegExp(
  "(?<![\\p{L}\\p{N}])(?:" +
    [
      // EN
      "mom", "mother", "mommy", "dad", "father", "sister", "brother", "daughter", "aunt", "uncle",
      "niece", "nephew", "cousin", "grandma", "grandmother", "granddaughter", "step-?\\w+", "adoptive", "adopted",
      "in-law", "relatives?", "school\\w*", "pupil", "teacher", "classmate", "class ?teacher", "homework",
      // RU
      "мам\\p{L}*", "мать", "матер\\p{L}*", "пап\\p{L}*", "отец", "отч\\p{L}*", "сестр\\p{L}*", "брат\\p{L}*", "доч\\p{L}*",
      "сын\\p{L}*", "тёт\\p{L}*", "тет\\p{L}*", "дяд\\p{L}*", "племянн\\p{L}*", "кузин\\p{L}*", "бабушк\\p{L}*", "внучк\\p{L}*",
      "сводн\\p{L}*", "приёмн\\p{L}*", "приемн\\p{L}*", "мачех\\p{L}*", "падчериц\\p{L}*", "родственн\\p{L}*",
      "школ\\p{L}*", "ученик\\p{L}*", "учениц\\p{L}*", "учител\\p{L}*", "учительниц\\p{L}*", "одноклассн\\p{L}*", "классн\\p{L}* руковод\\p{L}*",
      // DE
      "mutter", "mama", "vater", "papa", "schwester", "bruder", "tochter", "sohn", "tante", "onkel", "nichte", "cousine",
      "stief\\p{L}*", "schul\\p{L}*", "schüler\\p{L}*", "lehrer\\p{L}*",
      // FR
      "mère", "maman", "père", "papa", "sœur", "soeur", "frère", "fils", "tante", "oncle", "nièce", "cousine",
      "belle-\\p{L}+", "demi-\\p{L}+", "école", "écolière", "élève", "lycée\\p{L}*", "collège\\p{L}*", "professeur\\p{L}*", "prof",
    ].join("|") +
    ")(?![\\p{L}\\p{N}])",
  "iu",
);

/**
 * Доп. запрет для свободного текста настроек чата: родственники (включая
 * сводных и приёмных), школа, учитель/ученица — даже без сексуального
 * контекста (общие правила генерации ловят их только вместе с ним).
 */
export function findForbiddenRelation(text: string): string | null {
  const m = RELATIVES_AND_SCHOOL.exec(text);
  return m ? m[0] : null;
}

/** Все свободные тексты настроек — для модерации. */
export function settingsFreeTexts(s: ChatSettings): string[] {
  const texts = [
    s.backstory,
    s.meetingScenario === "custom" ? s.meetingCustom : undefined,
    s.occupation && !(CHAT_OCCUPATIONS as readonly string[]).includes(s.occupation) ? s.occupation : undefined,
    ...(s.hobbies ?? []).filter((h) => !(CHAT_HOBBIES as readonly string[]).includes(h)),
    s.style?.petName,
    ...(s.boundaries ?? []),
  ];
  return texts.map((t) => (t ?? "").trim()).filter(Boolean);
}

const clampSlider = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : undefined;
const pick = <T extends readonly string[]>(list: T, v: unknown): T[number] | undefined =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : undefined;
const text = (v: unknown, max: number) => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+\n/g, "\n").trim().slice(0, max);
  return t || undefined;
};
const texts = (v: unknown, maxEach: number, maxCount: number) => {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map((x) => text(x, maxEach)).filter((x): x is string => !!x))].slice(0, maxCount);
  return out.length ? out : undefined;
};

/**
 * Приводит произвольный JSON (тело запроса, значение из БД) к ChatSettings:
 * неизвестные поля и значения вне списков отбрасываются, тексты обрезаются.
 * Пустые поля не сохраняются — {} значит «как в карточке».
 */
export function normalizeChatSettings(raw: unknown): ChatSettings {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: ChatSettings = {};

  const backstory = text(r.backstory, LIMITS.backstory);
  if (backstory) out.backstory = backstory;

  const scenario = r.meetingScenario === "custom" ? "custom" : pick(MEETING_SCENARIOS, r.meetingScenario);
  if (scenario === "custom") {
    const custom = text(r.meetingCustom, LIMITS.meetingCustom);
    if (custom) { out.meetingScenario = "custom"; out.meetingCustom = custom; }
  } else if (scenario) {
    out.meetingScenario = scenario;
  }

  const occupation = text(r.occupation, LIMITS.occupation);
  if (occupation) out.occupation = occupation;
  const hobbies = texts(r.hobbies, LIMITS.hobby, LIMITS.hobbies);
  if (hobbies) out.hobbies = hobbies;

  const archetype = pick(CHAT_ARCHETYPES, r.archetype);
  if (archetype) out.archetype = archetype;
  const relationship = pick(CHAT_RELATIONSHIPS, r.relationship);
  if (relationship) out.relationship = relationship;

  if (r.sliders && typeof r.sliders === "object") {
    const sr = r.sliders as Record<string, unknown>;
    const sliders: NonNullable<ChatSettings["sliders"]> = {};
    for (const k of SLIDER_KEYS) {
      const v = clampSlider(sr[k]);
      if (v !== undefined) sliders[k] = v;
    }
    const jealousy = pick(JEALOUSY_LEVELS, sr.jealousy);
    if (jealousy) sliders.jealousy = jealousy;
    if (Object.keys(sliders).length) out.sliders = sliders;
  }

  if (r.style && typeof r.style === "object") {
    const st = r.style as Record<string, unknown>;
    const style: NonNullable<ChatSettings["style"]> = {};
    const length = pick(MESSAGE_LENGTHS, st.length);
    if (length) style.length = length;
    const emoji = pick(EMOJI_LEVELS, st.emoji);
    if (emoji) style.emoji = emoji;
    const petName = text(st.petName, LIMITS.petName);
    if (petName) style.petName = petName;
    const swearing = pick(SWEARING_LEVELS, st.swearing);
    if (swearing) style.swearing = swearing;
    if (Object.keys(style).length) out.style = style;
  }

  const voiceId = text(r.voiceId, 100);
  if (voiceId) out.voiceId = voiceId;
  const voiceMode = pick(VOICE_MODES, r.voiceMode);
  if (voiceMode) out.voiceMode = voiceMode;
  const level = pick(CONTENT_LEVELS, r.level);
  if (level) out.level = level;

  if (Array.isArray(r.likes)) {
    const likes = [...new Set(r.likes.map((x) => pick(CHAT_LIKES, x)).filter((x): x is (typeof CHAT_LIKES)[number] => !!x))];
    if (likes.length) out.likes = likes;
  }
  const boundaries = texts(r.boundaries, LIMITS.boundary, LIMITS.boundaries);
  if (boundaries) out.boundaries = boundaries;

  return out;
}
