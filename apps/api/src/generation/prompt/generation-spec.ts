/**
 * @file generation-spec.ts
 * @description Спецификация генерации — единый формат запроса на изображение/видео
 * для сайта, Telegram и роутера намерений. Промпт по ней собирает сервер
 * (PromptComposer), а не браузер.
 *
 * Опции из БД (стили, расы, наряды, позы, локации, кадр…) задаются ссылками:
 * каноническим slug (предпочтительно) или названием опции. Значения из
 * фиксированных списков (цвет глаз, объектив, погода…) — их названиями.
 */

import { BadRequestException } from "@nestjs/common";

/** Внешность конструктора персонажа (страница генерации). */
export interface CharacterSelectionsSpec {
  style?: string;
  gender?: string;
  age?: string | number;
  humanRace?: string;
  fantasyRace?: string;
  eyeColor?: string;
  eyeFeatures?: string[];
  faceFeatures?: string[];
  hairColor?: string;
  hairLength?: string;
  hairStyle?: string;
  bodyType?: string;
  breastSize?: string;
  buttSize?: string;
  height?: string;
}

export interface GenerationSpec {
  kind: "image" | "video";
  /**
   * Профиль сборки промпта:
   * - studio (по умолчанию) — страница генерации: quality-префикс + все секции;
   * - chat — фото персонажа в чате: промпт внешности персонажа + выбранные детали.
   */
  preset?: "studio" | "chat";
  /** Модель, выбранная пользователем (для готового персонажа берётся его чекпоинт). */
  model?: string;
  aspectRatio?: string;
  count?: number;
  contentMode?: "nsfw" | "sfw";
  /** Готовый персонаж: его внешность (avatarPrompt), чекпоинт и стиль. */
  characterId?: string;
  character?: CharacterSelectionsSpec;
  appearance?: { outfits?: string[]; outfitDetails?: string[]; condition?: string[] };
  pose?: { facialExpressions?: string[]; poses?: string[] };
  scene?: {
    locations?: string[];
    timeOfDay?: string[];
    weather?: string[];
    particles?: string[];
    environmentEffects?: string[];
    props?: string;
  };
  camera?: { framing?: string[]; cameraAngle?: string[]; lens?: string[]; lighting?: string[] };
  /** Свободный текст пользователя (добавляется в конец промпта). */
  userText?: string;
  /** Термины negative prompt, выбранные пользователем. */
  negativeTerms?: string[];
  /** Только для видео: режим и исходные медиа. */
  video?: { mode?: "scratch" | "img2vid" | "continue"; initImageKey?: string; initVideoKey?: string };
}

const MAX_LIST = 30;
const MAX_STRING = 2000;

function fail(path: string, message: string): never {
  throw new BadRequestException({ error: "INVALID_GENERATION_SPEC", path, message });
}

function str(v: unknown, path: string, max = 200): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") fail(path, "must be a string");
  if (v.length > max) fail(path, `must be at most ${max} characters`);
  return v;
}

function strList(v: unknown, path: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) fail(path, "must be an array of strings");
  if (v.length > MAX_LIST) fail(path, `must contain at most ${MAX_LIST} items`);
  return v.map((item, i) => str(item, `${path}[${i}]`) ?? "").filter(Boolean);
}

function obj(v: unknown, path: string): Record<string, unknown> | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) fail(path, "must be an object");
  return v as Record<string, unknown>;
}

function oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T | undefined {
  const s = str(v, path);
  if (s === undefined) return undefined;
  if (!allowed.includes(s as T)) fail(path, `must be one of: ${allowed.join(", ")}`);
  return s as T;
}

/** Удаляет undefined-поля (и пустые вложенные объекты), чтобы спецификации сравнивались детерминированно. */
function compact<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

/**
 * Проверяет и нормализует спецификацию из внешнего ввода (HTTP, роутер намерений).
 * Лишние поля отбрасываются; некорректные — 400 INVALID_GENERATION_SPEC.
 */
