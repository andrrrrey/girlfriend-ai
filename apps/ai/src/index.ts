/**
 * @file index.ts (ai service)
 * @description Fastify HTTP-сервис для взаимодействия с AI-провайдерами.
 *
 * Сервис предоставляет три эндпоинта:
 * 1. POST /ai/chat/completion — SSE-стриминг ответа OpenAI Chat Completions
 * 2. POST /ai/stt             — Speech-to-Text через OpenAI Whisper (multipart upload)
 * 3. POST /ai/tts             — Text-to-Speech через ElevenLabs API → S3/binary fallback
 *
 * Особенности:
 * - Настройки (API keys, models) загружаются из БД через internal API (не из env)
 *   → можно менять ключи без перезапуска сервисов
 * - Rate limiting: 60 запросов/мин на IP (через @fastify/rate-limit)
 * - Abort support: если клиент закрыл соединение — OpenAI запрос отменяется (AbortController)
 * - TTS fallback: если S3 не настроен — отдаёт бинарный поток audio/mpeg напрямую
 * - X-Request-ID: сквозная трассировка через все сервисы
 *
 * Сервис работает на порту AI_PORT (по умолчанию 8081).
 * Доступен API-сервису и Worker-у внутри Docker-сети.
 */

import Fastify from "fastify";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "@repo/config";
import { createLogger } from "@repo/logger";
import { getRequestId } from "@repo/logger";
import type { HealthResponse } from "@repo/types";
import OpenAI from "openai";
import { File } from "buffer";
import { translate as googleTranslate } from "@vitalets/google-translate-api";
import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

// Загружаем и валидируем переменные окружения
const env = loadEnv();
const logger = createLogger({ service: "ai", env: env.ENV, level: env.LOG_LEVEL });

/** Базовый URL внутреннего API NestJS (используется для чтения настроек и персонажей) */
const API_BASE = `http://${env.API_HOST}:${env.API_PORT}`;

// Создаём Fastify-приложение (без встроенного логгера — используем Pino напрямую)
const app = Fastify({ logger: false });

// Плагин для обработки multipart/form-data (нужен для STT эндпоинта)
// Лимит размера файла: 25 MB (максимум для Whisper API)
app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

// ─── Rate Limiting ───────────────────────────────────────────────────────────
// 60 запросов в минуту на IP для всех AI-эндпоинтов.
// IP определяется из X-Forwarded-For (за прокси) или req.ip.
app.register(rateLimit, {
  max: 60,
  timeWindow: "1 minute",
  keyGenerator: (req) => {
    // X-Forwarded-For имеет приоритет — для работы за nginx/reverse proxy
    return (req.headers["x-forwarded-for"] as string) || req.ip;
  },
  errorResponseBuilder: (_req, context) => ({
    error: "RATE_LIMIT_EXCEEDED",
    message: `Слишком много запросов. Подождите ${context.after} перед следующим запросом.`,
    retryAfter: context.after,
  }),
});

// ─── X-Request-ID Middleware ─────────────────────────────────────────────────
// Читает или генерирует Request-ID для каждого запроса.
// Устанавливает его в req.requestId и в ответный заголовок.
app.addHook("onRequest", async (req, reply) => {
  const requestId = getRequestId(req.raw, env.REQUEST_ID_HEADER);
  (req as any).requestId = requestId;
  reply.header(env.REQUEST_ID_HEADER, requestId);
});

// ─── S3 Client ───────────────────────────────────────────────────────────────

/**
 * Создаёт S3Client если заданы все необходимые переменные окружения.
 * Возвращает null если S3 не настроен (TTS будет возвращать бинарный поток).
 *
 * forcePathStyle: true — обязательно для MinIO (используется path-style URL вместо subdomain).
 */
function createS3Client(): S3Client | null {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) return null;
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION || "us-east-1",
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
    forcePathStyle: true, // Обязательно для MinIO — s3.endpoint/bucket/key вместо bucket.s3.endpoint
  });
}

/**
 * Создаёт S3-бакет если он не существует.
 * Игнорирует ошибку BucketAlreadyOwnedByYou (бакет уже принадлежит нам).
 *
 * @param s3 — настроенный S3Client
 * @param bucket — название бакета
 */
// Бакеты, для которых уже выставлена публичная политика чтения (кеш на время жизни процесса).
// Позволяет не вызывать PutBucketPolicy на каждый запрос — достаточно один раз.
const configuredBuckets = new Set<string>();

