/**
 * @file slug.ts
 * @description Канонический идентификатор опции генерации из её названия.
 *
 * "Golden Hour" → "golden-hour", "Боковая коса" → "боковая-коса",
 * "type_petite" → "type-petite". Детерминирован и не зависит от регистра,
 * пунктуации и диакритики — поэтому одинаково работает для сайта, Telegram и
 * роутера намерений.
 */
export function slugify(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
