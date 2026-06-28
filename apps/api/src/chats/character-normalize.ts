/**
 * Нормализация значений персонажа при сохранении.
 *
 * В БД храним только английские lowercase-snake-ключи (gender, ethnicity и т.п.),
 * а локализация на любом языке — это уже задача UI.
 *
 * Это решает два класса проблем, которые попадали в systemPrompt:
 *   1. Русские локализованные имена из manifest.json (`Смешанная`, `Волосы-сверло`),
 *      когда страница /generation шлёт `item.name` вместо ключа.
 *   2. Сырые ключи с префиксами (`type_petite`), которые тоже попадали как есть.
 *
 * Если значение совпадает с каноническим списком (без учёта регистра и пробелов
 * vs подчёркиваний) — берём канонический ключ. Если есть в карте алиасов
 * (русские лейблы из manifest) — конвертируем. Иначе делаем мягкий slug
 * и возвращаем — так пользовательский ввод (custom strings) не теряется,
 * но приводится к единому формату.
 */

import type { CreateUserCharacterDto } from "./dto/create-user-character.dto";

// ─── Канонические списки (английские lowercase-snake ключи) ──────────────────
// Источник: apps/web/app/create/data.ts. Здесь дублируем явно, чтобы бэк
// не зависел от фронтового пакета.

const GENDERS = ["female", "male", "non_binary", "trans_female", "trans_male"];
const ORIENTATIONS = ["heterosexual", "bisexual", "homosexual", "pansexual", "asexual"];
const ETHNICITIES = [
  "slavic", "caucasian", "asian", "hispanic", "arabic", "black",
  "latino", "indian", "mixed", "scandinavian",
  // дополнения из manifest.json (страница /generation), которые часто приходят
  "european", "latina", "east_asian", "southeast_asian", "south_asian",
  "arabian", "african",
  // фэнтези из manifest
  "elf", "demon", "angel", "vampire", "werewolf", "neko", "kitsune",
  "bunny_girl", "alien", "android", "furry", "fairy", "orc", "drow",
];
const VOICES = ["gentle", "high_pitched", "deep", "rough", "calm"];
const EYE_COLORS = ["blue", "brown", "green", "hazel", "gray", "amber", "violet", "black"];
const HAIR_STYLES = [
  "straight", "wavy", "curly", "braids", "bun", "ponytail", "pixie_cut",
  "bob", "long_layers", "dreadlocks", "bangs", "twin_tails", "updo",
  "messy", "side_part",
];
const HAIR_COLORS = [
  "blonde", "brunette", "black", "red", "auburn", "platinum", "silver",
  "pink", "blue", "purple", "ombre", "strawberry_blonde", "copper", "caramel",
];
const BODY_TYPES = [
  "petite", "slim", "athletic", "curvy", "thick", "hourglass", "fit",
  "voluptuous", "muscular",
];
const SIZES = ["flat", "small", "medium", "large", "huge"];
const PERSONALITIES = [
  "overly_confident", "mysterious", "obsessed_with_you", "caregiver",
  "dominant", "submissive", "seductress", "cruel_and_unforgiving",
  "free_spirited", "demanding_bully", "hopeless_romantic", "insatiable",
  "shy_and_innocent", "playful_tease", "intellectual", "motherly",
  "tsundere", "yandere",
];
const RELATIONSHIP_TYPES = [
  "girlfriend", "boyfriend", "friend", "companion", "mentor", "rival",
  "secret_lover", "soulmate", "sugar_baby", "mistress", "dominatrix",
  "submissive_partner",
];
const FAMILY_STATUSES = [
  "single", "in_a_relationship", "married", "divorced", "widowed",
  "separated", "complicated",
];
const LIFESTYLES = [
  "active", "lazy", "homebody", "sporty", "party_girl", "workaholic",
  "adventurer", "minimalist", "luxurious", "bohemian", "health_conscious",
  "night_owl",
];

// Русские локализованные имена из manifest.json → каноничный ключ.
// Только для тех полей, где manifest реально может прислать русское значение.
const RU_ALIASES: Record<string, string> = {
  // ethnicity
  "европейская": "european",
  "латиноамериканская": "latina",
  "восточноазиатская": "east_asian",
  "юго-восточная азия": "southeast_asian",
  "южноазиатская": "south_asian",
  "арабская": "arabian",
  "африканская": "african",
  "смешанная": "mixed",
  "эльф": "elf",
  "демон / суккуб": "demon",
  "ангел": "angel",
  "вампир": "vampire",
  "оборотень": "werewolf",
  "неко": "neko",
  "кицунэ": "kitsune",
  "банни": "bunny_girl",
  "инопланетянин": "alien",
  "андроид": "android",
  "фурри": "furry",
  "фея": "fairy",
  "орк": "orc",
  "дроу": "drow",
  // hairStyle (manifest заводит причёски русскими подписями HAIR_STYLE)
  "прямые": "straight",
  "волнистые": "wavy",
  "кудрявые": "curly",
  "хвост": "ponytail",
  "низкий хвост": "low_ponytail",
  "боковой хвост": "side_ponytail",
  "два хвоста": "twin_tails",
  "косы": "braids",
  "две косички": "twin_braids",
  "боковая коса": "side_braid",
  "хвост с косой": "braided_ponytail",
  "пучок": "bun",
  "два пучка": "double_buns",
  "высокая укладка": "updo",
  "зачёсанные назад": "slicked_back",
  "прямая чёлка": "bangs",
  "чёлка на пробор": "parted_bangs",
  "боковая чёлка": "side_bangs",
  "на один глаз": "hair_over_one_eye",
  "за ухо": "tucked_behind_ear",
  "афро": "afro",
  "дреды": "dreadlocks",
  "асимметричная": "asymmetrical",
  "волосы-сверло": "drill_hair",
  "растрёпанные": "messy",
  "каре": "bob",
  "пикси": "pixie_cut",
  "ирокез": "mohawk",
  "химэ-стрижка": "hime_cut",
  "распущенные": "loose",
  // тут можно дополнять по мере появления новых проблем
};

