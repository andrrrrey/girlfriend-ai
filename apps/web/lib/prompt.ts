import { toEnglishTag } from "./optionLabel";

/**
 * Строит английский промпт для генерации изображения по данным готового
 * персонажа (personality). Логика едина для чата и страницы генерации, чтобы
 * img2img-поза была похожа на исходного персонажа.
 *
 * Все атрибуты прогоняем через toEnglishTag: что бы ни лежало в БД (русские
 * значения вроде `орк`/`дреды`, snake_case-ключи `pixie_cut`, англ. подписи
 * `Hazel`) — в промпт уходит только английский lowercase-тег. Иначе ИИ получает
 * смешанный RU/EN промпт и ломает генерацию.
 *
 * @param personality    JSON-объект персонажа (Character.personality)
 * @param extra          необязательный хвост промпта (поза/сцена/камера/кастом)
 * @param includeQuality добавлять ли quality-префикс (masterpiece, ...). На
 *   странице генерации хвост уже содержит его — там передаём false.
 */
export function buildCharacterImagePrompt(
  personality: Record<string, unknown>,
  extra?: string,
  includeQuality = true,
): string {
  const parts: string[] = includeQuality
    ? ["masterpiece", "best quality", "highres", "nsfw", "explicit"]
    : [];

  const genderMap: Record<string, string> = {
    female: "woman",
    male: "man",
    femboy: "femboy, feminine male",
    "non binary": "androgynous person",
    "non-binary": "androgynous person",
  };
  const gender = toEnglishTag(personality.gender as string | undefined);
  if (gender) parts.push(genderMap[gender] || gender);

  const age = personality.age as string | number | undefined;
  if (age) parts.push(`${age}-year-old`);

  const ethnicity = toEnglishTag((personality.ethnicity || personality.nationality) as string | undefined);
  if (ethnicity) parts.push(ethnicity);

  const eyeColor = toEnglishTag(personality.eyeColor as string | undefined);
  if (eyeColor) parts.push(`${eyeColor} eyes`);

  const hairColor = toEnglishTag(personality.hairColor as string | undefined);
  if (hairColor) parts.push(`${hairColor} hair`);

  const hairStyle = toEnglishTag(personality.hairStyle as string | undefined);
  if (hairStyle) parts.push(hairStyle);

  const bodyType = toEnglishTag(personality.bodyType as string | undefined);
  if (bodyType) parts.push(bodyType);

  const breastSize = toEnglishTag(personality.breastSize as string | undefined);
  if (breastSize) parts.push(`${breastSize} breasts`);

  const buttSize = toEnglishTag(personality.buttSize as string | undefined);
  if (buttSize) parts.push(`${buttSize} butt`);

  const height = toEnglishTag(personality.height as string | undefined);
  if (height) parts.push(height);

  if (extra && extra.trim()) parts.push(extra.trim());

  return parts.filter(Boolean).join(", ");
}