async function ensureBucketExists(s3: S3Client, bucket: string): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    // Бакет существует и доступен
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err.name === "NoSuchBucket" || err.name === "NotFound") {
      // Бакет не существует — создаём его
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      logger.info({ bucket }, "s3_bucket_created");
    } else if (status === 403) {
      // Бакет существует но доступ запрещён — пробрасываем ошибку
      throw err;
    } else {
      throw err;
    }
  }

  // Ставим публичную политику чтения один раз за время жизни процесса.
  // Это гарантирует что URL вида {endpoint}/{bucket}/{key} реально доступны
  // для HTTP-запросов без подписи (в т.ч. от API-сервиса).
  if (!configuredBuckets.has(bucket)) {
    await s3.send(new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${bucket}/*`],
        }],
      }),
    }));
    configuredBuckets.add(bucket);
    logger.info({ bucket }, "s3_bucket_policy_set_public_read");
  }
}

/**
 * Загружает файл в S3/MinIO и возвращает публичный URL.
 * Перед загрузкой автоматически создаёт бакет если он не существует.
 *
 * @param s3 — настроенный S3Client
 * @param bucket — название бакета
 * @param key — путь объекта в бакете (например "tts/uuid.mp3")
 * @param body — бинарные данные файла
 * @param contentType — MIME-тип (например "audio/mpeg")
 * @returns публичный URL в формате {endpoint}/{bucket}/{key}
 */
async function uploadToS3(
  s3: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await ensureBucketExists(s3, bucket);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  // Формируем публичный URL (MinIO path-style: endpoint/bucket/key)
  const endpoint = env.S3_ENDPOINT!.replace(/\/$/, "");
  return `${endpoint}/${bucket}/${key}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Загружает все настройки приложения из NestJS internal API.
 * Настройки хранятся в PostgreSQL (таблица AppSetting) и меняются без перезапуска.
 *
 * @returns Record<string, string> — карта настроек (OPENAI_API_KEY, ELEVENLABS_API_KEY и т.д.)
 * @throws Error если internal API недоступен
 */
async function fetchSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/internal/settings`);
  if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`);
  return res.json();
}

/**
 * Загружает данные персонажа из NestJS internal API.
 * Возвращает systemPrompt, personality, voiceId для использования в AI-запросах.
 *
 * @param id — UUID персонажа
 * @returns данные персонажа или null если не найден
 */
async function fetchCharacter(id: string) {
  const res = await fetch(`${API_BASE}/internal/characters/${id}`);
  if (!res.ok) return null;
  return res.json();
}

/**
 * Создаёт OpenAI клиент с заданным API ключом.
 * Клиент создаётся per-request (не кешируется), т.к. ключ может меняться в БД.
 */
function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Health-check эндпоинт для Docker/k8s.
 */
app.get("/health", async (): Promise<HealthResponse> => ({ ok: true, service: "ai" }));

/**
 * Тело запроса для Chat Completions.
 */
interface ChatCompletionBody {
  /** История сообщений для OpenAI Chat API */
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  /** ID персонажа для загрузки systemPrompt (опционально) */
  characterId?: string;
  /** Явный системный промпт (альтернатива characterId) */
  systemPrompt?: string;
}

/**
 * POST /ai/chat/completion
 *
 * Генерирует ответ AI в режиме SSE-стриминга (Server-Sent Events).
 *
 * Формат SSE-событий:
 * - `data: {"content": "текст чанка"}\n\n` — стриминговый контент
 * - `data: {"done": true, "finishReason": "stop", "usage": {...}}\n\n` — финальный чанк с метриками
 * - `data: [DONE]\n\n` — конец стрима
 * - `data: {"error": "текст"}\n\n` — ошибка в стриме
 *
 * Abort: если клиент разрывает соединение — OpenAI запрос отменяется через AbortController.
 * Это предотвращает избыточные запросы к OpenAI при закрытии вкладки.
 *
 * Приоритет системного промпта: systemPrompt > character.systemPrompt.
 */
app.post<{ Body: ChatCompletionBody }>("/ai/chat/completion", async (req, reply) => {
  const { messages, characterId, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return reply.status(400).send({ error: "messages array is required" });
  }

  // Загружаем актуальные настройки из БД (OPENAI_API_KEY, OPENAI_MODEL)
  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch (err) {
    logger.error({ err }, "failed_to_fetch_settings");
    return reply.status(503).send({ error: "Failed to fetch AI settings" });
  }

  const apiKey = settings.OPENAI_API_KEY;
  if (!apiKey) {
    return reply.status(503).send({ error: "OpenAI API key not configured" });
  }

  const model = settings.OPENAI_MODEL || "gpt-4o"; // Дефолт если не задан в настройках

  // Формируем системный промпт: прямой > из персонажа > пустой
  let finalSystemPrompt = systemPrompt || "";
  if (characterId && !finalSystemPrompt) {
    try {
      const character = await fetchCharacter(characterId);
      if (character) {
        finalSystemPrompt = character.systemPrompt;
      }
    } catch (err) {
      logger.warn({ err, characterId }, "failed_to_fetch_character");
    }
  }

  // Собираем массив messages для OpenAI: [system, ...history]
  const allMessages: OpenAI.ChatCompletionMessageParam[] = [];
  if (finalSystemPrompt) {
    allMessages.push({ role: "system", content: finalSystemPrompt });
  }
  allMessages.push(
    ...messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam),
  );

  const openai = createOpenAIClient(apiKey);

  // AbortController для отмены OpenAI запроса при разрыве соединения клиентом
  const abortController = new AbortController();
  req.raw.on("close", () => {
    // req.raw.complete = false означает что соединение закрыто ДО завершения ответа
    if (!req.raw.complete) {
      abortController.abort();
    }
  });

  try {
    const stream = await openai.chat.completions.create(
      {
        model,
        messages: allMessages,
        stream: true,
        stream_options: { include_usage: true }, // Запрашиваем токены в финальном чанке
      },
      { signal: abortController.signal }, // Передаём сигнал отмены в OpenAI SDK
    );

    // Устанавливаем заголовки SSE-стрима
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Отключаем буферизацию в nginx для real-time доставки
    });

    let tokensUsed = 0;

    // Читаем стриминговые чанки от OpenAI и пробрасываем клиенту
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        // Текстовый контент — отправляем клиенту сразу
        reply.raw.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }

      // Финальный чанк содержит статистику токенов (из stream_options: include_usage)
      if (chunk.usage) {
        tokensUsed = chunk.usage.total_tokens;
        reply.raw.write(
          `data: ${JSON.stringify({
            done: true,
            finishReason: chunk.choices?.[0]?.finish_reason,
            usage: {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            },
          })}\n\n`,
        );
      } else {
        // Если нет usage — проверяем finishReason для не-stop завершений
        const finishReason = chunk.choices?.[0]?.finish_reason;
        if (finishReason && finishReason !== "stop") {
          reply.raw.write(`data: ${JSON.stringify({ done: true, finishReason })}\n\n`);
        }
      }
    }

    logger.info({ model, tokensUsed }, "chat_completion_done");
    reply.raw.write("data: [DONE]\n\n"); // SSE стандарт: конец стрима
    reply.raw.end();
  } catch (err: any) {
    // Обрабатываем отмену (клиент закрыл соединение)
    if (err.name === "AbortError" || abortController.signal.aborted) {
      logger.info({ characterId }, "chat_completion_aborted");
      if (!reply.raw.headersSent) {
        return reply.status(499).send({ error: "Request aborted by client" });
      }
      reply.raw.end();
      return;
    }
    logger.error({ err }, "openai_error");
    if (!reply.raw.headersSent) {
      // OpenAI rate limit / quota exceeded → 503 (service unavailable)
      if (err.status === 429) {
        return reply.status(503).send({ error: "AI service quota exceeded. Please try again later." });
      }
      return reply.status(502).send({ error: "AI service error", details: err.message });
    }
    // Если заголовки уже отправлены — передаём ошибку через SSE
    reply.raw.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    reply.raw.end();
  }
});

// ─── STT (Speech-to-Text via OpenAI Whisper) ─────────────────────────────────

/**
 * POST /ai/stt
 *
 * Распознаёт речь из аудиофайла (multipart/form-data, поле "audio").
 *
 * Поддерживаемые форматы: webm, mp4, mp3, wav, ogg (Whisper API).
 * Максимальный размер файла: 25 MB (ограничение Whisper API).
 *
 * @returns { text: string } — транскрибированный текст
 */
app.post("/ai/stt", async (req, reply) => {
  const file = await req.file();
  if (!file) {
    return reply.status(400).send({ error: "Audio file is required" });
  }

  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch (err) {
    logger.error({ err }, "failed_to_fetch_settings_stt");
    return reply.status(503).send({ error: "Failed to fetch AI settings" });
  }

  const apiKey = settings.OPENAI_API_KEY;
  if (!apiKey) {
    return reply.status(503).send({ error: "OpenAI API key not configured" });
  }

  const model = settings.OPENAI_STT_MODEL || "whisper-1"; // Модель Whisper
  const openai = createOpenAIClient(apiKey);

  try {
    const buffer = await file.toBuffer();

    // Создаём File объект (Web API File) — требуется OpenAI SDK
    const audioFile = new File([buffer], file.filename || "audio.webm", {
      type: file.mimetype || "audio/webm",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model,
      // response_format: "text" (по умолчанию JSON)
    });

    logger.info({ model, length: buffer.length }, "stt_done");
    return { text: transcription.text }; // Возвращаем транскрипцию
  } catch (err: any) {
    logger.error({ err }, "stt_error");
    return reply.status(502).send({ error: "STT failed", details: err.message });
  }
});

// ─── TTS (Text-to-Speech via ElevenLabs → S3) ────────────────────────────────

/**
 * Тело запроса для TTS эндпоинта.
 */
interface TTSBody {
  /** Текст для синтеза речи */
  text: string;
  /**
   * ID голоса ElevenLabs (опционально).
   * Если не передан — используется ELEVENLABS_DEFAULT_VOICE_ID из настроек.
   */
  voiceId?: string;
}

/**
 * POST /ai/tts
 *
 * Синтезирует речь из текста через ElevenLabs API.
 *
 * Логика сохранения аудио:
 * 1. Если S3 настроен (S3_ENDPOINT + credentials) → загружает mp3 в S3
 *    и возвращает { url: "https://...", key: "tts/uuid.mp3" }
 * 2. Если S3 не настроен или загрузка провалилась → возвращает бинарный
 *    аудио-поток (Content-Type: audio/mpeg)
 *
 * Голос выбирается по приоритету:
 * voiceId (из запроса) > ELEVENLABS_DEFAULT_VOICE_ID (из настроек БД) > hardcoded default
 *
 * Параметры ElevenLabs:
 * - stability: 0.5 (баланс вариативности/стабильности голоса)
 * - similarity_boost: 0.75 (насколько точно имитируется оригинальный голос)
 */
app.post<{ Body: TTSBody }>("/ai/tts", async (req, reply) => {
  const { text, voiceId } = req.body;

  if (!text) {
    return reply.status(400).send({ error: "text is required" });
  }

  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch (err) {
    logger.error({ err }, "failed_to_fetch_settings_tts");
    return reply.status(503).send({ error: "Failed to fetch AI settings" });
  }

  const apiKey = settings.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return reply.status(503).send({ error: "ElevenLabs API key not configured" });
  }

  // Выбираем голос: из запроса > из настроек БД > hardcoded дефолт (Rachel)
  const voice = voiceId || settings.ELEVENLABS_DEFAULT_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const modelId = settings.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  try {
    // Запрос к ElevenLabs REST API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey, // ElevenLabs API key header
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.5,           // 0.0–1.0, выше = более стабильный/монотонный
            similarity_boost: 0.75,   // 0.0–1.0, выше = ближе к оригинальному голосу
          },
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      logger.error({ status: response.status, body: errBody }, "elevenlabs_error");
      return reply.status(502).send({ error: "ElevenLabs TTS failed" });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Пробуем загрузить в S3 и вернуть URL
    const s3 = createS3Client();
    const bucket = env.S3_BUCKET || "media";

    if (s3) {
      const key = `tts/${randomUUID()}.mp3`; // Уникальный путь для каждого аудио
      try {
        const url = await uploadToS3(s3, bucket, key, audioBuffer, "audio/mpeg");
        logger.info({ key, voice }, "tts_uploaded_to_s3");
        return reply.send({ url, key }); // Клиент получает URL для медиаплеера
      } catch (s3Err: any) {
        // S3 недоступен — падаем на бинарный ответ
        logger.warn({ err: s3Err }, "tts_s3_upload_failed_falling_back_to_binary");
      }
    }

    // Fallback: возвращаем бинарный аудио-поток если S3 не настроен или упал
    reply.header("Content-Type", "audio/mpeg");
    reply.header("Content-Length", audioBuffer.length);
    return reply.send(audioBuffer);
  } catch (err: any) {
    logger.error({ err }, "tts_error");
    return reply.status(502).send({ error: "TTS failed", details: err.message });
  }
});

// ─── Image Generation (ModelsLab API) ────────────────────────────────────────

/**
 * Тело запроса для генерации изображения.
 */
interface ImageGenerateBody {
  /** Текстовый промпт для генерации */
  prompt: string;
  /** Негативный промпт */
  negativePrompt?: string;
  /** ID модели ModelsLab */
  model?: string;
  /** Ширина изображения в пикселях */
  width?: number;
  /** Высота изображения в пикселях */
  height?: number;
}

/**
 * POST /ai/image/generate
 *
 * Генерирует изображение через ModelsLab API и загружает результат в S3.
 *
 * Логика:
 * 1. Получает MODELSLAB_API_KEY и MODELSLAB_DEFAULT_MODEL из настроек БД
 * 2. Отправляет запрос в ModelsLab text2img API
 * 3. Если статус "processing" — поллит fetch_result URL (до 60 сек)
 * 4. Скачивает сгенерированное изображение и загружает в S3
 * 5. Возвращает публичный S3 URL
 *
 * @returns { url: string } — публичная ссылка на изображение в S3
 */
app.post<{ Body: ImageGenerateBody }>("/ai/image/generate", async (req, reply) => {
  const { prompt, negativePrompt, model, width, height } = req.body;

  if (!prompt) {
    return reply.status(400).send({ error: "prompt is required" });
  }

  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch (err) {
    logger.error({ err }, "failed_to_fetch_settings_image");
    return reply.status(503).send({ error: "Failed to fetch AI settings" });
  }

  const apiKey = settings.MODELSLAB_API_KEY;
  if (!apiKey) {
    return reply.status(503).send({ error: "ModelsLab API key not configured" });
  }

  const modelId = model || settings.MODELSLAB_DEFAULT_MODEL || "realistic-vision-v51";
  const imgWidth = width || 512;
  const imgHeight = height || 512;

  try {
    // 1. Запрос к ModelsLab text2img API
    const mlResponse = await fetch("https://modelslab.com/api/v6/images/text2img", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: apiKey,
        model_id: modelId,
        prompt,
        negative_prompt: negativePrompt || "",
        width: imgWidth,
        height: imgHeight,
        samples: 1,
        safety_checker: "no",
        enhance_prompt: "no",
        num_inference_steps: 30,
        seed: null,
      }),
    });

    if (!mlResponse.ok) {
      const errBody = await mlResponse.text();
      logger.error({ status: mlResponse.status, body: errBody }, "modelslab_api_error");
      return reply.status(502).send({ error: "ModelsLab API error" });
    }

    let mlResult = await mlResponse.json() as {
      status: string;
      output?: string[];
      fetch_result?: string;
      eta?: number;
    };

    // 2. Если статус "processing" — поллить fetch_result
    if (mlResult.status === "processing" && mlResult.fetch_result) {
      const fetchUrl = mlResult.fetch_result;
      const maxAttempts = 20; // 20 * 3s = 60 секунд максимум
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const pollResponse = await fetch(fetchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: apiKey }),
        });

        if (!pollResponse.ok) {
          logger.warn({ status: pollResponse.status, attempt: i }, "modelslab_poll_error");
          continue;
        }

        const pollResult = await pollResponse.json() as {
          status: string;
          output?: string[];
        };

        if (pollResult.status === "success" && pollResult.output?.length) {
          mlResult = pollResult;
          break;
        }

        if (pollResult.status === "failed") {
          return reply.status(502).send({ error: "Image generation failed" });
        }
      }
    }

    // 3. Проверяем наличие результата
    if (mlResult.status !== "success" || !mlResult.output?.length) {
      return reply.status(502).send({ error: "Image generation timed out or failed" });
    }

    const imageUrl = mlResult.output[0];
    logger.info({ imageUrl }, "image_url_received");

    // 4. Скачиваем изображение (с retry — CDN может быть не сразу готов)
    let imageResponse: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      try {
        imageResponse = await fetch(imageUrl);
        if (imageResponse.ok) break;
        logger.warn({ status: imageResponse.status, attempt, imageUrl }, "image_download_retry");
      } catch (dlErr: any) {
        logger.warn({ err: dlErr.message, attempt, imageUrl }, "image_download_fetch_error");
      }
    }

    if (!imageResponse || !imageResponse.ok) {
      logger.error({ imageUrl, status: imageResponse?.status }, "image_download_failed");
      return reply.status(502).send({ error: "Failed to download generated image" });
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    // 5. Загружаем в S3
    const s3 = createS3Client();
    const bucket = env.S3_BUCKET || "media";

    if (s3) {
      const key = `images/${randomUUID()}.png`;
      try {
        const url = await uploadToS3(s3, bucket, key, imageBuffer, "image/png");
        logger.info({ key, modelId }, "image_uploaded_to_s3");
        return reply.send({ url });
      } catch (s3Err: any) {
        logger.warn({ err: s3Err }, "image_s3_upload_failed");
      }
    }

    // Fallback: вернуть оригинальный URL если S3 не настроен
    return reply.send({ url: imageUrl });
  } catch (err: any) {
    logger.error({ err }, "image_generation_error");
    return reply.status(502).send({ error: "Image generation failed", details: err.message });
  }
});

// ─── Video Generation ────────────────────────────────────────────────────────

/**
 * Тело запроса для генерации видео.
 */
interface VideoGenerateBody {
  /** Текстовый промпт для генерации */
  prompt: string;
  /** Негативный промпт */
  negativePrompt?: string;
  /** ID модели для видео */
  model?: string;
  /** Ширина видео в пикселях */
  width?: number;
  /** Высота видео в пикселях */
  height?: number;
  /** Провайдер: "modelslab" | "atlascloud" */
  provider?: string;
}

/**
 * Генерация видео через ModelsLab text2video API.
 * Возвращает URL готового видео.
 */
async function generateVideoModelsLab(params: {
  apiKey: string;
  modelId: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
}): Promise<{ url: string }> {
  const { apiKey, modelId, prompt, negativePrompt, width, height } = params;

  const mlResponse = await fetch("https://modelslab.com/api/v6/video/text2video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: apiKey,
      model_id: modelId,
      prompt,
      negative_prompt: negativePrompt,
      width,
      height,
      num_frames: 16,
      num_inference_steps: 20,
      guidance_scale: 7,
      output_type: "mp4",
      safety_checker: false,
      safety_checker_type: "none",
      seed: null,
    }),
  });

  if (!mlResponse.ok) {
    const errBody = await mlResponse.text();
    logger.error({ status: mlResponse.status, body: errBody }, "modelslab_video_api_error");
    throw new Error("ModelsLab Video API error");
  }

  let mlResult = await mlResponse.json() as {
    status: string;
    output?: string[];
    fetch_result?: string;
    future_links?: string[];
    eta?: number;
    id?: number;
    messege?: string;
  };

  logger.info({ status: mlResult.status, eta: mlResult.eta, hasOutput: !!mlResult.output?.length, fetchResult: mlResult.fetch_result, futureLinks: mlResult.future_links, id: mlResult.id, messege: mlResult.messege }, "modelslab_video_initial_response");

  const fetchUrl = mlResult.fetch_result
    || (mlResult.id ? `https://modelslab.com/api/v6/video/fetch/${mlResult.id}` : null);

  if ((mlResult.status === "processing" || mlResult.status === "queued") && fetchUrl) {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const pollResponse = await fetch(fetchUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: apiKey }),
      });

      if (!pollResponse.ok) {
        logger.warn({ status: pollResponse.status, attempt: i }, "modelslab_video_poll_error");
        continue;
      }

      const pollResult = await pollResponse.json() as {
        status: string;
        output?: string[];
        future_links?: string[];
      };

      logger.info({ status: pollResult.status, hasOutput: !!pollResult.output?.length, attempt: i }, "modelslab_video_poll_result");

      if (pollResult.status === "success" && pollResult.output?.length) {
        mlResult = pollResult;
        break;
      }

      if (pollResult.status === "success" && pollResult.future_links?.length) {
        mlResult = { ...pollResult, output: pollResult.future_links };
        break;
      }

      if (pollResult.status === "failed" || pollResult.status === "error") {
        logger.error({ pollResult }, "modelslab_video_generation_failed");
        throw new Error("Video generation failed");
      }
    }
  }

  const outputUrls = mlResult.output || (mlResult as any).future_links;
  if (mlResult.status !== "success" || !outputUrls?.length) {
    logger.error({ finalStatus: mlResult.status, mlResult }, "modelslab_video_no_output");
    throw new Error("Video generation timed out or failed");
  }

  return { url: outputUrls[0] };
}

