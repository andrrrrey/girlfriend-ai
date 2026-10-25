/**
 * @file synonyms.ts
 * @description Нормализация синонимов опций генерации (админка и автогенерация).
 */

/** Максимум синонимов у одной опции. */
export const MAX_SYNONYMS = 12;
const MAX_SYNONYM_LENGTH = 60;

/**
 * Чистит список синонимов: обрезает пробелы, приводит к нижнему регистру,
 * убирает пустые, дубли, слишком длинные и совпадающие с названием опции.
 *
 * @param name — название опции (синоним, равный названию, не нужен)
 */
export function normalizeSynonyms(list: readonly unknown[] | null | undefined, name?: string): string[] {
  if (!list) return [];
  const own = name?.trim().toLowerCase();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const value = item.trim().toLowerCase().replace(/\s+/g, " ");
    if (!value || value.length > MAX_SYNONYM_LENGTH || value === own || out.includes(value)) continue;
    out.push(value);
    if (out.length >= MAX_SYNONYMS) break;
  }
  return out;
}
