import type { TKey } from "./i18n";

/**
 * Стили персонажей — единый список для визарда создания (/create) и всех
 * фильтров Style (главная, галерея, My AI). Значения совпадают с тем, что
 * сохраняет визард в personality.style; сервер сравнивает без учёта регистра.
 */
export const CHARACTER_STYLES = [
  { value: "Realistic", labelKey: "filter.realistic" as TKey },
  { value: "Semi-real", labelKey: "filter.semiReal" as TKey },
  { value: "Anime", labelKey: "filter.anime" as TKey },
  { value: "2d", labelKey: "filter.2d" as TKey },
] as const;

/** Опции для FilterDropdown: «Все» + стили создания персонажа. */
export function styleFilterOptions(t: (key: TKey) => string, allLabel: string) {
  return [
    { value: "", label: allLabel },
    ...CHARACTER_STYLES.map((s) => ({ value: s.value, label: t(s.labelKey) })),
  ];
}
