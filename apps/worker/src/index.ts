/**
 * @file apps/worker/src/index.ts
 * @description BullMQ Worker — асинхронный обработчик заданий из очереди "ai-jobs".
 *
 * Роль в архитектуре:
 * - Consumer очереди BullMQ (Redis)
 * - Получает задания, поставленные API (ChatsController)
 * - Вызывает AI-сервис (apps/ai) для фактической обработки
 * - Обновляет статусы заданий и логирует использование через internal API (apps/api)
 *
 * Поддерживаемые типы заданий:
 * - ai:chat — генерация текстового ответа (SSE streaming от AI-сервиса)
 * - ai:stt  — распознавание речи через Whisper (base64 → text)
 * - ai:tts  — синтез речи через ElevenLabs (text → audio URL или binary)
 *
 * Конфигурация Worker:
 * - 3 попытки с экспоненциальным откатом (2s, 4s, 8s)
 * - Событие "failed" обновляет AiJob.status = "failed" через internal API
 *
 * Мониторинг:
 * - Heartbeat лог каждые 5 секунд (queue counts)
 * - Pino-логгер с полями service, env, level из конфига
 *
 * Связи:
 * - Redis URL: env.REDIS_URL (та же очередь, что и в API)
 * - AI-сервис: http://{env.AI_HOST}:{env.AI_PORT}
 * - Internal API: http://{env.API_HOST}:{env.API_PORT}/internal/*
 */

import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

const env = loadEnv();
const logger = createLogger({ service: "worker", env: env.ENV, level: env.LOG_LEVEL });

/** Имя очереди BullMQ (должно совпадать с API) */
const QUEUE_NAME = "ai-jobs";

/** Базовый URL для internal API (без JWT авторизации) */
const API_BASE = `http://${env.API_HOST}:${env.API_PORT}`;

/**
 * Названия заданий — идентичны JOB_NAMES из apps/api/src/queue/queue.types.ts.
 * Продублированы здесь, чтобы worker не зависел от пакета API.
 */
const JOB_NAMES = {
  CHAT: "ai:chat",
  STT: "ai:stt",
  TTS: "ai:tts",
  IMAGE: "ai:image",
  VIDEO: "ai:video",
} as const;

/**
 * IORedis-соединение с Redis.
 * maxRetriesPerRequest: null — обязательно для BullMQ (иначе ошибка при старте).
 */
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

/**
 * Экземпляр Queue — используется только для heartbeat (чтение статистики).
 * Задания в очередь ставит API, worker их только читает через Worker.
 */
const queue = new Queue(QUEUE_NAME, { connection });

// ─── DB helpers (call back into API internal endpoints) ───────

/**
 * Обновляет статус записи AiJob через internal API.
 *
 * Вызывается на каждом этапе жизненного цикла задания:
 * - "processing" — сразу после получения задания worker-ом
 * - "completed" — после успешного выполнения (с output и tokensUsed)
 * - "failed" — при ошибке (из обработчика события "failed")
 *
 * Ошибки fetch логируются, но не перебрасываются — не блокируем основной поток.
 *
 * @param {string} jobId - UUID записи AiJob в PostgreSQL
 * @param {"processing" | "completed" | "failed"} status - Новый статус
 * @param {object} [data] - Дополнительные данные для обновления
 * @param {unknown} [data.output] - Результат выполнения (content, text, url)
 * @param {number} [data.tokensUsed] - Количество токенов (только для chat)
 * @param {string} [data.error] - Сообщение об ошибке
 */
