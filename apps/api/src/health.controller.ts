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
import { loadEnv } from "@repo/config";

const env = loadEnv();

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
  @Get("/debug/env")
  async debugEnv() {
    const apiEnv = {
      S3_ENDPOINT: env.S3_ENDPOINT || "(not set)",
      S3_PUBLIC_URL: (env as any).S3_PUBLIC_URL || "(not set)",
      S3_REGION: env.S3_REGION || "(not set)",
      S3_BUCKET: env.S3_BUCKET || "(not set)",
      S3_ACCESS_KEY: env.S3_ACCESS_KEY ? `${env.S3_ACCESS_KEY.slice(0, 3)}***` : "(not set)",
      S3_SECRET_KEY: env.S3_SECRET_KEY ? "***set***" : "(not set)",
    };

    let aiEnv = null;
    try {
      const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;
      const res = await fetch(`${AI_BASE}/ai/debug/env`);
      if (res.ok) aiEnv = await res.json();
    } catch {}

    return { api: apiEnv, ai: aiEnv };
  }

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
