/**
 * @file chats.controller.ts
 * @description NestJS-контроллер для управления чатами и сообщениями.
 * Handles all chat session CRUD and AI-driven messaging routes.
 *
 * Все маршруты защищены JWT-аутентификацией (JwtAuthGuard).
 * Пользователь определяется из JWT-токена через req.user.id.
 *
 * ─── Список маршрутов ────────────────────────────────────────────────────────
 *
 *  Chat CRUD:
 *    POST   /chats                              — Создать новую сессию чата с персонажем
 *    GET    /chats                              — Список чатов пользователя (cursor pagination)
 *    GET    /chats/:id                          — Получить конкретный чат
 *    PATCH  /chats/:id                          — Обновить заголовок чата
 *    DELETE /chats/:id                          — Мягкое удаление чата (soft delete)
 *
 *  Messages:
 *    GET    /chats/:id/messages                 — Список сообщений чата (cursor pagination)
 *    POST   /chats/:id/messages                 — Отправить сообщение → AI-ответ (SSE stream)
 *    DELETE /chats/:id/messages/:msgId          — Мягкое удаление сообщения
 *    PATCH  /chats/:id/messages/:msgId          — Редактировать сообщение + перегенерация AI (SSE)
 *
 *  Voice & TTS:
 *    POST   /chats/:id/voice                    — Голосовое сообщение: аудио → STT → AI-ответ (SSE)
 *    POST   /chats/:id/messages/:msgId/tts      — Генерация TTS для сообщения (ElevenLabs → S3)
 *
 *  Message actions:
 *    POST   /chats/:id/messages/:msgId/copy     — Записать событие копирования сообщения (аудит)
 *    POST   /chats/:id/messages/:msgId/regenerate — Перегенерировать AI-ответ (SSE stream)
 *
 * ─── SSE-формат стриминга ────────────────────────────────────────────────────
 *
 *  Все SSE-эндпоинты возвращают поток в формате text/event-stream:
 *    data: {"content": "..."}\n\n        — фрагмент ответа ассистента
 *    data: {"usage": {"totalTokens": N}}\n\n — финальная статистика токенов
 *    data: [DONE]\n\n                    — маркер завершения стрима
 *
 *  Эндпоинт /voice дополнительно отправляет первым событием:
 *    data: {"transcription": "..."}\n\n  — распознанный текст голосового сообщения
 *
 * ─── Ограничения demo/free пользователей ────────────────────────────────────
 *
 *  - Бесплатный тариф: не более 20 сообщений в сутки (HTTP 429 при превышении)
 *  - Голосовые функции (STT, TTS) полностью заблокированы для бесплатных пользователей
 *    (HTTP 403 с кодом DEMO_FEATURE_BLOCKED)
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from "@nestjs/swagger";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DemoService } from "../demo/demo.service";
import { ChatsService } from "./chats.service";
import { CreateChatDto } from "./dto/create-chat.dto";
import { EditMessageDto } from "./dto/edit-message.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateChatDto } from "./dto/update-chat.dto";
import { loadEnv } from "@repo/config";

/** Загружаем переменные окружения через общий конфиг монорепы. */
const env = loadEnv();

/**
 * Базовый URL внутреннего AI-сервиса.
 * AI-сервис слушает на AI_PORT и предоставляет эндпоинты:
 *   POST /ai/chat/completion — стриминг ответа LLM (SSE)
 *   POST /ai/stt             — Speech-to-Text через Whisper
 *   POST /ai/tts             — Text-to-Speech через ElevenLabs
 */
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

/**
 * Извлекает количество использованных токенов из одной SSE-строки.
 *
 * Вспомогательная функция для парсинга токенов из стрима AI-сервиса.
 * Используется внутри циклов чтения SSE для финального подсчёта токенов.
 *
 * Формат входной строки: `data: {"usage": {"totalTokens": 123}, ...}`
 *
 * @param line — одна строка SSE-потока (например `data: {...}` или `data: [DONE]`)
 * @returns количество токенов (totalTokens) из поля usage, либо 0 если не найдено
 */
