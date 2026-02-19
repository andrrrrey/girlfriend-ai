/**
 * @file internal.module.ts
 * @description NestJS-модуль внутренних API-эндпоинтов для межсервисной коммуникации.
 *
 * Назначение:
 * - Предоставляет эндпоинты /internal/* для Worker и AI-сервиса
 * - Эндпоинты не защищены JWT (нет JwtAuthGuard) — только сетевая изоляция Docker
 * - Используется Worker (apps/worker) для обновления статусов AiJob и логирования
 *
 * БЕЗОПАСНОСТЬ:
 * - В продакшене эти эндпоинты должны быть недоступны извне Docker-сети
 * - Изоляция обеспечивается через Docker network (internal network, не expose в docker-compose)
 *
 * Зависимости:
 * - PrismaService — для прямого доступа к БД из InternalController
 * - InternalController — обрабатывает все /internal/* маршруты
 */

import { Module } from "@nestjs/common";
import { InternalController } from "./internal.controller";
import { PrismaService } from "../prisma.service";

/**
 * Модуль внутренних эндпоинтов.
 * Регистрирует InternalController без экспортов — модуль используется только внутри API.
 */
@Module({
  controllers: [InternalController],
  providers: [PrismaService],
})
export class InternalModule {}
