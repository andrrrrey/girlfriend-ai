/**
 * Справочники фильтров публичной галереи: стили и теги.
 *
 * Раньше теги считались частотой случайных слов из промптов («detailed»,
 * «skin», «lighting» …) и фильтровали только уже загруженную страницу на
 * клиенте. Теперь — фиксированный список осмысленных тегов, каждый из которых
 * раскрывается в набор ключевых слов промпта и фильтруется на сервере.
 */

export interface GalleryFilterDef {
  key: string;
  /** Ключевые слова, которые ищем в input.prompt (в нижнем регистре). */
  keywords: string[];
  /** Значения input.generationStyle (только для стилей). */
  generationStyles?: string[];
}

export const GALLERY_STYLES: GalleryFilterDef[] = [
  { key: "realistic", generationStyles: ["realism"], keywords: ["realistic", "photorealistic", "photograph", "raw photo"] },
  { key: "anime", generationStyles: ["mistoon"], keywords: ["anime", "manga"] },
  { key: "illustration", generationStyles: ["wai-ill"], keywords: ["illustration", "hentai"] },
  { key: "cartoon", generationStyles: ["3d", "2d"], keywords: ["cartoon", "3d render", "pixar", "disney"] },
  { key: "fantasy", keywords: ["fantasy", "elf", "demon", "succubus", "angel", "vampire", "fairy"] },
  { key: "furry", generationStyles: ["furry"], keywords: ["furry", "anthro"] },
  { key: "cyberpunk", keywords: ["cyberpunk", "neon", "sci-fi", "android", "cyborg"] },
];

export const GALLERY_TAGS: GalleryFilterDef[] = [
  // Внешность
  { key: "blonde", keywords: ["blonde", "platinum hair"] },
  { key: "brunette", keywords: ["brunette", "brown hair"] },
  { key: "redhead", keywords: ["redhead", "red hair", "ginger", "auburn", "copper hair"] },
  { key: "black_hair", keywords: ["black hair"] },
  { key: "asian", keywords: ["asian", "japanese", "korean", "chinese"] },
  { key: "latina", keywords: ["latina", "hispanic", "latino", "brazilian"] },
  { key: "ebony", keywords: ["ebony", "black woman", "african", "dark skin"] },
  { key: "petite", keywords: ["petite", "slim", "skinny"] },
  { key: "curvy", keywords: ["curvy", "thick", "voluptuous", "hourglass"] },
  { key: "athletic", keywords: ["athletic", "fit body", "muscular", "fitness"] },
  { key: "milf", keywords: ["milf", "mature woman", "mature"] },
  { key: "tattoo", keywords: ["tattoo"] },
  { key: "glasses", keywords: ["glasses"] },
  // Одежда
  { key: "lingerie", keywords: ["lingerie", "panties", "corset"] },
  { key: "bikini", keywords: ["bikini", "swimsuit"] },
  { key: "dress", keywords: ["dress", "gown"] },
  { key: "stockings", keywords: ["stockings", "fishnet", "pantyhose"] },
  { key: "latex", keywords: ["latex", "leather"] },
  { key: "cosplay", keywords: ["cosplay", "costume"] },
  { key: "uniform", keywords: ["uniform", "nurse", "maid", "schoolgirl", "police"] },
  { key: "nude", keywords: ["nude", "naked", "topless"] },
  // Место
  { key: "bedroom", keywords: ["bedroom", "on bed", "in bed"] },
  { key: "beach", keywords: ["beach", "ocean", "seaside"] },
  { key: "pool", keywords: ["pool", "swimming"] },
  { key: "shower", keywords: ["shower", "bath", "bathroom"] },
  { key: "office", keywords: ["office", "desk", "secretary"] },
  { key: "gym", keywords: ["gym", "workout", "yoga"] },
  { key: "outdoor", keywords: ["outdoor", "forest", "park", "garden", "street", "city"] },
  { key: "night", keywords: ["night", "neon", "moonlight", "club"] },
  // Кадр
  { key: "selfie", keywords: ["selfie", "mirror"] },
  { key: "portrait", keywords: ["portrait", "close-up", "closeup", "headshot"] },
  { key: "full_body", keywords: ["full body", "full-body"] },
  { key: "smile", keywords: ["smile", "smiling", "laughing"] },
];

const STYLE_MAP = new Map(GALLERY_STYLES.map((s) => [s.key, s]));
const TAG_MAP = new Map(GALLERY_TAGS.map((t) => [t.key, t]));

/**
 * JSON string_contains в Postgres регистрозависим — ищем и строчный, и
 * капитализированный вариант слова (промпты пишутся в обоих видах).
 */
function promptContainsAny(keywords: string[]): Record<string, unknown>[] {
  const variants = new Set<string>();
  for (const kw of keywords) {
    variants.add(kw);
    variants.add(kw.charAt(0).toUpperCase() + kw.slice(1));
  }
  return Array.from(variants).map((v) => ({ input: { path: ["prompt"], string_contains: v } }));
}

/** Prisma-условие для стиля (или null, если стиль неизвестен). */
export function styleCondition(style: string): Record<string, unknown> | null {
  const def = STYLE_MAP.get(style.toLowerCase());
  if (!def) {
    // Легаси: произвольная строка — как раньше, поиск по промпту.
    return { OR: promptContainsAny([style.toLowerCase()]) };
  }
  const or: Record<string, unknown>[] = promptContainsAny(def.keywords);
  for (const gs of def.generationStyles ?? []) {
    or.push({ input: { path: ["generationStyle"], equals: gs } });
  }
  return { OR: or };
}

/** Prisma-условие для набора тегов: подходит работа с любым из тегов. */
export function tagsCondition(tags: string[]): Record<string, unknown> | null {
  const keywords = tags.flatMap((t) => TAG_MAP.get(t)?.keywords ?? []);
  if (keywords.length === 0) return null;
  return { OR: promptContainsAny(keywords) };
}

/** Есть ли в промпте хоть одно ключевое слово тега (для подсчёта на бэке). */
export function promptMatchesTag(promptLower: string, def: GalleryFilterDef): boolean {
  return def.keywords.some((kw) => new RegExp(`\\b${kw.replace(/[-]/g, "\\-")}\\b`).test(promptLower));
}
