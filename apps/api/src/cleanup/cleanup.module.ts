/**
 * @file cleanup.module.ts
 * @description NestJS-модуль ежедневной очистки неактивных чатов.
 *
 * CleanupService запускается автоматически при старте AppModule (через onModuleInit)
 * и работает в фоне по расписанию (03:00 UTC ежедневно).
 *
 * Удаляет мягко чаты, неактивные более 7 дней (INACTIVE_DAYS = 7).
 */

import { Module } from "@nestjs/common";
import { CleanupService } from "./cleanup.service";
import { PrismaService } from "../prisma.service";

@Module({
  providers: [
    CleanupService, // Фоновый сервис очистки (запускается через onModuleInit)
    PrismaService,  // Доступ к таблице ChatSession
  ],
  // exports: [] — не экспортируется, внешнего использования не требует
})
export class CleanupModule {}