async function updateJobStatus(
  jobId: string,
  status: "processing" | "completed" | "failed",
  data?: { output?: unknown; tokensUsed?: number; error?: string },
) {
  try {
    await fetch(`${API_BASE}/internal/ai-jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...data }),
    });
  } catch (err) {
    logger.error({ err, jobId }, "failed_to_update_job_status");
  }
}

/**
 * Записывает событие использования через internal API.
 *
 * Создаёт запись в таблице UsageLog для аудита и аналитики.
 * Вызывается после успешного завершения каждого задания.
 *
 * Ошибки fetch логируются, но не перебрасываются.
 *
 * @param {string} userId - ID пользователя-инициатора
 * @param {string} action - Тип действия ("chat_message" | "stt" | "tts")
 * @param {number} [tokensUsed] - Количество использованных токенов (только для chat)
 */
async function logUsage(userId: string, action: string, tokensUsed?: number) {
  try {
    await fetch(`${API_BASE}/internal/usage-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action, tokensUsed }),
    });
  } catch (err) {
    logger.error({ err, userId, action }, "failed_to_log_usage");
  }
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Проверяет HTTP-ответ. Если 429 — бросает Error с полем retryAfter (мс),
 * чтобы BullMQ custom backoff мог учесть Retry-After заголовок от OpenAI.
 */
function assertOk(response: Response, label: string): void {
  if (response.status === 429) {
    const retryAfterSec = Number(response.headers.get("retry-after") ?? 60);
    const err = new Error(`${label} rate limited (429)`);
    (err as any).retryAfter = retryAfterSec * 1000;
    throw err;
  }
  if (!response.ok) {
    throw new Error(`${label} returned ${response.status}`);
  }
}

// ─── Job Handlers ─────────────────────────────────────────────

/**
 * Обработчик задания генерации AI-ответа (ai:chat).
 *
 * Алгоритм:
 * 1. Устанавливает статус "processing" через internal API
 * 2. Вызывает POST /ai/chat/completion на AI-сервисе (SSE streaming)
 * 3. Читает SSE-поток построчно, собирает fullContent и tokensUsed
 *    - Формат каждой строки: `data: {"content":"..."}` или `data: {"usage":{"totalTokens":N}}`
 *    - Поток заканчивается строкой `data: [DONE]`
 * 4. Обновляет AiJob.output = { content: fullContent }, AiJob.tokensUsed
 * 5. Логирует использование (для аналитики и billing)
 *
 * @param {Job} job - BullMQ Job с данными типа ChatJobData
 */
async function handleChatJob(job: Job): Promise<void> {
  const { jobId, userId, chatSessionId, characterId, messages } = job.data;
  logger.info({ jobId, userId, chatSessionId }, "chat_job_started");

  await updateJobStatus(jobId, "processing");

  const response = await fetch(`http://${env.AI_HOST}:${env.AI_PORT}/ai/chat/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, characterId }),
  });

  assertOk(response, "AI chat service");

  // Collect streaming response — читаем SSE-поток и собираем полный ответ
  let fullContent = "";
  let tokensUsed = 0;

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split("\n");
    for (const line of lines) {
      // Пропускаем терминальную строку [DONE] и пустые строки
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.content) fullContent += parsed.content;
          if (parsed.usage?.totalTokens) tokensUsed = parsed.usage.totalTokens;
        } catch {
          // ignore parse errors — некорректные чанки не должны ломать поток
        }
      }
    }
  }

  await updateJobStatus(jobId, "completed", {
    output: { content: fullContent },
    tokensUsed,
  });

  await logUsage(userId, "chat_message", tokensUsed);
  logger.info({ jobId, tokensUsed, contentLength: fullContent.length }, "chat_job_done");
}

/**
 * Обработчик задания распознавания речи (ai:stt).
 *
 * Алгоритм:
 * 1. Устанавливает статус "processing"
 * 2. Декодирует base64 → Buffer → Blob
 * 3. Отправляет multipart/form-data на POST /ai/stt (AI-сервис)
 *    - Поле "audio" с Blob и именем файла (mimeType определяет формат)
 * 4. Получает транскрипцию { text: string }
 * 5. Сохраняет output = { text } в AiJob, логирует использование
 *
 * @param {Job} job - BullMQ Job с данными типа SttJobData
 */
async function handleSttJob(job: Job): Promise<void> {
  const { jobId, userId, audioBase64, mimeType, filename } = job.data;
  logger.info({ jobId, userId }, "stt_job_started");

  await updateJobStatus(jobId, "processing");

  // Конвертируем base64 в Blob для отправки как multipart/form-data
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const formData = new FormData();
  formData.append("audio", new Blob([audioBuffer], { type: mimeType }), filename || "audio.webm");

  const response = await fetch(`http://${env.AI_HOST}:${env.AI_PORT}/ai/stt`, {
    method: "POST",
    body: formData,
  });

  assertOk(response, "AI STT service");

  const { text } = (await response.json()) as { text: string };

  await updateJobStatus(jobId, "completed", { output: { text } });
  await logUsage(userId, "stt");
  logger.info({ jobId }, "stt_job_done");
}

