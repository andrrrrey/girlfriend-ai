/**
 * @file internal.controller.ts
 * @description Внутренний HTTP API для межсервисного взаимодействия.
 *
 * ВАЖНО: Этот контроллер НЕ защищён JWT-аутентификацией.
 * Он предназначен только для вызовов внутри приватной Docker-сети.
 * В production НЕ должен быть доступен извне (закрыть через nginx/firewall).
 *
 * Потребители:
 * - AI-сервис (apps/ai) — читает настройки и данные персонажей
 * - Worker (apps/worker) — обновляет статусы AiJob и записывает UsageLog
 *
 * Маршруты:
 * - GET  /internal/settings           — все настройки в виде ключ/значение map
 * - GET  /internal/settings/:key      — одна настройка по ключу
 * - GET  /internal/characters/:id     — данные персонажа (systemPrompt, voiceId)
 * - PATCH /internal/ai-jobs/:id       — обновление статуса AiJob (worker → api)
 * - POST  /internal/usage-logs        — запись события использования
 */

import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

/**
 * Контроллер внутреннего API.
 * Используется только AI-сервисом и Worker-ом.
 * Все запросы должны идти по внутренней Docker-сети (не через интернет).
 */
@Controller("internal")
export class InternalController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /internal/settings
   *
   * Возвращает все настройки приложения в виде плоского объекта { key: value }.
   * Используется AI-сервисом для загрузки OPENAI_API_KEY, ELEVENLABS_API_KEY и т.д.
   *
   * @returns Record<string, string> — карта настроек
   */
  @Get("settings")
  async getAllSettings() {
    const settings = await this.prisma.appSetting.findMany();
    // Преобразуем массив записей в плоский объект { OPENAI_API_KEY: "sk-...", ... }
    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return map;
  }

  /**
   * GET /internal/settings/:key
   *
   * Возвращает одну настройку по ключу.
   * Если настройка не найдена — возвращает { key, value: null } без 404.
   *
   * @param key — ключ настройки (например "OPENAI_MODEL")
   * @returns { key: string, value: string | null }
   */
  @Get("settings/:key")
  async getSetting(@Param("key") key: string) {
    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    return { key, value: setting?.value ?? null }; // null если настройка не задана
  }

  /**
   * GET /internal/characters/:id
   *
   * Возвращает данные персонажа, необходимые AI-сервису для генерации ответа.
   * Включает systemPrompt (для OpenAI), personality (для дополнительного контекста),
   * voiceId (для ElevenLabs TTS).
   *
   * @param id — UUID персонажа
   * @returns Character { id, name, systemPrompt, personality, voiceId } или null
   */
  @Get("characters/:id")
  async getCharacter(@Param("id") id: string) {
    return this.prisma.character.findFirst({
      where: { id, deletedAt: null }, // Удалённые персонажи не возвращаются
      select: {
        id: true,
        name: true,
        systemPrompt: true, // Передаётся как system message в OpenAI Chat Completions
        personality: true,  // JSON с чертами личности (можно добавить в промпт)
        voiceId: true,       // ID голоса ElevenLabs для TTS
      },
    });
  }

  // ─── AiJob endpoints (вызываются Worker-ом) ─────────────────────────────────

  /**
   * PATCH /internal/ai-jobs/:id
   *
   * Обновляет статус и результат AiJob после обработки задания Worker-ом.
   * Вызывается из apps/worker/src/index.ts по завершении каждого задания.
   *
   * @param id — UUID записи AiJob
   * @param body — обновляемые поля:
   *   - status: "completed" | "failed" | "processing" (обязательно)
   *   - output: результат задания в JSON (транскрипция, URL аудио и т.д.)
   *   - tokensUsed: количество токенов OpenAI (только для chat)
   *   - error: сообщение об ошибке (при status="failed")
   * @returns обновлённая запись AiJob
   *
   * Логика completedAt:
   * - Устанавливается автоматически при status="completed" или "failed"
   * - undefined при других статусах (например "processing")
   */
  @Patch("ai-jobs/:id")
  async updateAiJob(
    @Param("id") id: string,
    @Body()
    body: {
      status: string;
      output?: unknown;
      tokensUsed?: number;
      error?: string;
    },
  ) {
    return this.prisma.aiJob.update({
      where: { id },
      data: {
        status: body.status,
        output: body.output as any,
        tokensUsed: body.tokensUsed,
        error: body.error,
        // completedAt устанавливается при финальных статусах
        completedAt: ["completed", "failed"].includes(body.status) ? new Date() : undefined,
      },
    });
  }

  // ─── UsageLog endpoints (вызываются Worker-ом) ──────────────────────────────

  /**
   * POST /internal/usage-logs
   *
   * Записывает событие использования AI в аудит-лог.
   * Вызывается Worker-ом после успешного выполнения AI-задания.
   *
   * @param body — данные для лога:
   *   - userId: кто инициировал запрос
   *   - action: "chat_message" | "stt" | "tts" | "generation"
   *   - tokensUsed: количество токенов (только для chat)
   *   - metadata: дополнительные данные в JSON (опционально)
   * @returns созданная запись UsageLog
   */
  @Post("usage-logs")
  async createUsageLog(
    @Body()
    body: {
      userId: string;
      action: string;
      tokensUsed?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.prisma.usageLog.create({
      data: {
        userId: body.userId,
        action: body.action,
        tokensUsed: body.tokensUsed,
        metadata: body.metadata as any,
      },
    });
  }
}
