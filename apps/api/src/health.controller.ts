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

import { Controller, Get, HttpException, HttpStatus, Inject } from "@nestjs/common";
import type { HealthResponse } from "@repo/types";
import { PrismaService } from "./prisma.service";

/**
 * Контроллер для проверки работоспособности API-сервиса.
 * Маунтится на корневой путь "/" (без префикса).
 */
@Controller()
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * GET /health — liveness probe
   * Быстрая проверка: NestJS запущен, маршрутизация работает. БД не проверяется.
   */
  @Get("/health")
  health(): HealthResponse {
    return { ok: true, service: "api" };
  }

  /**
   * GET /ready — readiness probe
   * Проверяет подключение к PostgreSQL. 200 = готов принимать трафик, 503 = не готов.
   * Используется в K8s readinessProbe: если 503, pod убирается из балансировщика.
   */
  @Get("/ready")
  async ready(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, service: "api" };
    } catch {
      throw new HttpException(
        { ok: false, service: "api", error: "database_unavailable" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