/**
 * Генерация видео через Atlas Cloud API.
 * Поддерживает NSFW модели (spicy).
 */
async function generateVideoAtlasCloud(params: {
  apiKey: string;
  modelId: string;
  prompt: string;
  width: number;
  height: number;
}): Promise<{ url: string }> {
  const { apiKey, modelId, prompt, width, height } = params;

  const response = await fetch("https://api.atlascloud.ai/api/v1/model/generateVideo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      prompt,
      width,
      height,
      duration: 5,
      fps: 24,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    logger.error({ status: response.status, body: errBody }, "atlascloud_video_api_error");
    throw new Error("Atlas Cloud Video API error");
  }

  const result = await response.json() as {
    id: string;
    status: string;
    urls?: { get: string };
    outputs?: string[];
  };

  logger.info({ id: result.id, status: result.status }, "atlascloud_video_initial_response");

  const predictionId = result.id;
  if (!predictionId) {
    throw new Error("Atlas Cloud did not return a prediction ID");
  }

  // Поллим статус до завершен��я
  const pollUrl = result.urls?.get || `https://api.atlascloud.ai/api/v1/model/prediction/${predictionId}`;
  const maxAttempts = 120; // 120 * 5s = 600 секунд максимум
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const pollResponse = await fetch(pollUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!pollResponse.ok) {
      logger.warn({ status: pollResponse.status, attempt: i }, "atlascloud_video_poll_error");
      continue;
    }

    const pollResult = await pollResponse.json() as {
      id: string;
      status: string;
      outputs?: string[];
      output?: { video?: string };
    };

    logger.info({ status: pollResult.status, hasOutputs: !!pollResult.outputs?.length, attempt: i }, "atlascloud_video_poll_result");

    if (pollResult.status === "completed" || pollResult.status === "succeeded") {
      const videoUrl = pollResult.outputs?.[0] || pollResult.output?.video;
      if (videoUrl) {
        return { url: videoUrl };
      }
    }

    if (pollResult.status === "failed" || pollResult.status === "error" || pollResult.status === "canceled") {
      logger.error({ pollResult }, "atlascloud_video_generation_failed");
      throw new Error("Atlas Cloud video generation failed");
    }
  }

  throw new Error("Atlas Cloud video generation timed out");
}

