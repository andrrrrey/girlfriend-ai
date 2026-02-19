/**
 * @file health.controller.ts
 * @description Health-check эндпоинт NestJS API.
 *
 * GET /health — возвращает статус сервиса.
 * Используется:
 * - Docker Compose `healthcheck` для ожидания готовности контейнера
 * - Kubernetes readiness/liveness probe
 * - Мониторинг (Uptime Robot, Grafana, etc.)
 *
 * Не требует аутентификации (публичный).
 */

import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@repo/types";

/**
 * Контроллер для проверки работоспособности API-сервиса.
 * Маунтится на корневой путь "/" (без префикса).
 */
@Controller()
export class HealthController {
  /**
   * GET /health
   *
   * @returns { ok: true, service: "api" } — если сервис работает
   * Статус 200 означает что NestJS поднят и обрабатывает запросы.
   * Глубокие проверки (БД, Redis) здесь не делаются — для этого нужен @nestjs/terminus.
   */
  @Get("/health")
  health(): HealthResponse {
    return { ok: true, service: "api" };
  }
}
