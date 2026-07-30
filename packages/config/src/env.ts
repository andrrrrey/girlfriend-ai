/**
 * @file env.ts
 * @description Централизованная схема переменных окружения для всех сервисов монорепозитория.
 *
 * Использует `zod` для валидации и приведения типов при старте каждого сервиса.
 * Все сервисы (api, ai, worker, migrator, web) вызывают `loadEnv()` при инициализации.
 * Если обязательная переменная отсутствует — процесс завершается с ZodError.
 *
 * Переменные с `.optional()` не обязательны для базового запуска.
 * Переменные с `.default(...)` имеют безопасные значения по умолчанию.
 */

import { z } from "zod";

/**
 * Zod-схема всех переменных окружения платформы.
 *
 * Группы:
 * - General:   ENV, порты сервисов (WEB_PORT, API_PORT, AI_PORT)
 * - Database:  DATABASE_URL (PostgreSQL), REDIS_URL (BullMQ + кеш), CLICKHOUSE_URL (аналитика)
 * - S3/MinIO:  S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET
 * - Auth:      JWT_SECRET (обязателен!), JWT_TTL_SECONDS (TTL access-токена)
 * - Logging:   LOG_LEVEL (pino уровень), LOG_FORMAT
 * - Tracing:   REQUEST_ID_HEADER (заголовок для сквозной трассировки X-Request-ID)
 */
const EnvSchema = z.object({
  /** Среда запуска: "development" | "production" | "test" */
  ENV: z.string().default("development"),

  /** Порт Next.js фронтенда */
  WEB_PORT: z.coerce.number().default(3000),
  /** Хост NestJS API (для межсервисного взаимодействия; в Docker = имя сервиса "api") */
  API_HOST: z.string().default("localhost"),
  /** Порт NestJS API (основной REST API) */
  API_PORT: z.coerce.number().default(8080),
  /** Хост Fastify AI-сервиса (для межсервисного взаимодействия; в Docker = имя сервиса "ai") */
  AI_HOST: z.string().default("localhost"),
  /** Порт Fastify AI-сервиса (OpenAI, ElevenLabs) */
  AI_PORT: z.coerce.number().default(8081),

  /** PostgreSQL connection string (обязательна) */
  DATABASE_URL: z.string(),
  /**
   * Redis connection string (обязательна).
   * Используется BullMQ для очереди заданий и QueueModule в API.
   */
  REDIS_URL: z.string(),
  /** ClickHouse HTTP URL для записи аналитики (опционально) */
  CLICKHOUSE_URL: z.string().optional(),

  // ─── S3 / Cloudflare R2 ─────────────────────────────────────────────────────
  // Все поля опциональны. Если не заданы — TTS отдаёт бинарный аудио-поток.
  // Если заданы — TTS загружает mp3 в R2/S3 и возвращает presigned URL.
  // Для Cloudflare R2: S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com, S3_REGION=auto
  /** Эндпоинт R2/S3, например: https://<account_id>.r2.cloudflarestorage.com */
  S3_ENDPOINT: z.string().optional(),
  /** AWS регион (для Cloudflare R2 — "auto") */
  S3_REGION: z.string().optional(),
  /** S3 / R2 Access Key ID */
  S3_ACCESS_KEY: z.string().optional(),
  /** S3 / R2 Secret Access Key */
  S3_SECRET_KEY: z.string().optional(),
  /** Название бакета для медиафайлов */
  S3_BUCKET: z.string().optional(),
  /** Публичный базовый URL для отдачи файлов браузеру (кастомный домен или *.r2.dev) */
  S3_PUBLIC_URL: z.string().optional(),

  // ─── JWT Auth ───────────────────────────────────────────────────────────────
  /** Секретный ключ HMAC для подписи JWT access-токенов (обязателен) */
  JWT_SECRET: z.string(),
  /**
   * TTL access-токена в секундах.
   * По умолчанию 604800 = 7 дней.
   * Refresh-токены живут 30 дней (константа REFRESH_TOKEN_TTL_DAYS в auth.service.ts).
   */
  JWT_TTL_SECONDS: z.coerce.number().default(604800),

  // ─── Logging (Pino) ─────────────────────────────────────────────────────────
  /** Уровень логирования: "trace" | "debug" | "info" | "warn" | "error" | "fatal" */
  LOG_LEVEL: z.string().default("info"),
  /** Формат вывода: "json" для production, "pretty" для локальной разработки */
  LOG_FORMAT: z.string().default("json"),

  // ─── Email (Resend) ─────────────────────────────────────────────────────────
  /** API-ключ Resend для отправки email (опционально) */
  RESEND_API_KEY: z.string().optional(),
  /** Email отправителя, например: noreply@yourdomain.com */
  RESEND_FROM: z.string().optional(),
  /** Публичный URL фронтенда (для ссылок в письмах верификации) */
  WEB_URL: z.string().optional().default("http://localhost:3000"),

  // ─── Cloudflare Turnstile ───────────────────────────────────────────────────
  /** Секретный ключ Turnstile для серверной верификации капчи */
  TURNSTILE_SECRET_KEY: z.string().optional(),

  // ─── PostHog (product analytics) ────────────────────────────────────────────
  /**
   * Project API-ключ PostHog (server-side capture из NestJS).
   * Если не задан — серверная аналитика превращается в no-op (ничего не ломается).
   */
  POSTHOG_KEY: z.string().optional(),
  /** Хост инстанса PostHog. По умолчанию — облако EU-региона. */
  POSTHOG_HOST: z.string().default("https://eu.i.posthog.com"),

  // ─── Request Tracing ────────────────────────────────────────────────────────
  /**
   * Имя HTTP-заголовка для сквозной трассировки запросов (X-Request-ID).
   * API и AI-сервис читают этот заголовок из входящего запроса и
   * пробрасывают его обратно в ответе для корреляции логов.
   */
  REQUEST_ID_HEADER: z.string().default("x-request-id"),
});

/** Типизированный объект конфига (инференс из Zod-схемы) */
export type AppEnv = z.infer<typeof EnvSchema>;

/**
 * Загружает и валидирует переменные окружения.
 *
 * Вызывать один раз при старте модуля/сервиса.
 *
 * @param overrides — опциональный объект для переопределения значений (удобен в тестах)
 * @returns Валидированный и типизированный объект `AppEnv`
 * @throws {ZodError} если обязательные переменные отсутствуют или имеют неверный формат
 *
 * @example
 * const env = loadEnv();
 * console.log(env.API_PORT); // 8080
 *
 * // В тесте:
 * const env = loadEnv({ JWT_SECRET: "test-secret", DATABASE_URL: "postgresql://..." });
 */
export function loadEnv(overrides?: Record<string, string | undefined>): AppEnv {
  // Объединяем process.env с переопределениями (overrides имеют приоритет)
  const data = { ...process.env, ...(overrides ?? {}) };
  return EnvSchema.parse(data);
}