/**
 * Скачивает видео по URL и загружает в S3.
 * Возвращает S3 URL или оригинальный URL как fallback.
 */
async function downloadAndUploadVideo(videoUrl: string): Promise<string> {
  logger.info({ videoUrl }, "video_url_received");

  let videoResponse: Response | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const delay = attempt === 0 ? 10000 : 5000;
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      videoResponse = await fetch(videoUrl);
      if (videoResponse.ok) break;
      logger.warn({ status: videoResponse.status, attempt, videoUrl }, "video_download_retry");
    } catch (dlErr: any) {
      logger.warn({ err: dlErr.message, attempt, videoUrl }, "video_download_fetch_error");
    }
  }

  if (!videoResponse || !videoResponse.ok) {
    logger.warn({ videoUrl, status: videoResponse?.status }, "video_download_failed_returning_direct_url");
    return videoUrl;
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

  const s3 = createS3Client();
  const bucket = env.S3_BUCKET || "media";

  if (s3) {
    const key = `videos/${randomUUID()}.mp4`;
    try {
      const url = await uploadToS3(s3, bucket, key, videoBuffer, "video/mp4");
      logger.info({ key }, "video_uploaded_to_s3");
      return url;
    } catch (s3Err: any) {
      logger.warn({ err: s3Err }, "video_s3_upload_failed");
    }
  }

  return videoUrl;
}

