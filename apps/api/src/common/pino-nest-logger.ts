/**
 * @file pino-nest-logger.ts
 * @description Логгер NestJS поверх общего Pino-логгера сервиса.
 *
 * Раньше встроенный логгер Nest был отключён (logger: false), и всё, что сервисы
 * пишут через `new Logger(...)` (ошибки обработки Telegram, outbox, планировщика,
 * биллинга), никуда не выводилось. Теперь эти записи идут в тот же JSON-лог,
 * что и HTTP-запросы, с полем `context` (имя класса).
 */

import type { LoggerService } from "@nestjs/common";
import type { createLogger } from "@repo/logger";

type PinoLogger = ReturnType<typeof createLogger>;

/** Служебные контексты Nest, которые при старте пишут по строке на каждый маршрут/модуль. */
const NOISY_CONTEXTS = new Set(["RoutesResolver", "RouterExplorer", "InstanceLoader"]);

export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: PinoLogger) {}

  log(message: unknown, ...params: unknown[]) {
    const context = this.context(params);
    if (context && NOISY_CONTEXTS.has(context)) this.logger.debug({ context }, String(message));
    else this.logger.info({ context }, String(message));
  }

  warn(message: unknown, ...params: unknown[]) {
    this.logger.warn({ context: this.context(params) }, String(message));
  }

  error(message: unknown, ...params: unknown[]) {
    // Nest передаёт (message, stack?, context?) — stack может отсутствовать.
    const context = this.context(params);
    const stack = params.length > 1 && typeof params[0] === "string" ? params[0] : undefined;
    if (message instanceof Error) this.logger.error({ context, err: message }, message.message);
    else this.logger.error({ context, ...(stack ? { stack } : {}) }, String(message));
  }

  debug(message: unknown, ...params: unknown[]) {
    this.logger.debug({ context: this.context(params) }, String(message));
  }

  verbose(message: unknown, ...params: unknown[]) {
    this.logger.trace({ context: this.context(params) }, String(message));
  }

  /** Последний строковый аргумент — контекст (имя класса), как у ConsoleLogger. */
  private context(params: unknown[]): string | undefined {
    const last = params[params.length - 1];
    return typeof last === "string" ? last : undefined;
  }
}
