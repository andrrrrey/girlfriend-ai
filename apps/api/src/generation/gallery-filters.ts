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
  /**
   * Группа тега. Внутри группы выбранные теги объединяются через ИЛИ
   * (blonde + brunette = любая из них), между группами — через И
   * (blonde + bikini = обе сразу). Теги без группы — каждый сам по себе группа.
   */
  group?: string;
}

/**
 * Ключевые слова не пересекаются между стилями: «realistic» не берём, т.к. это
 * подстрока «semi-realistic»; «illustration» — подстрока промптов аниме/2D.
 * Стили — те же, что при создании персонажа (apps/web/lib/styles.ts):
 * Realistic, Semi-real, Anime, 2D. generationStyle — модель генерации стиля
 * (соответствие как в apps/web/lib/prompt.ts и admin/character-options).
 */
export const GALLERY_STYLES: GalleryFilterDef[] = [
  { key: "realistic", generationStyles: ["realism"], keywords: ["photorealistic", "photograph", "raw photo"] },
  { key: "semi-real", generationStyles: ["wai-ill"], keywords: ["semi-realistic", "digital painting"] },
  { key: "anime", generationStyles: ["mistoon"], keywords: ["anime", "manga"] },
  { key: "2d", generationStyles: ["2d", "3d"], keywords: ["2d illustration", "flat colors", "cartoon", "3d render"] },
];

export const GALLERY_TAGS: GalleryFilterDef[] = [
  // Внешность
  { key: "blonde", group: "hair", keywords: ["blonde", "platinum hair"] },
  { key: "brunette", group: "hair", keywords: ["brunette", "brown hair"] },
  { key: "redhead", group: "hair", keywords: ["redhead", "red hair", "ginger", "auburn", "copper hair"] },
  { key: "black_hair", group: "hair", keywords: ["black hair"] },
  { key: "asian", group: "ethnicity", keywords: ["asian", "japanese", "korean", "chinese"] },
  { key: "latina", group: "ethnicity", keywords: ["latina", "hispanic", "latino", "brazilian"] },
  { key: "ebony", group: "ethnicity", keywords: ["ebony", "black woman", "african", "dark skin"] },
  { key: "petite", group: "body", keywords: ["petite", "slim", "skinny"] },
  { key: "curvy", group: "body", keywords: ["curvy", "thick", "voluptuous", "hourglass"] },
  { key: "athletic", group: "body", keywords: ["athletic", "fit body", "muscular", "fitness"] },
  { key: "milf", group: "body", keywords: ["milf", "mature woman", "mature"] },
  { key: "tattoo", keywords: ["tattoo"] },
  { key: "glasses", keywords: ["glasses"] },
  // Одежда
  { key: "lingerie", group: "clothing", keywords: ["lingerie", "panties", "corset"] },
  { key: "bikini", group: "clothing", keywords: ["bikini", "swimsuit"] },
  { key: "dress", group: "clothing", keywords: ["dress", "gown"] },
  { key: "stockings", group: "clothing", keywords: ["stockings", "fishnet", "pantyhose"] },
  { key: "latex", group: "clothing", keywords: ["latex", "leather"] },
  { key: "cosplay", group: "clothing", keywords: ["cosplay", "costume"] },
  { key: "uniform", group: "clothing", keywords: ["uniform", "nurse", "maid", "schoolgirl", "police"] },
  { key: "nude", group: "clothing", keywords: ["nude", "naked", "topless"] },
  // Место
  { key: "bedroom", group: "place", keywords: ["bedroom", "on bed", "in bed"] },
  { key: "beach", group: "place", keywords: ["beach", "ocean", "seaside"] },
  { key: "pool", group: "place", keywords: ["pool", "swimming"] },
  { key: "shower", group: "place", keywords: ["shower", "bath", "bathroom"] },
  { key: "office", group: "place", keywords: ["office", "desk", "secretary"] },
  { key: "gym", group: "place", keywords: ["gym", "workout", "yoga"] },
  { key: "outdoor", group: "place", keywords: ["outdoor", "forest", "park", "garden", "street", "city"] },
  { key: "night", group: "place", keywords: ["night", "neon", "moonlight", "club"] },
  // Кадр
  { key: "selfie", group: "shot", keywords: ["selfie", "mirror"] },
  { key: "portrait", group: "shot", keywords: ["portrait", "close-up", "closeup", "headshot"] },
  { key: "full_body", group: "shot", keywords: ["full body", "full-body"] },
  { key: "smile", group: "shot", keywords: ["smile", "smiling", "laughing"] },
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

/**
 * Prisma-условие для набора тегов: ИЛИ внутри группы, И между группами.
 * Например, blonde + brunette + bikini → (blonde ИЛИ brunette) И bikini.
 */
export function tagsCondition(tags: string[]): Record<string, unknown> | null {
  const byGroup = new Map<string, string[]>();
  for (const t of tags) {
    const def = TAG_MAP.get(t);
    if (!def) continue;
    const group = def.group ?? `tag:${def.key}`;
    byGroup.set(group, [...(byGroup.get(group) ?? []), ...def.keywords]);
  }
  if (byGroup.size === 0) return null;
  const clauses = Array.from(byGroup.values()).map((keywords) => ({ OR: promptContainsAny(keywords) }));
  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}

/** Есть ли в промпте хоть одно ключевое слово тега (для подсчёта на бэке). */
export function promptMatchesTag(promptLower: string, def: GalleryFilterDef): boolean {
  return def.keywords.some((kw) => new RegExp(`\\b${kw.replace(/[-]/g, "\\-")}\\b`).test(promptLower));
}

// ─── Пагинация и дедупликация ленты/истории ──────────────────

/** Курсор ленты: `${createdAt ISO}_${id}` последнего показанного элемента. */
export function parseGalleryCursor(cursor?: string | null): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const i = cursor.lastIndexOf("_");
  if (i <= 0) return null;
  const createdAt = new Date(cursor.slice(0, i));
  const id = cursor.slice(i + 1);
  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { createdAt, id };
}

interface HistoryJobLike {
  id: string;
  createdAt: Date;
  output: unknown;
  cachedFrom?: string | null;
}

function outputUrl(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const url = (output as Record<string, unknown>)["url"];
  return typeof url === "string" && url ? url : null;
}

/**
 * Убирает повторы одного и того же кадра из истории пользователя.
 * Общий кэш медиа создаёт производное задание (cachedFrom) со свежей датой и
 * тем же URL — без дедупа старое фото «всплывало» в истории ещё раз.
 * Из группы с одинаковым URL оставляем собственное (не из кэша) задание,
 * иначе самое раннее. Порядок входа (по убыванию даты) сохраняется.
 */
export function dedupeHistoryJobs<T extends HistoryJobLike>(jobs: T[]): T[] {
  const keep = new Map<string, T>();
  for (const job of jobs) {
    const url = outputUrl(job.output);
    if (!url) continue;
    const prev = keep.get(url);
    if (!prev) { keep.set(url, job); continue; }
    const prevCached = !!prev.cachedFrom;
    const curCached = !!job.cachedFrom;
    if (prevCached && !curCached) keep.set(url, job);
    else if (prevCached === curCached && job.createdAt < prev.createdAt) keep.set(url, job);
  }
  const ids = new Set([...keep.values()].map((j) => j.id));
  return jobs.filter((j) => (outputUrl(j.output) ? ids.has(j.id) : true));
}
