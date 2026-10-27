/**
 * @file llm.adapter.ts
 * @description Адаптер языковой модели: POST /ai/chat/completion внутреннего AI-сервиса.
 *
 * Сборка системного промпта (персонаж, режим контента, профиль пользователя)
 * остаётся в AI-сервисе; сюда передаётся история и параметры.
 */

import { Injectable } from "@nestjs/common";
import { AI_BASE, parseSse, throwAiError } from "./ai-client";

/** Запрос на генерацию ответа персонажа. */
export interface LlmChatRequest {
  messages: { role: string; content: string }[];
  characterId: string;
  /** "nsfw" | "sfw"; не задан — AI-сервис берёт режим по умолчанию. */
  contentMode?: string;
  userProfile?: string;
  /**
   * Язык ответа (например "Russian") — AI-сервис ставит требование в конец
   * системного промпта: одной пометки у сообщения модели иногда не хватает.
   */
  replyLanguage?: string;
}

@Injectable()
export class LlmAdapter {
  /**
   * Запрашивает ответ персонажа и отдаёт SSE-события AI-сервиса как есть:
   * { content } — фрагмент, { done, usage } — финал, { error } — ошибка в стриме.
   *
   * @throws AiServiceError — если AI-сервис ответил ошибкой до начала стрима
   */
  async *streamChat(req: LlmChatRequest, signal?: AbortSignal): AsyncGenerator<Record<string, unknown>> {
    const res = await fetch(`${AI_BASE}/ai/chat/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok || !res.body) await throwAiError(res, "AI service unavailable");
    yield* parseSse(res.body!);
  }
}
