/**
 * @file comment-gen.util.ts
 * @description Чистые хелперы автокомментариев (админка → «Вовлечённость»):
 * реалистичные ники бот-пользователей, «голоса» ботов, типы комментариев,
 * сборка контекста/промпта для LLM и фильтр мусора в ответе модели.
 */

// ─── Ники ────────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "mike", "jake", "chris", "dan", "alex", "matt", "ryan", "kevin", "tyler", "nick",
  "josh", "brandon", "eric", "sam", "tom", "ben", "luke", "adam", "jason", "marcus",
  "derek", "sean", "kyle", "zach", "nate", "cody", "trevor", "evan", "logan", "owen",
  "leo", "max", "victor", "andre", "carlos", "diego", "marco", "luca", "felix", "oscar",
  "steve", "paul", "greg", "rob", "tony", "frank", "jimmy", "danny", "rick", "wes",
];

const LAST_NAMES = [
  "miller", "carter", "reed", "brooks", "hayes", "cole", "ward", "price", "bennett", "ross",
  "foster", "grant", "perez", "rivera", "walsh", "kelly", "novak", "keller", "moreno", "silva",
];

const NICK_WORDS = [
  "nightowl", "lonewolf", "coffeeaddict", "gymrat", "roadtripper", "chillguy", "bluesky", "darkhorse",
  "latenight", "surfdude", "hoopsfan", "vinylhead", "snowrider", "cityboy", "wanderer", "sunsetchaser",
  "bookworm", "pixelpusher", "grillmaster", "thegreekguy", "texasboy", "jerseyguy", "midwestdad", "gamerdude",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Случайный правдоподобный ник (только [a-z0-9_] — как требует валидация профиля):
 * mike_87, jreed, nightowl_22, danny, lonewolf1994, carter_matt…
 */
export function randomNickname(): string {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  switch (randInt(0, 7)) {
    case 0:
      return `${first}_${randInt(80, 99)}`;
    case 1:
      return `${first[0]}${last}`;
    case 2:
      return `${pick(NICK_WORDS)}_${randInt(1, 99)}`;
    case 3:
      return `${pick(NICK_WORDS)}${randInt(1985, 2004)}`;
    case 4:
      return `${first}${last}${randInt(1, 9)}`;
    case 5:
      return `${last}_${first}`;
    case 6:
      return `${first}${randInt(100, 999)}`;
    default:
      return pick(NICK_WORDS);
  }
}

/** Бот-пользователи отличаются доменом почты, а не префиксом ника. */
export const BOT_EMAIL_DOMAIN = "@bots.local";

// ─── Голоса ботов и типы комментариев ────────────────────────────────────────

/**
 * Манера письма бота. Выбирается детерминированно по id пользователя, поэтому
 * один и тот же ник пишет в одном стиле на всех страницах.
 */
const VOICES = [
  "short excited reaction, 1-2 emojis",
  "all lowercase, no punctuation, casual",
  "playful and flirty, a bit cheeky",
  "enthusiastic fan, 1-2 sentences",
  "chill and understated, very few words",
  "shy and sweet, slightly awkward",
  "confident charmer, smooth compliment",
  "funny guy, light joke",
] as const;

export function voiceFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return VOICES[h % VOICES.length];
}

/** Что именно пишет комментатор — перемешивается, чтобы тред был разнообразным. */
const CHARACTER_ANGLES = [
  "compliment her looks (smile, eyes, hair, style, figure) — tasteful",
  "react to one of her hobbies, her job or lifestyle",
  "ask her a light personal question",
  "say how chatting with her went (e.g. talked late at night, she made your day)",
  "short one-line reaction",
  "flirty line addressed to her directly, by name",
  "relate to her personality trait",
  "compare her favorably to others on the site, or say she's your favorite",
] as const;

const SHORT_ANGLES = [
  "react to the video vibe or mood",
  "compliment how she looks in this video — tasteful",
  "short one-line reaction",
  "flirty line addressed to her directly",
  "ask for more videos like this",
  "comment on the setting or outfit",
] as const;

/** N типов комментариев без подряд идущих повторов (по кругу из перемешанного списка). */
export function pickAngles(kind: "character" | "short", n: number): string[] {
  const pool = [...(kind === "character" ? CHARACTER_ANGLES : SHORT_ANGLES)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: n }, (_, i) => pool[i % pool.length]);
}

// ─── Контекст цели ───────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(", ");
  return "";
}

/**
 * Описание персонажа для модели: только «витринные» поля (внешность, возраст,
 * хобби, работа, характер). Кинки и теги-кинки намеренно НЕ передаём —
 * комментарии должны быть флиртом без пошлости.
 */
