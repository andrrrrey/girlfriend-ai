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
  // Если у персонажа сохранён точный промпт его аватара (avatarPrompt) — берём
  // ИМЕННО его как базу, а не пересобираем из атрибутов. Так генерация в чате и
  // на странице генерации использует тот же промпт, что создал показанный аватар
  // (включая наряд/позу/сцену), и образ не «плывёт». Хвост extra (поза/действие)
  // добавляем в конец. Quality/NSFW-теги добавит сервер (apps/ai), поэтому здесь
  // их не дублируем.
  const savedPrompt = typeof personality.avatarPrompt === "string" ? personality.avatarPrompt.trim() : "";
  if (savedPrompt) {
    return [savedPrompt, extra?.trim()].filter(Boolean).join(", ");
  }

  // Фолбэк для персонажей без сохранённого промпта (созданных до этой фичи):
  // пересобираем промпт из атрибутов personality, как раньше.
  const parts: string[] = [];

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

/**
 * Начало промпта аватара по стилю персонажа (имя опции STYLE: Realistic,
 * Semi-real, Anime, 2D, 3D…; при незнакомом имени — по generationStyle пула).
 * Раньше всё, кроме «Anime», получало «photorealistic» — 3D/2D/Semi-real
 * уходили в аниме/иллюстрационные чекпоинты с фотореализмом в промпте, и модель
 * выдавала постеризованную мешанину стилей.
 */
// Зеркало stylePromptPrefix из packages/types (web не зависит от @repo/types).
export function stylePromptPrefix(style?: string | null, generationStyle?: string | null): string {
  const s = (style || "").toLowerCase();
  if (/\b3d\b|3dcg/.test(s)) return "3d render, 3dcg, stylized 3d character";
  if (/\b2d\b|cartoon|мульт/.test(s)) return "2d illustration, flat colors, clean lineart";
  if (/semi|полуреал/.test(s)) return "semi-realistic, detailed digital painting";
  if (/anime|аниме/.test(s)) return "anime style, anime illustration";
  if (/real|реал|photo/.test(s)) return "photorealistic";
  switch (generationStyle) {
    case "mistoon": return "anime style, anime illustration";
    case "wai-ill": return "semi-realistic, detailed digital painting";
    case "furry": return "2d illustration, flat colors, clean lineart";
    case "2d": return "2d illustration, flat colors, clean lineart";
    case "3d": return "3d render, 3dcg, stylized 3d character";
    default: return "photorealistic";
  }
}