/**
 * POST /ai/video/generate
 *
 * Генерирует видео через ModelsLab или Atlas Cloud и загружает результат в S3.
 * Роутинг по провайдеру: "atlascloud" для NSFW моделей, "modelslab" по умолчанию.
 */
app.post<{ Body: VideoGenerateBody }>("/ai/video/generate", async (req, reply) => {
  const { prompt, negativePrompt, model, width, height, provider } = req.body;

  if (!prompt) {
    return reply.status(400).send({ error: "prompt is required" });
  }

  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch (err) {
    logger.error({ err }, "failed_to_fetch_settings_video");
    return reply.status(503).send({ error: "Failed to fetch AI settings" });
  }

  const vidWidth = width || 512;
  const vidHeight = height || 512;

  try {
    let videoResult: { url: string };

    if (provider === "atlascloud") {
      const apiKey = settings.ATLASCLOUD_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({ error: "Atlas Cloud API key not configured" });
      }
      const modelId = model || "wan-2.2-t2v-spicy";
      logger.info({ modelId, provider: "atlascloud" }, "video_generation_start");

      videoResult = await generateVideoAtlasCloud({
        apiKey,
        modelId,
        prompt,
        width: vidWidth,
        height: vidHeight,
      });
    } else {
      const apiKey = settings.MODELSLAB_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({ error: "ModelsLab API key not configured" });
      }
      const modelId = model || settings.MODELSLAB_DEFAULT_VIDEO_MODEL || "wan2.1";
      logger.info({ modelId, provider: "modelslab" }, "video_generation_start");

      videoResult = await generateVideoModelsLab({
        apiKey,
        modelId,
        prompt,
        negativePrompt: negativePrompt || "",
        width: vidWidth,
        height: vidHeight,
      });
    }

    const finalUrl = await downloadAndUploadVideo(videoResult.url);
    return reply.send({ url: finalUrl });
  } catch (err: any) {
    logger.error({ err, provider }, "video_generation_error");
    return reply.status(502).send({ error: "Video generation failed", details: err.message });
  }
});

