/**
 * @file queue.types.ts
 * @description Общие типы и константы BullMQ-очереди, используемые API (producer) и Worker (consumer).
 *
 * Этот файл является единым источником истины для названий очередей и заданий.
 * Импортируется как в API (apps/api) для постановки заданий в очередь,
 * так и в Worker (apps/worker) для обработки заданий.
 *
 * Архитектура очереди:
 * - Одна очередь: QUEUE_NAME = "ai-jobs"
 * - Три типа заданий: ai:chat, ai:stt, ai:tts
 * - Producer: ChatsController (postановка задания при SSE-запросах)
 * - Consumer: Worker (apps/worker/src/index.ts)
 *
 * Жизненный цикл задания:
 * 1. API создаёт AiJob в БД (status: "pending")
 * 2. API ставит задание в BullMQ
 * 3. Worker получает задание, вызывает AI-сервис
 * 4. Worker обновляет AiJob через internal API (status: "completed" | "failed")
 */

// Имя очереди BullMQ (используется для создания и чтения очереди в Redis)
export const QUEUE_NAME = "ai-jobs";

/**
 * Названия заданий BullMQ.
 * Используются при добавлении задания в очередь (.add(JOB_NAMES.CHAT, data))
 * и при роутинге в worker (.process(JOB_NAMES.CHAT, handler)).
 */
export const JOB_NAMES = {
  /** Задание на генерацию текстового ответа AI (OpenAI Chat Completions) */
  CHAT: "ai:chat",
  /** Задание на Speech-to-Text (распознавание голоса через OpenAI Whisper) */
  STT: "ai:stt",
  /** Задание на Text-to-Speech (синтез речи через ElevenLabs) */
  TTS: "ai:tts",
  /** Задание на генерацию изображения (ModelsLab API) */
  IMAGE: "ai:image",
  /** Задание на генерацию видео (ModelsLab API) */
  VIDEO: "ai:video",
} as const;

/** Тип-объединение всех возможных названий заданий */
export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

// ─── Payload типы для каждого задания ──────────────────────────────────────

/**
 * Данные задания для генерации AI-ответа в чате (ai:chat).
 * Worker вызывает AI-сервис и сохраняет ответ как Message в чате.
 */
export interface ChatJobData {
  /** ID записи AiJob в PostgreSQL (для обновления статуса через internal API) */
  jobId: string;
  /** ID пользователя (для логов и аудита) */
  userId: string;
  /** ID сессии чата (для сохранения ответа) */
  chatSessionId: string;
  /** ID персонажа (для загрузки systemPrompt) */
  characterId: string;
  /**
   * История сообщений для контекста LLM.
   * Передаётся напрямую в OpenAI messages array.
   */
  messages: { role: string; content: string }[];
}

/**
 * Данные задания для распознавания речи (ai:stt).
 * Worker отправляет аудио в AI-сервис (Whisper), получает транскрипцию
 * и сохраняет её как Message в чате.
 */
export interface SttJobData {
  /** ID записи AiJob (для обновления статуса) */
  jobId: string;
  /** ID пользователя */
  userId: string;
  /** ID сессии чата (куда сохранить транскрибированное сообщение) */
  chatSessionId: string;
  /** Аудиофайл в формате base64 */
  audioBase64: string;
  /** MIME-тип аудио (например "audio/webm", "audio/mp4") */
  mimeType: string;
  /** Имя файла (для OpenAI API, определяет формат) */
  filename: string;
}

/**
 * Данные задания для синтеза речи (ai:tts).
 * Worker вызывает ElevenLabs API, сохраняет mp3 в S3 и обновляет Message.mediaUrl.
 */
export interface TtsJobData {
  /** ID записи AiJob (для обновления статуса) */
  jobId: string;
  /** ID пользователя */
  userId: string;
  /** ID сообщения, для которого нужен голос (будет обновлён mediaUrl) */
  messageId: string;
  /** Текст для синтеза речи */
  text: string;
  /**
   * ID голоса ElevenLabs (опционально).
   * Берётся из Character.voiceId; если не задан — используется дефолтный голос.
   */
  voiceId?: string;
}

