/**
 * @file logger.ts
 * @description Фабрика структурированного JSON-логгера на базе Pino.
 *
 * Каждый сервис создаёт свой экземпляр через `createLogger()`.
 * Все записи содержат поля `service` и `env` для фильтрации в Loki/ELK/Datadog.
 *
 * Формат времени: ISO-8601 строка в поле `ts`.
 * Поле уровня: строковое `level` вместо числового Pino-кода (удобнее читать).
 */

import pino from "pino";

/** Параметры для создания логгера */
export type LoggerOptions = {
  /** Имя сервиса — присутствует в каждой записи: "api" | "ai" | "worker" | "migrator" */
  service: string;
  /** Среда запуска из переменной ENV: "development" | "production" */
  env: string;
  /** Уровень логирования Pino (по умолчанию "info") */
  level?: string;
};

/**
 * Создаёт и возвращает настроенный Pino-логгер.
 *
 * Особенности:
 * - `base` добавляет `service` и `env` ко всем записям автоматически
 * - `timestamp` выводит ISO-строку вместо числового unix-timestamp
 * - `formatters.level` возвращает уровень как строку ("info", а не 30)
 *
 * @example
 * const logger = createLogger({ service: "api", env: "production", level: "warn" });
 * logger.info({ userId: "abc" }, "user_logged_in");
 * // → {"level":"info","ts":"2024-01-15T10:30:00.000Z","service":"api","env":"production","userId":"abc","msg":"user_logged_in"}
 */
export function createLogger(opts: LoggerOptions) {
  return pino({
    level: opts.level ?? "info",

    // Эти поля добавляются автоматически к каждой записи — упрощают фильтрацию
    base: { service: opts.service, env: opts.env },

    // ISO-строка вместо числового timestamp — читаемость в stdout и в логгерах
    timestamp: () => `,"ts":"${new Date().toISOString()}"`,

    formatters: {
      // Уровень как строка ("info"), а не как число Pino (30)
      level(label) {
        return { level: label };
      },
    },
  });
}
