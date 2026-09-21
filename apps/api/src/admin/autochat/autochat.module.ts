/**
 * @file autochat.module.ts
 * @description Модуль автопереписки робота с персонажами (админка, QA-инструмент).
 *
 * Переиспользует ChatsService (ChatsModule) — создание сессий, сохранение
 * сообщений, учёт AiJob/UsageLog как в обычном чате.
 */

import { Module } from "@nestjs/common";
import { AutochatController } from "./autochat.controller";
import { AutochatService } from "./autochat.service";
import { PrismaService } from "../../prisma.service";
import { ChatsModule } from "../../chats/chats.module";

@Module({
  imports: [ChatsModule],
  controllers: [AutochatController],
  providers: [AutochatService, PrismaService],
})
export class AutochatModule {}