// Префиксы, которые иногда приклеены к ключу в manifest (`type_petite`,
// `style_xxx`). Если встретили — отрезаем.
const PREFIX_STRIP = ["type_", "style_", "body_", "hair_", "color_"];

/** Готовый список полей и их канонических списков, для одного prохода. */
const FIELD_SPECS: Record<string, string[]> = {
  gender: GENDERS,
  orientation: ORIENTATIONS,
  ethnicity: ETHNICITIES,
  voice: VOICES,
  eyeColor: EYE_COLORS,
  hairStyle: HAIR_STYLES,
  hairColor: HAIR_COLORS,
  bodyType: BODY_TYPES,
  breastSize: SIZES,
  buttSize: SIZES,
  personality: PERSONALITIES,
  relationshipType: RELATIONSHIP_TYPES,
  familyStatus: FAMILY_STATUSES,
  lifestyle: LIFESTYLES,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Приводит строку к slug-формату: lowercase, пробелы и не-буквенно-цифровые → `_`.
 * `Pixie Cut` → `pixie_cut`, `Cruel & Unforgiving` → `cruel_and_unforgiving`.
 */
function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\s\-]+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Возвращает каноничный ключ из списка `canonical`, если входная строка ему
 * соответствует (с учётом разных форматов). Иначе — slug пользовательского ввода.
 */
function normalizeOne(value: string | undefined, canonical: string[]): string | undefined {
  if (!value) return value;
  const v = String(value).trim();
  if (!v) return undefined;

  const lowerRaw = v.toLowerCase();

  // 1. Прямой mapping для русских/локализованных вариантов.
  if (RU_ALIASES[lowerRaw]) return RU_ALIASES[lowerRaw];

  // 2. Slug.
  let slug = slugify(v);

  // 3. Если есть префикс из mosaic (`type_petite`) — отрежем.
  for (const p of PREFIX_STRIP) {
    if (slug.startsWith(p) && slug.length > p.length) {
      const stripped = slug.slice(p.length);
      if (canonical.includes(stripped)) return stripped;
    }
  }

  // 4. Прямое попадание в canonical.
  if (canonical.includes(slug)) return slug;

  // 5. Не нашли — оставляем slug как есть (custom user input в нормализованной
  //    форме). Это лучше, чем терять данные.
  return slug;
}

/** То же, что normalizeOne, но для массива (work/hobbies/kinks). */
function normalizeArray(arr: string[] | undefined, canonical: string[] = []): string[] | undefined {
  if (!arr || !Array.isArray(arr)) return arr;
  return arr
    .map((x) => normalizeOne(x, canonical))
    .filter((x): x is string => !!x);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Возвращает копию DTO с нормализованными значениями.
 * Не мутирует входной объект.
 */
export function normalizeCharacterDto(
  dto: CreateUserCharacterDto,
): CreateUserCharacterDto {
  const out: CreateUserCharacterDto = { ...dto };

  for (const [field, canonical] of Object.entries(FIELD_SPECS)) {
    const key = field as keyof CreateUserCharacterDto;
    const v = out[key] as unknown as string | undefined;
    if (typeof v === "string") {
      (out as any)[key] = normalizeOne(v, canonical);
    }
  }

  // Поля-массивы: каноничного списка нет (work/hobbies/kinks — open-ended),
  // но всё равно прогоним через slug, чтобы не было хаоса вроде
  // `"Horseback Riding"` рядом с `horseback_riding`.
  out.work = normalizeArray(out.work);
  out.hobbies = normalizeArray(out.hobbies);
  out.kinks = normalizeArray(out.kinks);

  // Поля, которые не нормализуем (свободный текст или несут смысл как есть):
  // name, surname, nationality, language, age, style, generationStyle,
  // avatarUrl, childhoodMemory, lifeStory, phobias — всё это либо
  // имена/тексты, либо им норм. в исходном виде.

  return out;
}

/**
 * Превращает каноничный ключ обратно в человекочитаемую форму для промпта.
 * `pixie_cut` → `pixie cut`, `trans_female` → `trans female`.
 * Используется в generate-system-prompt.ts.
 */
export function humanize(slug: string | undefined): string {
  if (!slug) return "";
  return slug.replace(/_/g, " ");
}