/**
 * Обработчик задания синтеза речи (ai:tts).
 *
 * Алгоритм:
 * 1. Устанавливает статус "processing"
 * 2. Отправляет POST /ai/tts на AI-сервис с { text, voiceId }
 *    - voiceId берётся из Character.voiceId (опционально)
 * 3. Получает результат: { url?: string; key?: string }
 *    - url — публичная ссылка на S3/MinIO (если настроено)
 *    - key — S3 ключ файла (альтернативный вариант)
 * 4. Сохраняет output в AiJob, логирует использование
 *
 * @param {Job} job - BullMQ Job с данными типа TtsJobData
 */
async function handleTtsJob(job: Job): Promise<void> {
  const { jobId, userId, text, voiceId } = job.data;
  logger.info({ jobId, userId }, "tts_job_started");

  await updateJobStatus(jobId, "processing");

  const response = await fetch(`http://${env.AI_HOST}:${env.AI_PORT}/ai/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voiceId }),
  });

  assertOk(response, "AI TTS service");

  const result = await response.json() as { url?: string; key?: string };

  await updateJobStatus(jobId, "completed", { output: result });
  await logUsage(userId, "tts");
  logger.info({ jobId, url: result.url }, "tts_job_done");
}

/**
 * Преобразует строку aspectRatio в размеры изображения.
 */
function getImageDimensions(aspectRatio?: string): { width: number; height: number } {
  switch (aspectRatio) {
    case "4:5":  return { width: 512, height: 640 };
    case "5:4":  return { width: 640, height: 512 };
    case "9:16": return { width: 576, height: 1024 };
    case "16:9": return { width: 1024, height: 576 };
    case "1:1":
    default:     return { width: 512, height: 512 };
  }
}

/**
 * Обработчик задания генерации изображения (ai:image).
 *
 * Алгоритм:
 * 1. Устанавливает статус "processing"
 * 2. Вычисляет размеры из aspectRatio
 * 3. Отправляет POST /ai/image/generate на AI-сервис (ModelsLab)
 * 4. Получает { url } — ссылку на S3
 * 5. Сохраняет output = { url } в AiJob, логирует использование
 *
 * @param {Job} job - BullMQ Job с данными типа ImageJobData
 */
async function handleImageJob(job: Job): Promise<void> {
  const { jobId, userId, prompt, negativePrompt, model, aspectRatio, provider, generationStyle } = job.data;
  logger.info({ jobId, userId, provider, generationStyle }, "image_job_started");

  await updateJobStatus(jobId, "processing");

  const { width, height } = getImageDimensions(aspectRatio);

  const response = await fetch(`http://${env.AI_HOST}:${env.AI_PORT}/ai/image/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, negativePrompt, model, width, height, provider, generationStyle }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Image generation service returned ${response.status}: ${errText}`);
  }

  const result = await response.json() as { url: string };

  await updateJobStatus(jobId, "completed", { output: { url: result.url } });
  await logUsage(userId, "generation");
  logger.info({ jobId, url: result.url }, "image_job_done");
}

/**
 * Обработчик задания генерации видео (ai:video).
 *
 * Алгоритм:
 * 1. Устанавливает статус "processing"
 * 2. Вычисляет размеры из aspectRatio
 * 3. Отправляет POST /ai/video/generate на AI-сервис (ModelsLab)
 * 4. Получает { url } — ссылку на S3
 * 5. Сохраняет output = { url } в AiJob, логирует использование
 *
 * @param {Job} job - BullMQ Job с данными типа VideoJobData
 */
