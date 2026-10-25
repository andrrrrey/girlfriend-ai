/**
 * @file catalog.fixture.ts
 * @description Тестовый каталог опций для спецификаций сборки промпта и роутера намерений.
 */

import type { CatalogOption, OptionCatalog } from "./prompt-composer";
import { slugify } from "./slug";

function opt(name: string, prompt: string | null, extra: Partial<CatalogOption> = {}): CatalogOption {
  return { id: name, slug: slugify(name), name, prompt, synonyms: [], nsfw: false, ...extra };
}

export const CATALOG: OptionCatalog = {
  character: [
    opt("Realistic", "photorealistic, raw photo", { category: "STYLE", generationStyle: "realism" }),
    opt("Европейская", "caucasian", { category: "HUMAN_RACE" }),
    opt("Curvy", "curvy body", { category: "BODY_TYPE" }),
  ],
  appearance: { OUTFITS: [opt("Bikini", "red bikini", { synonyms: ["купальник"] })], OUTFIT_DETAILS: [] },
  pose: {
    FACIAL_EXPRESSION: [opt("Smile", "smiling")],
    POSE: [opt("img_hand_on_hip", "Hand On Hip, Full-Body")],
  },
  scene: { LOCATION: [opt("Beach", "on a sunny beach")] },
  camera: { FRAMING: [opt("Close-up", "close-up shot")], CAMERA_ANGLE: [] },
};
