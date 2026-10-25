/**
 * @file option-tags.ts
 * @description Английский тег опции для промпта генерации (toEnglishTag).
 *
 * ЗЕРКАЛО apps/web/lib/optionLabel.ts (EN-часть: humanizeEn + RU_TO_EN): web не
 * зависит от @repo/types, а серверная сборка промпта должна давать ровно тот же
 * результат, что прежняя сборка в браузере. Меняя словари — меняйте в обоих местах.
 */

const PREFIXES = ["img_", "motion_v_", "motion_", "marks_", "type_", "angle_"];

const SMALL_WORDS = new Set(["and", "or", "the", "of", "a", "an", "with", "on", "in", "to", "from", "at", "by", "for", "up"]);

// Аббревиатуры/особые случаи английского отображения.
const EN_SPECIAL: Record<string, string> = {
  pov: "POV", dp: "DP", mfm: "MFM", asmr: "ASMR", "69": "69",
  "2d": "2D", o: "O", g: "G", p: "P",
};

function stripPrefix(raw: string): string {
  for (const p of PREFIXES) {
    if (raw.startsWith(p) && raw.length > p.length) return raw.slice(p.length);
  }
  return raw;
}

/** Нормализованный ключ: без префикса, нижний регистр, слова через пробел. */
function normKey(raw: string): string {
  return stripPrefix(raw.trim()).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Человекочитаемая английская подпись. */
export function humanizeEn(raw: string): string {
  if (!raw) return "";
  const key = normKey(raw);
  if (!key) return "";
  return key
    .split(" ")
    .map((w, i) => {
      if (EN_SPECIAL[w]) return EN_SPECIAL[w];
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

const RU_TO_EN: Record<string, string> = {
  // Этничность (человеческие)
  "европейская": "Caucasian", "латиноамериканская": "Latina", "восточноазиатская": "East Asian",
  "юго-восточная азия": "Southeast Asian", "южноазиатская": "South Asian", "арабская": "Arab",
  "африканская": "African", "смешанная": "Mixed",
  // Этничность (фэнтезийные)
  "эльф": "Elf", "демон / суккуб": "Demon / Succubus", "ангел": "Angel", "вампир": "Vampire",
  "оборотень": "Werewolf", "неко": "Neko", "кицунэ": "Kitsune", "банни": "Bunny",
  "инопланетянин": "Alien", "андроид": "Android", "фурри": "Furry", "фея": "Fairy",
  "орк": "Orc", "дроу": "Drow",
  // Причёски
  "прямые": "Straight", "волнистые": "Wavy", "кудрявые": "Curly", "хвост": "Ponytail",
  "боковой хвост": "Side Ponytail", "два хвоста": "Twin Tails", "косы": "Braids",
  "две косички": "Twin Braids", "боковая коса": "Side Braid", "хвост с косой": "Braided Ponytail",
  "пучок": "Bun", "два пучка": "Double Buns", "высокая укладка": "Updo",
  "зачёсанные назад": "Slicked Back", "прямая чёлка": "Straight Bangs", "чёлка на пробор": "Parted Bangs",
  "боковая чёлка": "Side Bangs", "на один глаз": "Hair Over One Eye", "за ухо": "Tucked Behind Ear",
  "афро": "Afro", "дреды": "Dreadlocks", "асимметричная": "Asymmetrical", "волосы-сверло": "Drill Hair",
  "растрёпанные": "Messy", "каре": "Bob", "пикси": "Pixie", "ирокез": "Mohawk",
  "химэ-стрижка": "Hime Cut", "распущенные": "Loose", "низкий хвост": "Low Ponytail",
};

/**
 * Английское значение опции для ПРОМПТА: русские значения из БД/манифеста →
 * английский эквивалент; ключи/snake_case → слова; результат в нижнем регистре.
 */
export function toEnglishTag(value: string | null | undefined): string {
  if (value == null) return "";
  const v = String(value).trim();
  if (!v) return "";
  if (/[Ѐ-ӿ]/.test(v)) return (RU_TO_EN[v.toLowerCase()] ?? v).toLowerCase();
  return humanizeEn(v).toLowerCase();
}