// ─── Translate ──────────────────────────────────────────────────────────────

/** Маппинг названий языков → ISO 639-1 коды для google-translate-api */
const LANG_MAP: Record<string, string> = {
  english: "en",
  russian: "ru",
  spanish: "es",
  french: "fr",
  german: "de",
  chinese: "zh-CN",
  japanese: "ja",
  korean: "ko",
};

/**
 * POST /ai/translate
 * Переводит текст на указанный язык через Google Translate (дословный перевод без цензуры).
 * Fallback на OpenAI если Google Translate недоступен.
 * Используется для перевода пользовательских промптов перед генерацией изображений/видео.
 */
app.post<{ Body: { text: string; targetLang: string } }>("/ai/translate", async (req, reply) => {
  const requestId = getRequestId(req.raw, env.REQUEST_ID_HEADER);
  const { text, targetLang } = req.body;

  if (!text || !targetLang) {
    return reply.status(400).send({ error: "text and targetLang are required" });
  }

  logger.info({ requestId, targetLang, textLength: text.length }, "translate_start");

  const targetCode = LANG_MAP[targetLang.toLowerCase()] || targetLang;

  // Основной перевод — Google Translate (дословный, без фильтрации контента)
  try {
    const result = await googleTranslate(text, { to: targetCode });
    logger.info({ requestId }, "translate_done_google");
    return reply.send({ translated: result.text });
  } catch (googleErr: any) {
    logger.warn({ err: googleErr, requestId }, "translate_google_failed_trying_openai");
  }

  // Fallback — OpenAI (если Google Translate упал)
  let settings: Record<string, string>;
  try {
    settings = await fetchSettings();
  } catch (err) {
    logger.error({ err, requestId }, "translate_fallback_settings_error");
    return reply.status(502).send({ error: "Translation failed and settings unavailable" });
  }

  const apiKey = settings.OPENAI_API_KEY;
  if (!apiKey) {
    logger.error({ requestId }, "translate_no_fallback_api_key");
    return reply.status(502).send({ error: "Translation failed and no OpenAI fallback available" });
  }

  try {
    const openai = createOpenAIClient(apiKey);
    const model = settings.OPENAI_MODEL || "gpt-4o";
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `Translate the following text to ${targetLang}. Return ONLY the translated text.`,
        },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    });
    const translated = response.choices[0]?.message?.content?.trim() || text;
    logger.info({ requestId }, "translate_done_openai_fallback");
    return reply.send({ translated });
  } catch (openaiErr: any) {
    logger.error({ err: openaiErr, requestId }, "translate_fallback_error");
    return reply.status(502).send({ error: "Translation failed", details: openaiErr.message });
  }
});

// ─── Start Server ────────────────────────────────────────────────────────────

// 0.0.0.0 — слушаем на всех интерфейсах (обязательно для Docker)
app.listen({ port: env.AI_PORT, host: "0.0.0.0" })
  .then(() => logger.info({ port: env.AI_PORT }, "ai_started"))
  .catch((err) => {
    logger.error({ err }, "ai_failed_to_start");
    process.exit(1); // Код 1 → Docker/k8s перезапустит контейнер
  });
