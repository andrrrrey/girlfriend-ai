/**
 * @file app.module.ts
 * @description Корневой модуль NestJS API-приложения.
 *
 * Объединяет все функциональные модули:
 * - QueueModule      — BullMQ очередь заданий (глобальный, доступен везде)
 * - AuthModule       — регистрация, логин, JWT, refresh-токены
 * - UsersModule      — профиль пользователя, смена пароля, социальные ссылки
 * - AdminModule      — управление персонажами, пользователями, настройками (только admin-роль)
 * - InternalModule   — внутренние эндпоинты для межсервисного взаимодействия (ai, worker)
 * - ChatsModule      — чаты, сообщения, SSE-стриминг, голос, TTS
 * - CleanupModule    — cron-задача удаления неактивных чатов (запускается в 03:00 UTC)
 *
 * PrismaService подключён на уровне корневого модуля и экспортируется для использования
 * в дочерних модулях. Каждый модуль может также подключить собственный PrismaService.
 */

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma.service";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ChatProfilesModule } from "./chat-profiles/chat-profiles.module";
import { AdminModule } from "./admin/admin.module";
import { InternalModule } from "./internal/internal.module";
import { ChatsModule } from "./chats/chats.module";
import { CleanupModule } from "./cleanup/cleanup.module";
import { QueueModule } from "./queue/queue.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { GenerationModule } from "./generation/generation.module";
import { MediaModule } from "./media/media.module";
import { LikesModule } from "./likes/likes.module";
import { CommentsModule } from "./comments/comments.module";
import { ReportsModule } from "./reports/reports.module";
import { BlogModule } from "./blog/blog.module";
import { VoicesModule } from "./voices/voices.module";
import { AutogenModule } from "./admin/autogen/autogen.module";
import { GentestModule } from "./admin/gentest/gentest.module";

@Module({
  imports: [
    // 300 запросов в минуту с одного IP по умолчанию
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    QueueModule,    // Глобальный модуль BullMQ-очереди (регистрирует AI_QUEUE токен)
    AnalyticsModule, // Глобальный модуль серверной аналитики PostHog (no-op без POSTHOG_KEY)
    AuthModule,     // JWT-аутентификация и управление сессиями
    UsersModule,    // Операции с профилем текущего пользователя
    ChatProfilesModule, // Чат-профили (персоны) пользователя
    AdminModule,    // Административные операции (защищены ролью "admin")
    InternalModule, // Внутренние API для ai-сервиса и worker-а (без аутентификации!)
    ChatsModule,      // Чаты, сообщения, SSE, STT, TTS
    GenerationModule, // Генерация изображений (ModelsLab API)
    MediaModule,      // Presigned URL эндпоинты для медиафайлов (R2/S3)
    CleanupModule,    // Фоновая задача: мягкое удаление неактивных чатов
    LikesModule,      // Лайки (полиморфные: персонажи, комментарии, галерея, shorts)
    CommentsModule,   // Комментарии к персонажам
    ReportsModule,    // Жалобы на персонажей
    BlogModule,       // Блог: публичное чтение + админский CRUD записей
    VoicesModule,     // Каталог голосов ElevenLabs: публичный список + админский CRUD
    AutogenModule,    // Фоновая автогенерация персонажей (админка)
    GentestModule,    // Тестовый перебор генераций (админка)
  ],
  controllers: [HealthController], // GET /health — для Docker healthcheck и readiness probe
  providers: [
    PrismaService,                             // Prisma-клиент для подключения к PostgreSQL
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // Глобальный rate-limit guard
  ],
})
export class AppModule {}
