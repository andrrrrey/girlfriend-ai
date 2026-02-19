/**
 * @file queue.module.ts
 * @description Глобальный NestJS-модуль очереди BullMQ для постановки AI-заданий.
 *
 * Архитектура:
 * - @Global() — модуль доступен во всём приложении без явного импорта
 * - Предоставляет singleton-экземпляр BullMQ Queue через токен AI_QUEUE
 * - Используется ChatsController для постановки заданий в очередь
 * - Worker (apps/worker) читает из той же очереди через отдельное соединение
 *
 * Почему parseRedisUrl вместо прямой передачи URL:
 * - BullMQ 5.x bundлит свою версию ioredis
 * - Передача строки URL через внешний ioredis вызывает конфликты типов
 * - Парсинг в объект {host, port, password, db} обходит это ограничение
 *
 * Инъекция зависимостей:
 * - Получить Queue в сервисе: @Inject(AI_QUEUE) private queue: Queue
 */

import { Module, Global } from "@nestjs/common";
import { Queue } from "bullmq";
import { loadEnv } from "@repo/config";
import { QUEUE_NAME } from "./queue.types";

const env = loadEnv();

/**
 * Парсит Redis URL в объект подключения для BullMQ.
 *
 * Parse Redis URL into connection options — avoids ioredis version conflicts
 * (bullmq bundles its own ioredis; passing raw options bypasses type mismatch).
 *
 * Поддерживаемые форматы URL:
 * - redis://localhost:6379
 * - redis://:password@localhost:6379/0
 * - redis://user:password@host:6379/db
 *
 * @param {string} url - Redis connection string
 * @returns {Record<string, unknown>} Объект конфигурации ioredis
 */
function parseRedisUrl(url: string): Record<string, unknown> {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    db: parseInt(parsed.pathname.slice(1) || "0", 10),
    maxRetriesPerRequest: null, // Обязательно для BullMQ
  };
}

/**
 * Singleton-экземпляр BullMQ Queue.
 * Создаётся один раз при загрузке модуля.
 * Используется для постановки заданий: aiQueue.add(JOB_NAMES.CHAT, data)
 */
export const aiQueue = new Queue(QUEUE_NAME, {
  connection: parseRedisUrl(env.REDIS_URL) as any,
});

/**
 * Injection token для BullMQ Queue.
 * Используется для DI: @Inject(AI_QUEUE) private queue: Queue
 */
export const AI_QUEUE = Symbol("AI_QUEUE");

/**
 * Глобальный модуль очереди.
 *
 * @Global() — автоматически доступен во всём приложении.
 * Экспортирует AI_QUEUE token для инъекции в любой сервис/контроллер.
 */
@Global()
@Module({
  providers: [
    {
      provide: AI_QUEUE,
      useValue: aiQueue,
    },
  ],
  exports: [AI_QUEUE],
})
export class QueueModule {}
