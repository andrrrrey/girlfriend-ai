/**
 * @file prompt-composer.ts
 * @description Серверная сборка промпта генерации по спецификации (GenerationSpec).
 *
 * Перенос buildCompositePrompt (apps/web/app/generation/page.tsx) и
 * buildCharacterImagePrompt (apps/web/lib/prompt.ts) один к одному: порядок секций,
 * словари объективов/света/погоды и правила тегов совпадают, поэтому одна и та же
 * команда даёт идентичный промпт на сайте, в Telegram и через внутренний API.
 *
 * Функции чистые: каталог опций передаётся аргументом (его загружает
 * OptionCatalogService), что позволяет проверять сборку тестами без БД.
 */

import { slugify } from "./slug";
import { toEnglishTag } from "./option-tags";
import type { CharacterSelectionsSpec, GenerationSpec } from "./generation-spec";

/** Опция генерации из каталога. */
export interface CatalogOption {
  id: string;
  slug: string;
  name: string;
  prompt: string | null;
  synonyms: string[];
  nsfw: boolean;
  /** Только у CharacterOption: категория и стиль Civitai. */
  category?: string;
  generationStyle?: string | null;
}

/** Каталог опций, сгруппированный как на фронте (порядок — как в пикерах). */
export interface OptionCatalog {
  /** CharacterOption: STYLE | HUMAN_RACE | FANTASY_RACE | HAIR_STYLE | BODY_TYPE | BREAST_SIZE | BUTT_SIZE */
  character: CatalogOption[];
  appearance: { OUTFITS: CatalogOption[]; OUTFIT_DETAILS: CatalogOption[] };
  pose: { FACIAL_EXPRESSION: CatalogOption[]; POSE: CatalogOption[] };
  scene: { LOCATION: CatalogOption[] };
  camera: { FRAMING: CatalogOption[]; CAMERA_ANGLE: CatalogOption[] };
}

export const LENS_PROMPTS: Record<string, string> = {
  "Ultra-wide 14mm": "14mm ultra-wide lens, heavy barrel distortion",
  "Wide 24mm": "24mm wide angle lens",
  "Standard 35mm": "35mm lens, street photography natural perspective",
  "Normal 50mm": "50mm lens, natural human eye perspective",
  "Portrait 85mm": "85mm portrait lens, soft background bokeh, flattering compression",
  "Telephoto 135mm": "135mm telephoto lens, compressed perspective, creamy bokeh",
  "Fisheye": "fisheye lens, 180-degree spherical distortion",
};

export const LIGHTING_PROMPTS: Record<string, string> = {
  "Natural Light": "natural lighting",
  "Golden Hour": "golden hour warm light",
  "Soft Diffused": "soft diffused lighting, minimal shadows",
  "Hard Directional": "hard directional light, sharp shadows",
  "Studio Softbox": "studio softbox lighting, even professional light",
  "Backlight": "backlight, silhouette, halo effect",
  "High Key": "high-key lighting, bright airy minimal shadows",
  "Neon": "neon lighting, pink blue green neon colors",
  "Candlelight": "candlelight, warm flickering glow",
  "Moonlight": "moonlight, cold silver light from moon",
  "Spotlight": "spotlight, single bright directed beam",
  "Window Light": "window light, soft directional natural",
  "Ultraviolet": "UV black light, neon glowing colors fluorescent",
};

export const TIME_PROMPTS: Record<string, string> = {
  "Sunrise": "dawn lighting, soft pink orange and lavender gradient on horizon, sun just beginning to rise",
  "Morning": "morning light, warm soft golden-white rays from a low angle, clean fresh atmosphere",
  "Daylight": "moderate afternoon daylight, well-balanced natural illumination",
  "Strong Sun": "high noon midday lighting, sun directly overhead, bright intense illumination, harsh shadows",
  "Golden Hour": "evening golden hour, rich deep warm golden-orange light streaming horizontally",
  "Sunset": "dramatic sunset sky, vivid bands of intense orange red pink and purple coloring clouds",
  "Night": "full nighttime darkness, scene illuminated by artificial light sources, deep shadows",
  "Moonlight": "moonlit night, bright full moon casting silver-blue cool-toned moonlight, ethereal luminosity",
};

