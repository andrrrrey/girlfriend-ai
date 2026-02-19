/**
 * @file http.ts
 * @description Утилиты для работы с X-Request-ID в HTTP-запросах/ответах.
 *
 * X-Request-ID — механизм сквозной трассировки запросов между сервисами.
 * Используется в middleware NestJS API (main.ts) и хуке onRequest Fastify (ai/index.ts).
 *
 * Логика работы:
 * 1. Если клиент или прокси прислал заголовок X-Request-ID — используем его.
 * 2. Если нет — генерируем новый UUID.
 * 3. В ответ всегда устанавливаем тот же Request-ID (для корреляции на клиенте).
 */

import type { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";

/**
 * Извлекает Request-ID из входящего HTTP-запроса.
 *
 * Приоритет: существующий заголовок (от клиента/прокси) > свежий UUID.
 * Заголовок нормализуется в нижний регистр перед поиском.
 *
 * @param req — Node.js IncomingMessage (совместим с Express.Request и Fastify req.raw)
 * @param headerName — имя заголовка (по умолчанию "x-request-id", из переменной REQUEST_ID_HEADER)
 * @returns строковый ID — либо из заголовка, либо новый UUID v4
 *
 * @example
 * // В middleware Express (NestJS):
 * app.use((req, res, next) => {
 *   const requestId = getRequestId(req, env.REQUEST_ID_HEADER);
 *   req.requestId = requestId;
 *   next();
 * });
 */
export function getRequestId(req: IncomingMessage, headerName = "x-request-id") {
  const h = headerName.toLowerCase();
  const fromHeader = (req.headers[h] as string | undefined)?.trim();
  // Если заголовок непустой — берём его; иначе генерируем новый UUID
  return fromHeader && fromHeader.length > 0 ? fromHeader : randomUUID();
}

/**
 * Устанавливает Request-ID в HTTP-ответ.
 *
 * Позволяет клиенту сопоставить запрос с логами сервера.
 *
 * @param res — Node.js ServerResponse
 * @param requestId — строковый ID для установки в заголовок
 * @param headerName — имя заголовка (по умолчанию "x-request-id")
 *
 * @example
 * setResponseRequestId(res, "abc-123", "x-request-id");
 * // Добавляет: X-Request-ID: abc-123
 */
export function setResponseRequestId(
  res: ServerResponse,
  requestId: string,
  headerName = "x-request-id"
) {
  res.setHeader(headerName, requestId);
}