export function parseGenerationSpec(raw: unknown): GenerationSpec {
  const src = obj(raw, "spec") ?? fail("spec", "is required");
  const kind = oneOf(src.kind, "kind", ["image", "video"] as const) ?? fail("kind", "is required");

  const count = src.count === undefined || src.count === null ? undefined : Number(src.count);
  if (count !== undefined && ![1, 4, 8, 16].includes(count)) fail("count", "must be one of 1, 4, 8, 16");

  const character = obj(src.character, "character");
  const appearance = obj(src.appearance, "appearance");
  const pose = obj(src.pose, "pose");
  const scene = obj(src.scene, "scene");
  const camera = obj(src.camera, "camera");
  const video = obj(src.video, "video");

  let age: string | number | undefined;
  if (character?.age !== undefined && character.age !== null && character.age !== "") {
    if (typeof character.age === "number" && Number.isFinite(character.age)) age = character.age;
    else age = str(character.age, "character.age", 10);
  }

  return compact({
    kind,
    preset: oneOf(src.preset, "preset", ["studio", "chat"] as const),
    model: str(src.model, "model"),
    aspectRatio: oneOf(src.aspectRatio, "aspectRatio", ["1:1", "4:5", "5:4", "9:16", "16:9"] as const),
    count,
    contentMode: oneOf(src.contentMode, "contentMode", ["nsfw", "sfw"] as const),
    characterId: str(src.characterId, "characterId", 64),
    character: character
      ? compact({
          style: str(character.style, "character.style"),
          gender: str(character.gender, "character.gender"),
          age,
          humanRace: str(character.humanRace, "character.humanRace"),
          fantasyRace: str(character.fantasyRace, "character.fantasyRace"),
          eyeColor: str(character.eyeColor, "character.eyeColor"),
          eyeFeatures: strList(character.eyeFeatures, "character.eyeFeatures"),
          faceFeatures: strList(character.faceFeatures, "character.faceFeatures"),
          hairColor: str(character.hairColor, "character.hairColor"),
          hairLength: str(character.hairLength, "character.hairLength"),
          hairStyle: str(character.hairStyle, "character.hairStyle"),
          bodyType: str(character.bodyType, "character.bodyType"),
          breastSize: str(character.breastSize, "character.breastSize"),
          buttSize: str(character.buttSize, "character.buttSize"),
          height: str(character.height, "character.height"),
        })
      : undefined,
    appearance: appearance
      ? compact({
          outfits: strList(appearance.outfits, "appearance.outfits"),
          outfitDetails: strList(appearance.outfitDetails, "appearance.outfitDetails"),
          condition: strList(appearance.condition, "appearance.condition"),
        })
      : undefined,
    pose: pose
      ? compact({
          facialExpressions: strList(pose.facialExpressions, "pose.facialExpressions"),
          poses: strList(pose.poses, "pose.poses"),
        })
      : undefined,
    scene: scene
      ? compact({
          locations: strList(scene.locations, "scene.locations"),
          timeOfDay: strList(scene.timeOfDay, "scene.timeOfDay"),
          weather: strList(scene.weather, "scene.weather"),
          particles: strList(scene.particles, "scene.particles"),
          environmentEffects: strList(scene.environmentEffects, "scene.environmentEffects"),
          props: str(scene.props, "scene.props", 500),
        })
      : undefined,
    camera: camera
      ? compact({
          framing: strList(camera.framing, "camera.framing"),
          cameraAngle: strList(camera.cameraAngle, "camera.cameraAngle"),
          lens: strList(camera.lens, "camera.lens"),
          lighting: strList(camera.lighting, "camera.lighting"),
        })
      : undefined,
    userText: str(src.userText, "userText", MAX_STRING),
    negativeTerms: strList(src.negativeTerms, "negativeTerms"),
    video: video
      ? compact({
          mode: oneOf(video.mode, "video.mode", ["scratch", "img2vid", "continue"] as const),
          initImageKey: str(video.initImageKey, "video.initImageKey", 500),
          initVideoKey: str(video.initVideoKey, "video.initVideoKey", 500),
        })
      : undefined,
  });
}