async function handleVideoJob(job: Job): Promise<void> {
  const { jobId, userId, prompt, negativePrompt, model, aspectRatio, provider, mode, initImageKey, initVideoKey } = job.data;
  logger.info({ jobId, userId, provider, mode }, "video_job_started");

  await updateJobStatus(jobId, "processing");

  // Atlas Cloud uses aspect_ratio/resolution instead of width/height
  const { width, height } = getImageDimensions(aspectRatio);

  const response = await fetch(`http://${env.AI_HOST}:${env.AI_PORT}/ai/video/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, negativePrompt, model, width, height, provider, aspectRatio, mode, initImageKey, initVideoKey }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Video generation service returned ${response.status}: ${errText}`);
  }

  const result = await response.json() as { url: string; status?: string };

  if (!result.url) {
    throw new Error("Video generation returned empty URL — provider may still be processing");
  }

  await updateJobStatus(jobId, "completed", { output: { url: result.url } });
  await logUsage(userId, "generation");
  logger.info({ jobId, url: result.url }, "video_job_done");
}

// ─── Worker ───────────────────────────────────────────────────

/**
 * Основной BullMQ Worker.
 *
 * Конфигурация:
 * - Слушает очередь QUEUE_NAME ("ai-jobs")
 * - 3 попытки с экспоненциальным откатом: 2s → 4s → 8s
 * - Роутинг по job.name на соответствующий handler
 *
 * Обработчик "failed":
 * - Вызывается после исчерпания всех попыток
 * - Обновляет AiJob.status = "failed", сохраняет сообщение ошибки
 */
const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    logger.info({ job_id: job.id, name: job.name }, "job_started");

    switch (job.name) {
      case JOB_NAMES.CHAT:
        await handleChatJob(job);
        break;
      case JOB_NAMES.STT:
        await handleSttJob(job);
        break;
      case JOB_NAMES.TTS:
        await handleTtsJob(job);
        break;
      case JOB_NAMES.IMAGE:
        await handleImageJob(job);
        break;
      case JOB_NAMES.VIDEO:
        if (!job.opts.attempts || job.opts.attempts < 6) {
          job.opts.attempts = 6;
        }
        await handleVideoJob(job);
        break;
      default:
        logger.warn({ name: job.name }, "unknown_job_type");
    }

    logger.info({ job_id: job.id }, "job_done");
    return { ok: true };
  },
  {
    connection,
    // Custom backoff: учитывает Retry-After от OpenAI, иначе экспоненциальный 2s/4s/8s
    settings: {
      backoffStrategy: (attempts: number, _type: string, err: Error) => {
        const retryAfter = (err as any).retryAfter;
        if (retryAfter) return retryAfter;
        return 2000 * Math.pow(2, attempts - 1);
      },
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "custom" },
    },
  },
);

// Graceful shutdown: дожидаемся текущего job перед остановкой контейнера
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, closing worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

worker.on("failed", async (job, err) => {
  // Обработчик вызывается после последней неудачной попытки
  if (!job) return;
  logger.error({ job_id: job.id, name: job.name, err: err.message }, "job_failed");

  // Обновляем статус AiJob в БД через internal API
  const jobId = job.data?.jobId;
  if (jobId) {
    await updateJobStatus(jobId, "failed", { error: err.message });
  }
});

// ─── Heartbeat ────────────────────────────────────────────────

/**
 * Периодический лог состояния очереди (каждые 5 секунд).
 * Выводит статистику: active, waiting, completed, failed jobs.
 * Позволяет мониторить накопление и обработку заданий.
 */
setInterval(async () => {
  const counts = await queue.getJobCounts();
  logger.info({ queue: QUEUE_NAME, counts }, "worker_heartbeat");
}, 5000);
