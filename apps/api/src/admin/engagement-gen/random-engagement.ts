/**
 * @file random-engagement.ts
 * @description Сборка случайного промпта для автогенерации контента персонажа.
 *
 * База-идентичность берётся из personality.avatarPrompt (тот же источник, что чат
 * и gentest), к ней добавляются случайные фрагменты опций по осям: одежда, поза/
 * мимика, локация, кадрирование/ракурс. Это даёт разнообразный, но узнаваемый
 * контент. Quality/NSFW-теги добавит AI-сервис.
 */

import { isUnsafeForSoloAvatar } from "@repo/types";
import type { GenerationService } from "../../generation/generation.service";
import { pickRandomScenePrompts } from "../autogen/random-pools";

/**
 * База-идентичность персонажа для промпта. Приоритет — сохранённый avatarPrompt.
 * Фолбэк — минимальная сборка из атрибутов personality. Зеркалит
 * GentestService.buildBasePrompt.
 */
export function buildBasePrompt(personality: Record<string, unknown>, name: string): string {
  const saved = typeof personality.avatarPrompt === "string" ? personality.avatarPrompt.trim() : "";
  if (saved) return saved;
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
  };
  push(personality.gender);
  if (personality.age) parts.push(`${personality.age}-year-old`);
  push(personality.ethnicity || personality.nationality);
  if (personality.eyeColor) parts.push(`${personality.eyeColor} eyes`);
  if (personality.hairColor) parts.push(`${personality.hairColor} hair`);
  push(personality.hairStyle);
  push(personality.bodyType);
  return parts.length ? parts.join(", ") : name;
}

/** Промпты опций категорий без опций на двоих+ и с чужими телами/без лица в кадре. */
function soloPrompts(cats: { options: { prompt?: string | null }[] }[]): string[] {
  return soloOptionPrompts(cats.flatMap((c) => c.options));
}

function soloOptionPrompts(opts: { prompt?: string | null }[]): string[] {
  return opts
    .map((o) => o.prompt?.trim())
    .filter((p): p is string => !!p && !isUnsafeForSoloAvatar(p));
}

/**
 * Собирает случайный промпт: база персонажа + одежда, выражение, поза, локация,
 * кадр — по тем же правилам, что аватар в create/автогенерации:
 *  - без поз на двоих+ и с чужими руками/ногами/людьми (spitroast и т.п.);
 *  - локация фоном одной фразой и только если поза не задаёт свою обстановку;
 *  - кадр — только FRAMING с лицом (ракурсы вроде «отражение в зеркале»,
 *    dutch angle и детальные планы не берём: модель рисовала обстановку без
 *    человека или лицо в зеркале).
 * В SFW-режиме геттеры отдают только nsfw=false опции.
 */
export async function buildRandomEngagementPrompt(
  generation: GenerationService,
  basePrompt: string,
  contentMode: "nsfw" | "sfw",
): Promise<string> {
  const [appearance, pose, scene, camera] = await Promise.all([
    generation.getAppearanceOptions(contentMode),
    generation.getPoseOptions(contentMode),
    generation.getSceneOptions(contentMode),
    generation.getCameraOptions(contentMode),
  ]);

  const fragments = pickRandomScenePrompts({
    outfits: soloPrompts(appearance.OUTFITS),
    expressions: soloPrompts(pose.FACIAL_EXPRESSION),
    poses: soloPrompts(pose.POSE),
    locations: soloPrompts(scene.LOCATION),
    framings: soloOptionPrompts(camera.FRAMING),
  });

  return [basePrompt, ...fragments].filter(Boolean).join(", ");
}