export const WEATHER_PROMPTS: Record<string, string> = {
  "Clear sky": "perfectly clear cloudless sky, crisp defined shadows",
  "Overcast": "completely overcast sky, soft even diffused light",
  "Light rain": "light gentle rain, fine small raindrops, wet sheen on surfaces",
  "Heavy rain": "heavy torrential downpour, thick sheets of rain, reduced visibility",
  "Thunderstorm": "dramatic thunderstorm, dark storm clouds, lightning bolts, heavy rain",
  "Light snow": "gentle light snowfall, delicate white snowflakes drifting slowly, peaceful winter atmosphere",
  "Blizzard": "intense raging blizzard, dense snow driven by powerful winds, severely reduced visibility",
  "Fog": "thick atmospheric fog reducing visibility, objects fading into white-grey mist",
  "Strong wind": "strong powerful wind, hair streaming and whipping dramatically, clothing billowing",
  "Rainbow": "vivid colorful rainbow arcing across sky, full spectrum of colors",
  "Aurora / Northern lights": "spectacular aurora borealis dancing across dark sky in curtains of vivid green with purple and pink edges",
  "Heat": "scorching intense heat, visible heat haze distortion shimmering above surfaces",
  "Frost": "bitter cold frost, intricate ice crystal patterns, white frost coating surfaces, visible breath",
};

export const PARTICLE_PROMPTS: Record<string, string> = {
  "Sakura petals": "delicate pink and white cherry blossom petals floating and drifting through air",
  "Falling leaves": "colorful autumn leaves gently falling and tumbling through the air",
  "Fireflies": "tiny warm glowing fireflies floating in the air, bioluminescent dots",
  "Flying sparks": "glowing orange embers and sparks floating upward in the air",
  "Magic sparkles": "magical glowing sparkle particles floating in the air, shimmering light motes",
  "Dust in light": "visible dust particles floating in beams of light, atmospheric haze",
  "Soap bubbles": "iridescent soap bubbles floating weightlessly in the air, rainbow reflections",
  "Ash": "grey ash particles drifting slowly through the air",
  "Confetti": "colorful confetti pieces falling and fluttering through the air",
  "Falling feathers": "soft white feathers gently drifting downward through the air",
};

const GENDER_PROMPTS: Record<string, string> = {
  Female: "woman", Male: "man", Femboy: "femboy, feminine male", "Non-binary": "androgynous person",
};

const HEIGHT_PROMPTS: Record<string, string> = {
  Short: "short height", "Below Average": "below average height", Average: "average height",
  Tall: "tall height", "Very Tall": "very tall height",
};

/**
 * Находит опцию по ссылке: slug → название → slug названия → синоним.
 * Первое совпадение в порядке каталога — как find по имени на фронте.
 */
export function resolveOption(options: CatalogOption[], ref: string | null | undefined): CatalogOption | undefined {
  if (!ref) return undefined;
  const bySlug = options.find((o) => o.slug === ref);
  if (bySlug) return bySlug;
  const byName = options.find((o) => o.name === ref);
  if (byName) return byName;
  const refSlug = slugify(ref);
  if (!refSlug) return undefined;
  return (
    options.find((o) => slugify(o.name) === refSlug) ??
    options.find((o) => o.synonyms.some((s) => slugify(s) === refSlug))
  );
}

/** Промпт опции по ссылке (null — опции нет или у неё нет промпта). */
function optionPrompt(options: CatalogOption[], ref: string): string | null {
  return resolveOption(options, ref)?.prompt ?? null;
}

/** Опции персонажа одной категории. */
function charOptions(catalog: OptionCatalog, category: string): CatalogOption[] {
  return catalog.character.filter((o) => o.category === category);
}

