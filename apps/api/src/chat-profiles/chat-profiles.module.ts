/**
 * @file chat-profiles.module.ts
 * @description NestJS-модуль чат-профилей (персон) пользователя.
 *
 * Эндпоинты CRUD под /chat-profiles, защищены JwtAuthGuard.
 * ChatProfilesService экспортируется для использования в ChatsModule
 * (проброс описания профиля в AI при отправке сообщения).
 */

import { Module } from "@nestjs/common";
import { ChatProfilesController } from "./chat-profiles.controller";
import { ChatProfilesService } from "./chat-profiles.service";
import { PrismaService } from "../prisma.service";

@Module({
  controllers: [ChatProfilesController],
  providers: [ChatProfilesService, PrismaService],
  exports: [ChatProfilesService],
})
export class ChatProfilesModule {}
