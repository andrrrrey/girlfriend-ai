/**
 * @file chats.module.ts
 * @description NestJS-модуль чатов и персонажей.
 *
 * Регистрирует все компоненты для работы с чатами, сообщениями и персонажами:
 *
 * Controllers:
 * - ChatsController — /chats/* (CRUD чатов, отправка/редактирование/голосовые сообщения, SSE)
 * - CharactersController — /characters (список публичных персонажей без авторизации)
 *
 * Providers:
 * - ChatsService — бизнес-логика работы с ChatSession и Message (Prisma ORM)
 * - PrismaService — подключение к БД
 *
 * Imports:
 * - DemoModule — предоставляет DemoService для проверки лимитов бесплатных пользователей
 *   (checkVoiceAllowed и checkAndIncrementMessage вызываются в ChatsController)
 *
 * Зависимости через AppModule:
 * - QueueModule (@Global) — AI_QUEUE для постановки заданий BullMQ
 */

import { Module } from "@nestjs/common";
import { ChatsController } from "./chats.controller";
import { CharactersController } from "./characters.controller";
import { ChatsService } from "./chats.service";
import { PrismaService } from "../prisma.service";
import { DemoModule } from "../demo/demo.module";

@Module({
  imports: [DemoModule], // Для DemoService (проверка лимитов free-пользователей)
  controllers: [ChatsController, CharactersController],
  providers: [ChatsService, PrismaService],
})
export class ChatsModule {}