/**
 * Данные задания для генерации изображения (ai:image).
 * Worker вызывает AI-сервис (ModelsLab), получает URL изображения и сохраняет в AiJob.output.
 */
export interface ImageJobData {
  /** ID записи AiJob в PostgreSQL (для обновления статуса через internal API) */
  jobId: string;
  /** ID пользователя (для логов и аудита) */
  userId: string;
  /** Текстовый промпт для генерации изображения */
  prompt: string;
  /** Негативный промпт (что НЕ должно быть на изображении) */
  negativePrompt?: string;
  /** Соотношение сторон: "1:1" | "4:5" | "5:4" | "9:16" | "16:9" */
  aspectRatio?: string;
  /** ID модели: realistic-vision-v51 | sdxl | juggernaut-xl | flux | atlascloud/wan-2.6/text-to-image */
  model?: string;
  /** Провайдер генерации: "modelslab" | "atlascloud" | "civitai" */
  provider?: string;
  /** Стиль генерации для Civitai: "realism" | "mistoon" | "wai-ill" | "furry" */
  generationStyle?: string;
  /** Публичный URL исходного изображения (фото персонажа) для режима img2img. */
  initImageUrl?: string;
  /** Seed генерации; если задан — прокидывается до провайдера для воспроизводимости. */
  seed?: number;
  /** Режим контента: "nsfw" | "sfw". Определяет набор промпт-тегов и негатива. */
  contentMode?: "nsfw" | "sfw";
  /** Сила изменения img2img (0..1). Ниже — ближе к аватару, выше — свободнее поза/сцена. */
  denoise?: number;
  /** Движок identity: "sdxl" (обычный путь) | "kontext" (Flux Kontext). Per-request
   *  перекрывает глобальный KONTEXT_ENABLED в AI-сервисе. */
  engine?: "sdxl" | "kontext";
}

/**
 * Данные задания для генерации видео (ai:video).
 * Worker вызывает AI-сервис (ModelsLab text2video), получает URL видео и сохраняет в AiJob.output.
 */
export interface VideoJobData {
  /** ID записи AiJob в PostgreSQL (для обновления статуса через internal API) */
  jobId: string;
  /** ID пользователя (для логов и аудита) */
  userId: string;
  /** Текстовый промпт для генерации видео */
  prompt: string;
  /** Негативный промпт (что НЕ должно быть в видео) */
  negativePrompt?: string;
  /** Соотношение сторон: "1:1" | "4:5" | "5:4" | "9:16" | "16:9" */
  aspectRatio?: string;
  /** ID модели для видео */
  model?: string;
  /** Провайдер генерации: "modelslab" | "atlascloud" */
  provider?: string;
  /** Режим генерации: "scratch" | "img2vid" | "continue" */
  mode?: string;
  /** S3-ключ исходного изображения (режим img2vid) */
  initImageKey?: string;
  /** S3-ключ исходного видео (режим continue) */
  initVideoKey?: string;
  /** Seed генерации; если задан — прокидывается до провайдера для воспроизводимости. */
  seed?: number;
  /** Режим контента: "nsfw" | "sfw". Определяет набор промпт-тегов и негатива. */
  contentMode?: "nsfw" | "sfw";
}

/** Объединённый тип payload для всех заданий очереди */
export type AiJobData = ChatJobData | SttJobData | TtsJobData | ImageJobData | VideoJobData;

/**
 * Результат выполнения задания, записываемый в AiJob.output.
 * Возвращается worker-ом и сохраняется через internal API.
 */
export interface JobResult {
  /** Успешно ли выполнено задание */
  ok: boolean;
  /** Результат задания (транскрипция, mediaUrl и т.д.) */
  output?: Record<string, unknown>;
  /** Количество использованных токенов (только для chat) */
  tokensUsed?: number;
  /** Сообщение об ошибке при ok=false */
  error?: string;
}
