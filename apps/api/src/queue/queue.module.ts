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
 * Injection token для BullMQ Queue.
 * Используется для DI: @Inject(AI_QUEUE) private queue: Queue
 */
export const AI_QUEUE = Symbol("AI_QUEUE");

/**
 * Глобальный модуль очереди.
 *
 * @Global() — автоматически доступен во всём приложении.
 * Экспортирует AI_QUEUE token для инъекции в любой сервис/контроллер.
 *
 * useFactory — создаёт Queue внутри NestJS DI, а не на верхнем уровне модуля.
 * Это гарантирует, что ошибки (неверный REDIS_URL, недоступный Redis и т.д.)
 * попадают в bootstrap().catch() а не глушатся process.exit(1).
 */
@Global()
@Module({
  providers: [
    {
      provide: AI_QUEUE,
      useFactory: () => {
        const env = loadEnv();
        return new Queue(QUEUE_NAME, {
          connection: parseRedisUrl(env.REDIS_URL) as any,
        });
      },
    },
  ],
  exports: [AI_QUEUE],
})
export class QueueModule {}
