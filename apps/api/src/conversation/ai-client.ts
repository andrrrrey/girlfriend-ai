/**
 * @file ai-client.ts
 * @description Общие части HTTP-клиентов внутреннего AI-сервиса (apps/ai):
 * базовый URL, ошибка ответа AI-сервиса и разбор SSE-потока.
 */

import { loadEnv } from "@repo/config";

const env = loadEnv();

/** Базовый URL внутреннего AI-сервиса. */
export const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

/**
 * AI-сервис ответил ошибкой ДО начала стрима. status и body пробрасываются
 * клиенту как есть (402 INSUFFICIENT_BALANCE, 502 и т.д.).
 */
export class AiServiceError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : `AI service error ${status}`,
    );
    this.name = "AiServiceError";
  }
}

/** Читает тело ошибки AI-сервиса (JSON или fallback) и бросает AiServiceError. */
export async function throwAiError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({ error: fallback }));
  throw new AiServiceError(res.ok ? 502 : res.status || 502, body);
}

/**
 * Разбирает SSE-поток в последовательность JSON-объектов из строк `data: {...}`.
 *
 * Строки буферизуются: событие, разрезанное между сетевыми чанками, собирается
 * целиком. Поток заканчивается на `data: [DONE]` или по закрытию соединения.
 * Строки с невалидным JSON пропускаются.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.replace(/\r$/, "");
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === "object") yield parsed as Record<string, unknown>;
        } catch {
          // невалидная строка — пропускаем
        }
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
