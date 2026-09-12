/**
 * @file random-engagement.ts
 * @description Сборка случайного промпта для автогенерации контента персонажа.
 *
 * База-идентичность берётся из personality.avatarPrompt (тот же источник, что чат
 * и gentest), к ней добавляются случайные фрагменты опций по осям: одежда, поза/
 * мимика, локация, кадрирование/ракурс. Это даёт разнообразный, но узнаваемый
 * контент. Quality/NSFW-теги добавит AI-сервис.
 */

import { PrismaService } from "../../prisma.service";

/** Случайный элемент массива (или undefined для пустого). */
function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

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

/**
 * Собирает случайный промпт: база персонажа + по одному случайному фрагменту из
 * каждой оси (одежда/поза/локация/камера). При SFW-режиме исключает nsfw-опции.
 */
export async function buildRandomEngagementPrompt(
  prisma: PrismaService,
  basePrompt: string,
  contentMode: "nsfw" | "sfw",
): Promise<string> {
  // При SFW-режиме исключаем nsfw-опции; иначе берём любые с непустым промптом.
  const nsfwWhere: { nsfw?: boolean } = contentMode === "sfw" ? { nsfw: false } : {};

  const [appearance, pose, scene, camera] = await Promise.all([
    prisma.appearanceOption.findMany({ where: { prompt: { not: null }, ...nsfwWhere }, select: { prompt: true } }),
    prisma.poseOption.findMany({ where: { prompt: { not: null }, ...nsfwWhere }, select: { prompt: true } }),
    prisma.sceneOption.findMany({ where: { prompt: { not: null }, ...nsfwWhere }, select: { prompt: true } }),
    prisma.cameraOption.findMany({ where: { prompt: { not: null }, ...nsfwWhere }, select: { prompt: true } }),
  ]);

  const fragments = [
    pick(appearance)?.prompt,
    pick(pose)?.prompt,
    pick(scene)?.prompt,
    pick(camera)?.prompt,
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);

  return [basePrompt, ...fragments].filter(Boolean).join(", ");
}