function extractUsageFromLine(line: string): number {
  if (!line.startsWith("data: ") || line === "data: [DONE]") return 0;
  try {
    const parsed = JSON.parse(line.slice(6));
    return parsed.usage?.totalTokens ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Контроллер для управления чатами и сообщениями AI-персонажей.
 *
 * Обеспечивает полный жизненный цикл чата:
 * 1. CRUD-операции над сессиями чатов (создание, список, обновление, удаление)
 * 2. Получение истории сообщений с cursor-пагинацией
 * 3. Отправку текстовых и голосовых сообщений с AI-ответом через SSE-стриминг
 * 4. Генерацию TTS-аудио для сообщений персонажа
 * 5. Редактирование и перегенерацию сообщений с cascade-удалением последующих
 * 6. Аудит-лог событий копирования сообщений
 *
 * Все операции требуют аутентификации через JWT Bearer-токен.
 * Проверка владельца ресурса выполняется в ChatsService (ForbiddenException при нарушении).
 *
 * @see ChatsService — бизнес-логика и работа с базой данных
 * @see DemoService  — проверка лимитов бесплатных пользователей
 */
@ApiTags("chats")
@ApiBearerAuth()
@Controller("chats")
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly demoService: DemoService,
  ) {}

  /**
   * Создаёт новую сессию чата с указанным персонажем.
   * Creates a new chat session with the specified AI character.
   *
   * Персонаж должен существовать и не быть мягко удалён.
   * Если заголовок не передан, автоматически присваивается "Chat with {name}".
   *
   * @param req     — объект запроса Express; req.user.id — ID аутентифицированного пользователя
   * @param dto     — тело запроса: { characterId: UUID, title?: string }
   * @returns       ChatSession с полями id, title, characterId, createdAt и вложенным character
   * @throws 404    если персонаж не найден или удалён
   */
  @ApiOperation({ summary: "Create a new chat session with a character" })
  @Post()
  async createChat(@Req() req: any, @Body() dto: CreateChatDto) {
    return this.chatsService.createChat(req.user.id, dto.characterId, dto.title);
  }

  /**
   * Возвращает список чатов текущего пользователя с cursor-пагинацией.
   * Returns a paginated list of the current user's chat sessions.
   *
   * Сортировка: по времени последнего сообщения (lastMessageAt DESC).
   * Чаты без сообщений располагаются в конце.
   * Каждый элемент включает краткую информацию о персонаже и превью последнего сообщения.
   *
   * @param req     — req.user.id — ID текущего пользователя
   * @param cursor  — (опционально) ID последнего чата из предыдущей страницы для продолжения пагинации
   * @param limit   — (опционально) размер страницы, по умолчанию 20
   * @returns       { items: ChatSession[], nextCursor: string | null }
   *                nextCursor === null означает последнюю страницу
   */
  @ApiOperation({ summary: "List user chats with pagination" })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "limit", required: false })
  @Get()
  async listChats(
    @Req() req: any,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.chatsService.getUserChats(
      req.user.id,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  /**
   * Возвращает полную информацию о конкретном чате.
   * Returns details of a specific chat session.
   *
   * Включает данные персонажа, необходимые для отображения интерфейса чата
   * (имя, аватар, voiceId для TTS).
   *
   * @param req     — req.user.id — ID текущего пользователя (проверка доступа)
   * @param id      — UUID чата
   * @returns       ChatSession с вложенным character { id, name, avatarUrl, voiceId }
   * @throws 404    если чат не найден или мягко удалён
   * @throws 403    если чат принадлежит другому пользователю
   */
  @ApiOperation({ summary: "Get a specific chat session" })
  @Get(":id")
  async getChat(@Req() req: any, @Param("id") id: string) {
    return this.chatsService.getChat(id, req.user.id);
  }

  /**
   * Обновляет заголовок чата.
   * Updates the title of a chat session.
   *
   * @param req     — req.user.id — ID текущего пользователя
   * @param id      — UUID чата
   * @param dto     — тело запроса: { title?: string }
   * @returns       обновлённый ChatSession
   * @throws 404    если чат не найден
   * @throws 403    если чат принадлежит другому пользователю
   */
  @ApiOperation({ summary: "Update chat title" })
  @Patch(":id")
  async updateChat(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateChatDto,
  ) {
    return this.chatsService.updateChat(id, req.user.id, dto.title!);
  }

  /**
   * Мягко удаляет чат (soft delete).
   * Soft-deletes a chat session by setting deletedAt and isActive=false.
   *
   * Данные физически остаются в базе данных — устанавливается deletedAt = now().
   * Сообщения чата также перестают отображаться через API.
   * Возвращает HTTP 204 No Content при успехе.
   *
   * @param req     — req.user.id — ID текущего пользователя
   * @param id      — UUID чата для удаления
   * @returns       void (HTTP 204)
   * @throws 404    если чат не найден
   * @throws 403    если чат принадлежит другому пользователю
   */
  @ApiOperation({ summary: "Soft delete a chat" })
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChat(@Req() req: any, @Param("id") id: string) {
    await this.chatsService.deleteChat(id, req.user.id);
  }

  /**
   * Возвращает сообщения чата с cursor-пагинацией.
   * Returns chat messages with cursor-based pagination (supports infinite scroll / load more).
   *
   * Сообщения возвращаются в хронологическом порядке (старые → новые).
   * Пагинация направлена "вглубь истории": cursor указывает на самое старое сообщение
   * текущей страницы; nextCursor — для загрузки ещё более ранних сообщений.
   *
   * @param req     — req.user.id — ID текущего пользователя
   * @param id      — UUID чата
   * @param cursor  — (опционально) ID сообщения: вернуть сообщения, предшествующие этому
   * @param limit   — (опционально) размер страницы, по умолчанию 50
   * @returns       { items: Message[], nextCursor: string | null }
   * @throws 404    если чат не найден
   * @throws 403    если чат принадлежит другому пользователю
   */
  @ApiOperation({ summary: "Get chat messages with cursor pagination" })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "limit", required: false })
  @Get(":id/messages")
  async getMessages(
    @Req() req: any,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.chatsService.getMessages(
      id,
      req.user.id,
      cursor,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  /**
   * Отправляет текстовое сообщение и возвращает AI-ответ в виде SSE-стрима.
   * Sends a user message and streams the AI character's response via Server-Sent Events.
   *
   * Последовательность выполнения:
   *  1. Проверяется дневной лимит сообщений для бесплатного тарифа (DemoService → HTTP 429)
   *  2. Создаётся запись AiJob (тип "chat") для отслеживания операции
   *  3. Сохраняется сообщение пользователя в базе данных
   *  4. Запрашивается история последних 20 сообщений для контекста LLM
   *  5. Отправляется запрос к AI-сервису (POST /ai/chat/completion) с историей и characterId
   *  6. SSE-поток AI-сервиса проксируется клиенту побайтово (минимальная задержка)
   *  7. Во время стриминга накапливается полный текст ответа и статистика токенов
   *  8. После завершения стрима: сохраняется ответ ассистента, обновляется AiJob, UsageLog
   *
   * Если клиент закрыл соединение (событие 'close'), стриминг прерывается
   * без сохранения неполного ответа ассистента.
   *
   * SSE-формат ответа (Content-Type: text/event-stream):
   *   data: {"content": "Привет"}\n\n
   *   data: {"content": "!"}\n\n
   *   data: {"usage": {"totalTokens": 42}}\n\n
   *   data: [DONE]\n\n
   *
   * @param req     — req.user.id / req.user.subscription — данные JWT-пользователя
   * @param res     — объект ответа Express (используется напрямую для SSE и raw proxy)
   * @param id      — UUID чата
   * @param dto     — тело запроса: { content: string } — текст сообщения пользователя
   * @returns       SSE-поток (text/event-stream) с фрагментами ответа ассистента
   * @throws 429    если превышен дневной лимит сообщений (free tier)
   * @throws 404    если чат не найден
   * @throws 403    если чат принадлежит другому пользователю
   * @throws 502    если AI-сервис недоступен или вернул ошибку
   */
  @ApiOperation({ summary: "Send a message and get streaming AI response (SSE)" })
  @Post(":id/messages")
  async sendMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
  ) {
    // Check demo limits (throws 429 if exceeded)
    await this.demoService.checkAndIncrementMessage(req.user.id, req.user.subscription);

    const chat = await this.chatsService.getChat(id, req.user.id);

    // Create AiJob record
    const aiJob = await this.chatsService.createAiJob(req.user.id, "chat", {
      chatSessionId: id,
      characterId: chat.characterId,
    });

    // Save user message
    await this.chatsService.saveMessage(id, "user", dto.content);

    // Get recent history for context
    const history = await this.chatsService.getMessageHistory(id);

    // Stream from AI service
    const aiRes = await fetch(`${AI_BASE}/ai/chat/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        characterId: chat.characterId,
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      const err = await aiRes.json().catch(() => ({ error: "AI service unavailable" }));
      res.status(aiRes.status || 502).json(err);
      return;
    }

    // Forward SSE stream to client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    // Отключаем буферизацию nginx/proxy для немедленной доставки каждого чанка клиенту
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Support client abort
    let aborted = false;
    req.on("close", () => { aborted = true; });

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    /** Полный текст ответа ассистента, накапливается из фрагментов SSE. */
    let fullContent = "";
    /** Итоговое количество токенов, извлекается из последнего SSE-события с полем usage. */
    let tokensUsed = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;

        const text = decoder.decode(value, { stream: true });
        res.write(text);

        // Extract content and token usage from SSE data
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullContent += parsed.content;
              if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Save assistant's full response
    if (fullContent) {
      await this.chatsService.saveMessage(id, "assistant", fullContent);
    }

    // Record job completion and usage
    await this.chatsService.completeAiJob(aiJob.id, tokensUsed || undefined);
    await this.chatsService.logUsage(req.user.id, "chat_message", tokensUsed || undefined);

    res.end();
  }

  // ─── Voice message: upload audio → STT → AI response (streamed) ───

  /**
   * Обрабатывает голосовое сообщение: аудио → STT → AI-ответ (SSE).
   * Processes a voice message: uploads audio, transcribes via Whisper STT,
   * then streams an AI character response via Server-Sent Events.
   *
   * Доступно только для платных пользователей. Бесплатный тариф получает HTTP 403.
   *
   * Последовательность выполнения:
   *  1. Проверяется что аудиофайл приложен (400 если нет)
   *  2. Проверяется доступность голосовых функций (DemoService → 403 для free)
   *  3. Аудиофайл (WebM/MP3/WAV, до 25 МБ) отправляется в AI-сервис как multipart/form-data
   *  4. AI-сервис выполняет STT через OpenAI Whisper, возвращает транскрипцию
   *  5. Транскрибированный текст сохраняется как сообщение пользователя с type="audio"
   *  6. Записывается UsageLog с action="stt"
   *  7. Запрашивается история сообщений для контекста LLM
   *  8. AI-сервис генерирует ответ (SSE), поток проксируется клиенту
   *  9. Первым SSE-событием отправляется транскрипция для немедленного отображения на фронте:
   *       data: {"transcription": "Привет, как дела?"}\n\n
   * 10. Далее следуют фрагменты ответа ассистента (стандартный SSE-формат)
   * 11. После завершения: сохраняется ответ, обновляются AiJob и UsageLog
   *
   * Ограничение файла: 25 МБ (настроено в FileInterceptor limits).
   * Поддерживаемые форматы: любые, поддерживаемые OpenAI Whisper (webm, mp3, wav, m4a и др.).
   *
   * SSE-формат ответа (Content-Type: text/event-stream):
   *   data: {"transcription": "текст голоса"}\n\n   ← первым всегда
   *   data: {"content": "Привет!"}\n\n               ← фрагменты ответа AI
   *   data: {"usage": {"totalTokens": 55}}\n\n
   *   data: [DONE]\n\n
   *
   * @param req     — req.user.id / req.user.subscription — данные JWT-пользователя
   * @param res     — объект ответа Express (используется напрямую для SSE)
   * @param id      — UUID чата
   * @param file    — загруженный аудиофайл (поле "audio" в multipart/form-data)
   *                  { buffer: Buffer, mimetype: string, originalname: string }
   * @returns       SSE-поток с транскрипцией и ответом ассистента
   * @throws 400    если аудиофайл не приложен или не удалось транскрибировать
   * @throws 403    если подписка не позволяет использовать голосовые функции (free tier)
   * @throws 404    если чат не найден
   * @throws 502    если STT или AI-сервис вернул ошибку
   * @throws 500    при неожиданной ошибке обработки
   */
  @ApiOperation({ summary: "Send voice message: audio → STT → AI response (SSE)" })
  @Post(":id/voice")
  @UseInterceptors(FileInterceptor("audio", { limits: { fileSize: 25 * 1024 * 1024 } }))
  async sendVoiceMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) {
      res.status(400).json({ error: "Audio file is required" });
      return;
    }

    // STT/TTS blocked for free/demo users
    this.demoService.checkVoiceAllowed(req.user.subscription);

    try {
      const chat = await this.chatsService.getChat(id, req.user.id);

      // 1. Send audio to AI service for STT (Whisper)
      const audioBuffer = Buffer.from(file.buffer);
      const formData = new FormData();
      formData.append(
        "audio",
        new Blob([audioBuffer], { type: file.mimetype }),
        file.originalname || "audio.webm",
      );

      const sttRes = await fetch(`${AI_BASE}/ai/stt`, {
        method: "POST",
        body: formData,
      });

      if (!sttRes.ok) {
        const err = await sttRes.json().catch(() => ({ error: "STT failed" }));
        res.status(sttRes.status || 502).json(err);
        return;
      }

      const { text: transcribedText } = (await sttRes.json()) as { text: string };

      if (!transcribedText) {
        res.status(400).json({ error: "Could not transcribe audio" });
        return;
      }

      // 2. Save user voice message
      await this.chatsService.saveMessage(id, "user", transcribedText, { type: "audio" });
      await this.chatsService.logUsage(req.user.id, "stt");

      // 3. Get history and stream AI response
      const history = await this.chatsService.getMessageHistory(id);

      const aiJob = await this.chatsService.createAiJob(req.user.id, "chat", {
        chatSessionId: id,
        characterId: chat.characterId,
      });

      const aiRes = await fetch(`${AI_BASE}/ai/chat/completion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          characterId: chat.characterId,
        }),
      });

      if (!aiRes.ok || !aiRes.body) {
        const err = await aiRes.json().catch(() => ({ error: "AI service unavailable" }));
        res.status(aiRes.status || 502).json(err);
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Send transcribed text first so frontend can display it
      res.write(`data: ${JSON.stringify({ transcription: transcribedText })}\n\n`);

      let aborted = false;
      req.on("close", () => { aborted = true; });

      const reader = aiRes.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let tokensUsed = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done || aborted) break;

          const text = decoder.decode(value, { stream: true });
          res.write(text);

          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && line !== "data: [DONE]") {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.content) fullContent += parsed.content;
                if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
              } catch {
                // ignore
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (fullContent) {
        await this.chatsService.saveMessage(id, "assistant", fullContent);
      }

      await this.chatsService.completeAiJob(aiJob.id, tokensUsed || undefined);
      await this.chatsService.logUsage(req.user.id, "chat_message", tokensUsed || undefined);

      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Voice processing failed", details: err.message });
      } else {
        res.end();
      }
    }
  }

  // ─── TTS: generate speech for a message via ElevenLabs → S3 ────────

  /**
   * Генерирует TTS-аудио для текстового сообщения через ElevenLabs.
   * Generates Text-to-Speech audio for a chat message using ElevenLabs API.
   *
   * Доступно только для платных пользователей (бесплатный тариф → HTTP 403).
   *
   * Для генерации используется voiceId из профиля персонажа чата (если задан).
   * AI-сервис сначала пытается сохранить аудио в S3 и вернуть URL;
   * если S3 не сконфигурирован — возвращает бинарные данные напрямую.
   *
   * Логика обработки ответа от AI-сервиса:
   *  - Если Content-Type: application/json → JSON с { url, key } (S3-путь к файлу)
   *    Клиент должен использовать url для воспроизведения через <audio src="url">
   *  - Если Content-Type: audio/mpeg (или иной audio/*) → бинарные данные MP3
   *    Возвращается напрямую как audio/mpeg (fallback когда S3 не настроен)
   *
   * @param req     — req.user.id / req.user.subscription — данные JWT-пользователя
   * @param res     — объект ответа Express (используется напрямую для передачи бинарных данных)
   * @param chatId  — UUID чата (для проверки доступа и получения voiceId персонажа)
   * @param msgId   — UUID сообщения, для которого генерируется аудио
   * @returns       JSON { url: string, key: string } (S3) или binary audio/mpeg (fallback)
   * @throws 403    если подписка не позволяет использовать TTS (free tier)
   * @throws 404    если чат или сообщение не найдено
   * @throws 502    если TTS-сервис вернул ошибку
   * @throws 500    при неожиданной ошибке обработки
   */
  @ApiOperation({ summary: "Generate TTS audio for a message. Returns URL (S3) or binary fallback" })
  @Post(":id/messages/:msgId/tts")
  async messageTTS(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    // TTS blocked for free/demo users
    this.demoService.checkVoiceAllowed(req.user.subscription);

    try {
      const chat = await this.chatsService.getChat(chatId, req.user.id);
      const message = await this.chatsService.getMessage(msgId, chatId, req.user.id);

      const voiceId = chat.character?.voiceId || undefined;

      const ttsRes = await fetch(`${AI_BASE}/ai/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message.content,
          voiceId,
        }),
      });

      if (!ttsRes.ok) {
        const err = await ttsRes.json().catch(() => ({ error: "TTS failed" }));
        res.status(ttsRes.status || 502).json(err);
        return;
      }

      const contentType = ttsRes.headers.get("content-type") || "";

      // If AI service returned JSON with URL (internal S3/MinIO path) —
      // the URL is reachable from the API container but NOT from the browser,
      // so we fetch the audio here and proxy it as binary to the client.
      if (contentType.includes("application/json")) {
        const data = await ttsRes.json() as { url: string; key: string };
        const audioRes = await fetch(data.url);
        if (!audioRes.ok) {
          res.status(502).json({ error: "Failed to fetch audio from storage" });
          return;
        }
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
        await this.chatsService.logUsage(req.user.id, "tts");
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", audioBuffer.length);
        res.status(200).send(audioBuffer);
        return;
      }

      // Binary fallback (S3 not configured)
      const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
      await this.chatsService.logUsage(req.user.id, "tts");
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.send(audioBuffer);
    } catch (err: any) {
      // Re-throw NestJS HTTP exceptions (404, 403, etc.) so they are handled
      // by the global exception filter with the correct status code.
      if (err instanceof HttpException) throw err;
      if (!res.headersSent) {
        res.status(500).json({ error: "TTS processing failed", details: err.message });
      }
    }
  }

  // ─── Copy message (audit log) ────────────────────────────────

  /**
   * Записывает событие копирования сообщения в аудит-лог.
   * Records a copy action for a message in the audit log.
   *
   * Используется для отслеживания распространения контента, генерируемого AI.
   * Перед записью проверяется, что сообщение принадлежит чату пользователя (защита от IDOR).
   * Возвращает HTTP 200 с { ok: true } при успехе.
   *
   * @param req     — req.user.id — ID пользователя, выполнившего копирование
   * @param chatId  — UUID чата (для проверки владельца)
   * @param msgId   — UUID скопированного сообщения
   * @returns       { ok: true }
   * @throws 404    если чат или сообщение не найдено
   * @throws 403    если чат принадлежит другому пользователю
   */
  @ApiOperation({ summary: "Record copy action for a message (audit)" })
  @Post(":id/messages/:msgId/copy")
  @HttpCode(HttpStatus.OK)
  async copyMessage(
    @Req() req: any,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    // Verify message belongs to user's chat
    await this.chatsService.getMessage(msgId, chatId, req.user.id);
    await this.chatsService.recordCopy(msgId, req.user.id);
    return { ok: true };
  }

  /**
   * Мягко удаляет отдельное сообщение в чате.
   * Soft-deletes a single message within a chat.
   *
   * Сообщение не удаляется физически — устанавливается deletedAt = now().
   * После удаления сообщение перестаёт возвращаться в getMessages и getMessageHistory,
   * а следовательно не попадает в контекст LLM при следующем запросе.
   * Возвращает HTTP 204 No Content при успехе.
   *
   * @param req     — req.user.id — ID текущего пользователя
   * @param chatId  — UUID чата
   * @param msgId   — UUID сообщения для удаления
   * @returns       void (HTTP 204)
   * @throws 404    если чат или сообщение не найдено
   * @throws 403    если чат принадлежит другому пользователю
   */
  @ApiOperation({ summary: "Soft delete a message" })
  @Delete(":id/messages/:msgId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(
    @Req() req: any,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    await this.chatsService.deleteMessage(msgId, chatId, req.user.id);
  }

  // ─── Edit message: update content + soft-delete subsequent messages + stream new AI response ───

  /**
   * Редактирует сообщение пользователя и стримит перегенерированный AI-ответ (SSE).
   * Edits a user message, cascade-deletes all subsequent messages,
   * then streams a fresh AI response based on the updated history.
   *
   * Позволяет "переписать историю": изменить вопрос пользователя и получить новый ответ.
   * Это потребляет лимит сообщений дневной квоты (аналогично отправке нового сообщения).
   *
   * Последовательность выполнения:
   *  1. Проверяется дневной лимит сообщений (DemoService → HTTP 429 для free)
   *  2. Обновляется текст сообщения msgId
   *  3. Все сообщения ПОСЛЕ msgId в этом чате мягко удаляются (cascade soft-delete)
   *     (это включает предыдущий ответ ассистента и любые последующие сообщения)
   *  4. Создаётся запись AiJob (тип "chat")
   *  5. Запрашивается обновлённая история сообщений для контекста LLM
   *  6. AI-сервис генерирует новый ответ на основе изменённой истории
   *  7. SSE-поток проксируется клиенту; ответ сохраняется после завершения стрима
   *
   * @param req     — req.user.id / req.user.subscription — данные JWT-пользователя
   * @param res     — объект ответа Express (используется напрямую для SSE)
   * @param chatId  — UUID чата
   * @param msgId   — UUID сообщения для редактирования (должно принадлежать пользователю)
   * @param dto     — тело запроса: { content: string } — новый текст сообщения
   * @returns       SSE-поток с новым ответом ассистента
   * @throws 429    если превышен дневной лимит сообщений (free tier)
   * @throws 404    если чат или сообщение не найдено
   * @throws 403    если чат принадлежит другому пользователю
   * @throws 502    если AI-сервис недоступен или вернул ошибку
   */
  @ApiOperation({ summary: "Edit a message and stream regenerated AI response (SSE)" })
  @Patch(":id/messages/:msgId")
  async editMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
    @Body() dto: EditMessageDto,
  ) {
    // Check demo limits (editing sends a new AI request)
    await this.demoService.checkAndIncrementMessage(req.user.id, req.user.subscription);

    const chat = await this.chatsService.getChat(chatId, req.user.id);

    // Update message content and soft-delete messages after it
    await this.chatsService.updateMessageContent(msgId, chatId, req.user.id, dto.content);

    // Create AiJob record
    const aiJob = await this.chatsService.createAiJob(req.user.id, "chat", {
      chatSessionId: chatId,
      characterId: chat.characterId,
    });

    // Get updated history and stream new AI response
    const history = await this.chatsService.getMessageHistory(chatId);

    const aiRes = await fetch(`${AI_BASE}/ai/chat/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        characterId: chat.characterId,
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      const err = await aiRes.json().catch(() => ({ error: "AI service unavailable" }));
      res.status(aiRes.status || 502).json(err);
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let aborted = false;
    req.on("close", () => { aborted = true; });

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let tokensUsed = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;

        const text = decoder.decode(value, { stream: true });
        res.write(text);

        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullContent += parsed.content;
              if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
            } catch {
              // ignore
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (fullContent) {
      await this.chatsService.saveMessage(chatId, "assistant", fullContent);
    }

    await this.chatsService.completeAiJob(aiJob.id, tokensUsed || undefined);
    await this.chatsService.logUsage(req.user.id, "chat_message", tokensUsed || undefined);

    res.end();
  }

  /**
   * Перегенерирует AI-ответ для указанного сообщения (SSE).
   * Regenerates the AI response starting from a specific message via Server-Sent Events.
   *
   * Мягко удаляет целевое сообщение и все последующие, затем запрашивает новый AI-ответ
   * на основе оставшейся истории чата. Считается как новое сообщение для дневного лимита.
   *
   * Отличие от editMessage:
   *  - editMessage: изменяет текст существующего сообщения пользователя → перегенерация
   *  - regenerateMessage: удаляет сообщение msgId (и всё после него) → перегенерация
   *    без изменения предшествующих сообщений (например для повторной генерации ответа ассистента)
   *
   * Последовательность выполнения:
   *  1. Проверяется дневной лимит (DemoService → HTTP 429 для free)
   *  2. Получается список сообщений ПОСЛЕ msgId в чате
   *  3. Мягко удаляются сообщения: [msgId] + все последующие
   *  4. Запрашивается оставшаяся история для контекста LLM
   *  5. Создаётся AiJob, запрашивается новый AI-ответ, SSE-поток проксируется клиенту
   *  6. Сохраняется новый ответ ассистента, обновляются AiJob и UsageLog
   *
   * SSE-формат ответа идентичен /messages (POST):
   *   data: {"content": "..."}\n\n
   *   data: {"usage": {"totalTokens": N}}\n\n
   *   data: [DONE]\n\n
   *
   * @param req     — req.user.id / req.user.subscription — данные JWT-пользователя
   * @param res     — объект ответа Express (используется напрямую для SSE)
   * @param chatId  — UUID чата
   * @param msgId   — UUID сообщения, начиная с которого выполняется перегенерация
   *                  (само сообщение и все последующие будут мягко удалены)
   * @returns       SSE-поток с новым ответом ассистента
   * @throws 429    если превышен дневной лимит сообщений (free tier)
   * @throws 404    если чат не найден
   * @throws 403    если чат принадлежит другому пользователю
   * @throws 502    если AI-сервис недоступен или вернул ошибку
   */
  @ApiOperation({ summary: "Regenerate AI response for a message (SSE)" })
  @Post(":id/messages/:msgId/regenerate")
  async regenerateMessage(
    @Req() req: any,
    @Res() res: Response,
    @Param("id") chatId: string,
    @Param("msgId") msgId: string,
  ) {
    // Check demo limits (regenerating counts as a new message)
    await this.demoService.checkAndIncrementMessage(req.user.id, req.user.subscription);

    const chat = await this.chatsService.getChat(chatId, req.user.id);

    // Soft-delete the target message and everything after it
    const after = await this.chatsService.getMessagesAfter(chatId, msgId);
    const idsToDelete = [msgId, ...after.map((m) => m.id)];
    await this.chatsService.softDeleteMessages(idsToDelete);

    // Get remaining history
    const history = await this.chatsService.getMessageHistory(chatId);

    const aiJob = await this.chatsService.createAiJob(req.user.id, "chat", {
      chatSessionId: chatId,
      characterId: chat.characterId,
    });

    // Stream new AI response
    const aiRes = await fetch(`${AI_BASE}/ai/chat/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        characterId: chat.characterId,
      }),
    });

    if (!aiRes.ok || !aiRes.body) {
      const err = await aiRes.json().catch(() => ({ error: "AI service unavailable" }));
      res.status(aiRes.status || 502).json(err);
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let aborted = false;
    req.on("close", () => { aborted = true; });

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let tokensUsed = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || aborted) break;

        const text = decoder.decode(value, { stream: true });
        res.write(text);

        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) fullContent += parsed.content;
              if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
            } catch {
              // ignore
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (fullContent) {
      await this.chatsService.saveMessage(chatId, "assistant", fullContent);
    }

    await this.chatsService.completeAiJob(aiJob.id, tokensUsed || undefined);
    await this.chatsService.logUsage(req.user.id, "chat_message", tokensUsed || undefined);

    res.end();
  }
}
