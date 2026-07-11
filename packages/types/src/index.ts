/**
 * @file index.ts
 * @description Общие TypeScript-типы и небольшие runtime-константы, используемые
 * во всех сервисах монорепозитория.
 *
 * Пакет `@repo/types` импортируется в api, ai, web для обмена контрактами без
 * дублирования. В основном это type-импорты, но также экспортирует несколько
 * общих runtime-констант (см. ниже) — единый источник, чтобы значения не
 * расходились между сервисами.
 */

/**
 * Стандартный ответ health-check эндпоинта.
 *
 * Каждый сервис реализует GET /health и возвращает этот тип.
 * Используется orchestration-системами (Docker healthcheck, Kubernetes readiness probe)
 * для определения готовности сервиса.
 *
 * @example
 * // GET /health → { ok: true, service: "api" }
 * // GET /health → { ok: true, service: "ai" }
 */
export type HealthResponse = { ok: boolean; service: string };

// ─── Глобальные промпт-дефолты генерации ─────────────────────────────────────
// Единый источник для apps/ai (применение при генерации), apps/api (показ
// дефолта в админке, когда ключа AppSetting ещё нет) и сид-скриптов. Значения
// редактируются в админке через настройки NSFW_PROMPT_TAGS / NEGATIVE_PROMPT.

/** Дефолтные позитивные теги: NSFW + базовое качество. */
export const DEFAULT_NSFW_PROMPT_TAGS =
  "nsfw, explicit, masterpiece, best quality, highres";

/**
 * Дефолтный обязательный negative_prompt — защита от типовых артефактов
 * диффузионных моделей (кривые руки/пальцы, лишние конечности, лишние люди,
 * низкое качество) + возрастной safety-guard. Собран по практикам SD-гайдов.
 * Формат весов (term:1.x) понимают ModelsLab/Civitai/SD; провайдеры без весов
 * трактуют как обычный текст — не критично.
 */
export const DEFAULT_NEGATIVE_PROMPT = [
  "(worst quality, low quality, normal quality, lowres:1.4), blurry, out of focus, jpeg artifacts, grainy, watermark, signature, text, logo, username, error, cropped, out of frame",
  "bad anatomy, wrong anatomy, deformed, disfigured, mutation, mutated, malformed",
  "(bad hands, bad fingers, extra fingers, fused fingers, too many fingers, missing fingers, extra digit, fewer digits, mutated hands, malformed hands, poorly drawn hands:1.3)",
  "extra arms, missing arms, extra hands, extra limbs, missing limbs, extra legs, missing legs, fused limbs, malformed limbs, disconnected limbs, long neck, long body",
  "(poorly drawn face, distorted face, asymmetric eyes, cross-eyed, extra eyes, deformed eyes, closed eyes:1.1)",
  "(extra people, multiple people, crowd, duplicate, cloned face, two heads, twins:1.3)",
  "(child, kid, toddler, infant, underage, loli, shota:1.5)",
].join(", ");