/** NSFW-модель: добавляет теги nsfw/explicit (как на фронте). */
export function isNsfwModel(model: string | undefined): boolean {
  const m = model || "";
  return m.toLowerCase().includes("nsfw") || m.includes("wan-2.6") || m.includes("van-2.6");
}

/** Промпт-секции выбранных деталей (без quality/subject), в порядке фронта. */
interface Sections {
  quality: string[];
  subject: string[];
  face: string[];
  hair: string[];
  body: string[];
  expression: string[];
  clothing: string[];
  pose: string[];
  scene: string[];
  camera: string[];
}

function buildSections(spec: GenerationSpec, catalog: OptionCatalog): Sections {
  const c: CharacterSelectionsSpec = spec.character ?? {};

  // --- 1. Quality / Style prefix ---
  const quality: string[] = ["masterpiece", "best quality", "highres"];
  if (isNsfwModel(spec.model)) quality.push("nsfw", "explicit");
  if (c.style) {
    const p = optionPrompt(charOptions(catalog, "STYLE"), c.style);
    if (p) quality.push(p);
  }

  // --- 2. Subject: gender + age + ethnicity ---
  const subject: string[] = [];
  if (c.gender) subject.push(GENDER_PROMPTS[c.gender] || toEnglishTag(c.gender));
  if (c.age) subject.push(`${c.age}-year-old`);
  if (c.humanRace) {
    const p = optionPrompt(charOptions(catalog, "HUMAN_RACE"), c.humanRace);
    if (p) subject.push(p);
  }
  if (c.fantasyRace) {
    const p = optionPrompt(charOptions(catalog, "FANTASY_RACE"), c.fantasyRace);
    if (p) subject.push(p);
  }

  // --- 3. Face: eye color + eye features + face features ---
  const face: string[] = [];
  if (c.eyeColor) face.push(`${toEnglishTag(c.eyeColor)} eyes`);
  for (const f of c.eyeFeatures ?? []) if (f !== "Normal") face.push(toEnglishTag(f));
  for (const f of c.faceFeatures ?? []) if (f !== "None") face.push(toEnglishTag(f));

  // --- 4. Hair: color + length + style ---
  const hair: string[] = [];
  if (c.hairColor) hair.push(`${toEnglishTag(c.hairColor)} hair`);
  if (c.hairLength) hair.push(`${toEnglishTag(c.hairLength)} hair`);
  if (c.hairStyle) {
    const p = optionPrompt(charOptions(catalog, "HAIR_STYLE"), c.hairStyle);
    if (p) hair.push(p);
  }

  // --- 5. Body: body type + breast + butt + height ---
  const body: string[] = [];
  if (c.bodyType) {
    const p = optionPrompt(charOptions(catalog, "BODY_TYPE"), c.bodyType);
    if (p) body.push(p);
  }
  if (c.breastSize) {
    const p = optionPrompt(charOptions(catalog, "BREAST_SIZE"), c.breastSize);
    body.push(p || `${toEnglishTag(c.breastSize)} breasts`);
  }
  if (c.buttSize) {
    const p = optionPrompt(charOptions(catalog, "BUTT_SIZE"), c.buttSize);
    body.push(p || `${toEnglishTag(c.buttSize)} butt`);
  }
  if (c.height) body.push(HEIGHT_PROMPTS[c.height] || toEnglishTag(c.height));

  // --- 6. Expression ---
  const expression: string[] = [];
  for (const ref of spec.pose?.facialExpressions ?? []) {
    const p = optionPrompt(catalog.pose.FACIAL_EXPRESSION, ref);
    if (p) expression.push(p);
  }

  // --- 7. Clothing (outfits + outfit details + condition) ---
  const clothing: string[] = [];
  const appearanceOpts = [...catalog.appearance.OUTFITS, ...catalog.appearance.OUTFIT_DETAILS];
  for (const ref of [...(spec.appearance?.outfits ?? []), ...(spec.appearance?.outfitDetails ?? [])]) {
    const p = optionPrompt(appearanceOpts, ref);
    if (p) clothing.push(p);
  }
  for (const cond of spec.appearance?.condition ?? []) clothing.push(toEnglishTag(cond));

  // --- 8. Pose ---
  const pose: string[] = [];
  for (const ref of spec.pose?.poses ?? []) {
    const p = optionPrompt(catalog.pose.POSE, ref);
    if (p) pose.push(p);
  }

  // --- 9. Scene: location + time of day + weather + particles + effects + props ---
  const scene: string[] = [];
  for (const ref of spec.scene?.locations ?? []) {
    const p = optionPrompt(catalog.scene.LOCATION, ref);
    if (p) scene.push(p);
  }
  for (const t of spec.scene?.timeOfDay ?? []) scene.push(TIME_PROMPTS[t] || toEnglishTag(t));
  for (const w of spec.scene?.weather ?? []) scene.push(WEATHER_PROMPTS[w] || toEnglishTag(w));
  for (const p of spec.scene?.particles ?? []) scene.push(PARTICLE_PROMPTS[p] || toEnglishTag(p));
  for (const e of spec.scene?.environmentEffects ?? []) scene.push(toEnglishTag(e));
  if (spec.scene?.props?.trim()) scene.push(spec.scene.props.trim());

  // --- 10. Camera: framing + angle + lens + lighting ---
  const camera: string[] = [];
  for (const ref of spec.camera?.framing ?? []) {
    const p = optionPrompt(catalog.camera.FRAMING, ref);
    if (p) camera.push(p);
  }
  for (const ref of spec.camera?.cameraAngle ?? []) {
    const p = optionPrompt(catalog.camera.CAMERA_ANGLE, ref);
    if (p) camera.push(p);
  }
  for (const l of spec.camera?.lens ?? []) camera.push(LENS_PROMPTS[l] || toEnglishTag(l));
  for (const l of spec.camera?.lighting ?? []) camera.push(LIGHTING_PROMPTS[l] || toEnglishTag(l));

  return { quality, subject, face, hair, body, expression, clothing, pose, scene, camera };
}

