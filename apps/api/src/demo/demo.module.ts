/**
 * @file demo.module.ts
 * @description NestJS-модуль для управления демо-лимитами бесплатных пользователей.
 *
 * DemoModule предоставляет DemoService, который отслеживает суточные лимиты
 * использования для пользователей на тарифе "free":
 * - 20 сообщений в чате в день (DEMO_LIMITS.chat_message)
 * - Голосовые функции (STT/TTS) полностью заблокированы
 *
 * Модуль не имеет контроллеров — DemoService используется напрямую
 * из ChatsModule через импорт DemoModule.
 */

import { Module } from "@nestjs/common";
import { DemoService } from "./demo.service";
import { PrismaService } from "../prisma.service";

@Module({
  providers: [
    DemoService,   // Бизнес-логика демо-лимитов: checkVoiceAllowed, checkAndIncrementMessage
    PrismaService, // Доступ к таблице UsageCounter
  ],
  exports: [DemoService], // Экспортируется для использования в ChatsModule
})
export class DemoModule {}
