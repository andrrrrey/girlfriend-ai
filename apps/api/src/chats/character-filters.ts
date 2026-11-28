/** Фильтры каталога персонажей (чистые функции). */

/** Диапазон возраста из предпочтений: "18-25" | "26-35" | "36-45" | "46+". */
export function parseAgeRange(range?: string): { min: number; max: number } | null {
  if (!range) return null;
  const plus = /^(\d{2})\+$/.exec(range);
  if (plus) return { min: Number(plus[1]), max: 200 };
  const m = /^(\d{2})-(\d{2,3})$/.exec(range);
  if (!m) return null;
  const min = Number(m[1]);
  const max = Number(m[2]);
  return min <= max ? { min, max } : null;
}