/**
 * Промпт страницы генерации (buildCompositePrompt): quality-префикс, внешность
 * конструктора, выражение, одежда, поза, сцена, кадр и текст пользователя.
 */
export function composeStudioPrompt(spec: GenerationSpec, catalog: OptionCatalog): string {
  const s = buildSections(spec, catalog);
  return [
    s.quality.join(", "),
    s.subject.join(", "),
    s.face.join(", "),
    s.hair.join(", "),
    s.body.join(", "),
    s.expression.join(", "),
    s.clothing.join(", "),
    s.pose.join(", "),
    s.scene.join(", "),
    s.camera.join(", "),
    (spec.userText ?? "").trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Хвост фото персонажа в чате: выбранные детали (выражение, одежда, поза, сцена,
 * кадр) и текст — каждая часть через toEnglishTag, как buildChatImagePrompt.
 */
export function composeChatExtra(spec: GenerationSpec, catalog: OptionCatalog): string {
  const s = buildSections(spec, catalog);
  return [...s.expression, ...s.clothing, ...s.pose, ...s.scene, ...s.camera, (spec.userText ?? "").trim()]
    .filter(Boolean)
    .map((part) => toEnglishTag(part))
    .filter(Boolean)
    .join(", ");
}

/**
 * Промпт внешности готового персонажа (buildCharacterImagePrompt).
 * Если сохранён промпт аватара (avatarPrompt) — он и есть база; иначе
 * пересборка из атрибутов personality. extra добавляется в конец.
 */
export function buildCharacterImagePrompt(personality: Record<string, unknown>, extra?: string): string {
  const savedPrompt = typeof personality.avatarPrompt === "string" ? personality.avatarPrompt.trim() : "";
  if (savedPrompt) {
    return [savedPrompt, extra?.trim()].filter(Boolean).join(", ");
  }

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