export function describeCharacter(name: string, personality: Record<string, unknown>): string {
  const p = personality || {};
  const seo = (p.seo as Record<string, unknown> | undefined) || {};
  const lines: string[] = [`Name: ${name}`];
  const add = (label: string, v: unknown) => {
    const s = str(v);
    if (s) lines.push(`${label}: ${s}`);
  };
  add("Age", p.age);
  add("Ethnicity", p.ethnicity);
  add("Nationality", p.nationality);
  add("Body type", p.bodyType);
  add("Hair", [str(p.hairColor), str(p.hairStyle)].filter(Boolean).join(" "));
  add("Eyes", p.eyeColor);
  add("Personality", p.personality);
  add("Job", p.work);
  add("Hobbies", p.hobbies);
  add("Lifestyle", p.lifestyle);
  add("She is looking for", p.relationshipType);
  const bio = str(seo.bio) || str(p.description) || str(p.bio);
  if (bio) lines.push(`About her: ${bio.slice(0, 600)}`);
  return lines.join("\n");
}

// ─── Промпт ──────────────────────────────────────────────────────────────────

export const COMMENT_SYSTEM_PROMPT = [
  "You write realistic comments that real users of a dating/companion website leave on a woman's profile or video.",
  "Rules:",
  "- English only. Sound like real guys typing on a phone: natural, varied, sometimes imperfect.",
  "- Flirty and warm is fine, but NOTHING sexual or explicit: no body parts below the neck, no sex, no innuendo about sex.",
  "- Never mention AI, bots, apps, models, prompts, characters, generation or the website itself.",
  "- No hashtags, no quotes around the text, no *actions in asterisks*, no notes in parentheses, no labels, no metadata.",
  "- Each comment 2-25 words. Every comment must be different in wording and idea. Emojis only when the voice calls for it.",
  "- Output ONLY a JSON array of strings, one string per requested comment, in the same order. No other text.",
].join("\n");

export function buildCommentPrompt(params: {
  kind: "character" | "short";
  context: string;
  slots: { voice: string; angle: string }[];
  existing: string[];
}): string {
  const { kind, context, slots, existing } = params;
  const target = kind === "character" ? "her profile" : "her short video";
  const parts = [
    `Write ${slots.length} comments on ${target}.`,
    "",
    "About her:",
    context,
  ];
  if (existing.length > 0) {
    parts.push("", "Comments already posted (do not repeat their ideas or wording):");
    for (const c of existing.slice(0, 15)) parts.push(`- ${c}`);
  }
  parts.push("", "Comments to write (each by a different user):");
  slots.forEach((s, i) => parts.push(`${i + 1}. voice: ${s.voice}; content: ${s.angle}`));
  parts.push("", `Return a JSON array of exactly ${slots.length} strings.`);
  return parts.join("\n");
}

// ─── Разбор и фильтр ответа ──────────────────────────────────────────────────

/** Достаёт массив строк из ответа модели (терпимо к ```json-обёртке и мусору вокруг). */
export function parseCommentArray(raw: string): string[] {
  const text = (raw || "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      const arr = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(arr)) {
        return arr
          .map((x) => (typeof x === "string" ? x : typeof x?.text === "string" ? x.text : ""))
          .filter(Boolean);
      }
    } catch {
      /* падаем в построчный разбор */
    }
  }
  // Фолбэк: нумерованный/маркированный список построчно.
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•])\s*/, "").trim())
    .filter(Boolean);
}

/** Упоминания AI/продукта и пошлость (целые слова). */
const BANNED_WORDS =
  /\b(ai|a\.i|bots?|chatbot|app|prompt|generated|generation|virtual|timestamp|sex|sexual|nude|naked|boobs?|tits?|ass|pussy|dick|cock|cum|horny|fuck\w*|lewd|bedroom)\b/i;
/** Служебный мусор модели: ремарки, пометки в скобках, хэштеги, ссылки, «Views: 85». */
const BANNED_MARKUP = /\([^)]*[a-z]{2,}[^)]*\)|[*#{}\[\]]|https?:\/\/|\b(comment id|views|likes|context|tone)\s*:/i;

/**
 * Приводит комментарий к чистому виду или отбрасывает (возвращает null):
 * метаданные, ремарки, упоминания AI, пошлость, неверная длина.
 */
export function cleanComment(raw: string): string | null {
  const text = (raw || "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (BANNED_WORDS.test(text) || BANNED_MARKUP.test(text)) return null;
  const words = text.split(" ").length;
  if (words < 2 || words > 30 || text.length > 220) return null;
  return text;
}

/** Нормализованный ключ для отсева дублей. */
export function dedupeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Случайная дата комментария за последние maxDays дней, но не раньше notBefore.
 * Сдвиг смещён к недавнему (квадрат равномерного) — свежих комментариев больше.
 */
export function randomPastDate(notBefore: Date, maxDays = 30): Date {
  const now = Date.now();
  const floor = Math.max(notBefore.getTime(), now - maxDays * 86_400_000);
  const span = Math.max(0, now - floor);
  const r = Math.random();
  return new Date(now - Math.floor(span * r * r));
}
