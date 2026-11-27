/**
 * Список доступных гендеров персонажей (Title Case). Только `Female`.
 */
export const ALL_GENDERS = ["Female"] as const;

export type Gender = (typeof ALL_GENDERS)[number];

/**
 * Сайт поддерживает только женских персонажей: мужские/транс/небинарные
 * варианты убраны. Аргумент оставлен для совместимости со старым
 * `ENABLED_GENDERS` AppSetting — его значение больше ни на что не влияет.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveEnabledGenders(_rawValue?: string | null): string[] {
  return [...ALL_GENDERS];
}
