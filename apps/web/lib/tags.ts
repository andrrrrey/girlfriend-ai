/**
 * Единый форматтер тегов для отображения в UI.
 *
 * Решает две задачи (ТЗ):
 *  1. Теги с нижним подчёркиванием (`type_petite`, `pixie_cut`) показываем
 *     человекочитаемо, без подчёркиваний: "Petite", "Pixie Cut".
 *  2. Русские теги из старых данных (`Смешанная`, `Эльф`) переводим на английский.
 *
 * Источник данных — `Character.tags` (англ. lowercase-snake после нормализации
 * на бэке), но в БД встречаются и старые русские/сырые значения, поэтому
 * форматируем максимально устойчиво.
 */

// Русские (и иные локализованные) значения → английское отображение.
const RU_TO_EN: Record<string, string> = {
  // Ethnicity / race
  "европейская": "European",
  "латиноамериканская": "Latina",
  "восточноазиатская": "East Asian",
  "юго-восточная азия": "Southeast Asian",
  "южноазиатская": "South Asian",
  "арабская": "Arabian",
  "африканская": "African",
  "смешанная": "Mixed",
  "славянская": "Slavic",
  "азиатская": "Asian",
  "кавказская": "Caucasian",
  "скандинавская": "Scandinavian",
  "индийская": "Indian",
  "эльф": "Elf",
  "демон / суккуб": "Demon",
  "демон": "Demon",
  "суккуб": "Succubus",
  "ангел": "Angel",
  "вампир": "Vampire",
  "оборотень": "Werewolf",
  "неко": "Neko",
  "кицунэ": "Kitsune",
  "банни": "Bunny Girl",
  "инопланетянин": "Alien",
  "андроид": "Android",
  "фурри": "Furry",
};

// Префиксы из manifest/старых данных, которые надо отрезать.
const STRIP_PREFIXES = ["type_", "style_", "body_", "hair_", "color_"];

const SMALL_WORDS = new Set(["and", "or", "the", "of", "a", "an", "with"]);

function titleCase(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map((w, i) =>
      i > 0 && SMALL_WORDS.has(w.toLowerCase())
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

/** Форматирует один тег для показа: без `_`, на английском, Title Case. */
export function formatTag(raw: string): string {
  if (!raw) return "";
  const lower = raw.trim().toLowerCase();

  // 1. Прямой перевод локализованных значений.
  if (RU_TO_EN[lower]) return RU_TO_EN[lower];

  // 2. Чистим: префиксы, подчёркивания/дефисы → пробелы.
  let s = lower;
  for (const p of STRIP_PREFIXES) {
    if (s.startsWith(p) && s.length > p.length) {
      s = s.slice(p.length);
      break;
    }
  }
  s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  // 3. Если после чистки получилось известное русское слово — переводим.
  if (RU_TO_EN[s]) return RU_TO_EN[s];

  return titleCase(s);
}

/** Форматирует массив тегов. */
export function formatTags(tags: string[] | undefined | null): string[] {
  if (!tags) return [];
  return tags.map(formatTag).filter(Boolean);
}
