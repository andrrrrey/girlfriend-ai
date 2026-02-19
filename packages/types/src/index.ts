/**
 * @file index.ts
 * @description Общие TypeScript-типы, используемые во всех сервисах монорепозитория.
 *
 * Пакет `@repo/types` импортируется в api, ai, web для обмена контрактами без дублирования.
 * Импортируется только как type-импорт (не попадает в runtime bundle).
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
