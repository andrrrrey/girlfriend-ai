/**
 * @file autogen.module.ts
 * @description Модуль фоновой автогенерации персонажей (админка).
 *
 * Переиспользует:
 * - CharactersService (ChatsModule) — создание персонажа тем же пайплайном, что /create
 * - GenerationService (GenerationModule) — постановка image-job в очередь + статус
 */

import { Module } from "@nestjs/common";
import { AutogenController } from "./autogen.controller";
import { AutogenService } from "./autogen.service";
import { PrismaService } from "../../prisma.service";
import { ChatsModule } from "../../chats/chats.module";
import { GenerationModule } from "../../generation/generation.module";

@Module({
  imports: [ChatsModule, GenerationModule],
  controllers: [AutogenController],
  providers: [AutogenService, PrismaService],
})
export class AutogenModule {}
