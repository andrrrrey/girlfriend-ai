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
 * - ConversationEngine + адаптеры LLM/STT/TTS — единое ядро обработки сообщений
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
import { CharactersService } from "./characters.service";
import { PrismaService } from "../prisma.service";
import { DemoModule } from "../demo/demo.module";
import { S3Module } from "../s3/s3.module";
import { ConversationEngine } from "../conversation/conversation.engine";
import { ContextBuilder } from "../conversation/context-builder";
import { LlmAdapter } from "../conversation/llm.adapter";
import { SttAdapter } from "../conversation/stt.adapter";
import { TtsAdapter } from "../conversation/tts.adapter";
import { IntentRouter } from "../conversation/intent-router";
import { ChatMediaService } from "../conversation/chat-media.service";
import { ChatEventsService } from "./chat-events.service";
import { GenerationModule } from "../generation/generation.module";

@Module({
  imports: [
    DemoModule, // Для DemoService (проверка лимитов free-пользователей)
    S3Module,   // Для S3Service — скачиваем TTS-аудио по ключу через внутренний S3 endpoint
    GenerationModule, // Фото/видео в чате: спецификация, каталог опций, задания генерации
  ],
  controllers: [ChatsController, CharactersController],
  providers: [
    ChatsService,
    CharactersService,
    PrismaService,
    // Единое ядро сообщений (apps/api/src/conversation) — живёт в этом модуле,
    // т.к. зависит от ChatsService, а контроллер чатов — от ядра.
    ConversationEngine,
    ContextBuilder,
    LlmAdapter,
    SttAdapter,
    TtsAdapter,
    IntentRouter,
    ChatMediaService,
    ChatEventsService,
  ],
  // CharactersService — его переиспользует AutogenModule; ChatsService и
  // ConversationEngine — AutochatModule (автопереписка через общее ядро).
  // ChatMediaService/IntentRouter — InternalModule (медиасообщение по завершении генерации, internal API).
  exports: [CharactersService, ChatsService, ConversationEngine, ChatMediaService, IntentRouter],
})
export class ChatsModule {}
