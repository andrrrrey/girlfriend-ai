/**
 * @file pricing.ts
 * @description Таблица цен AI-операций в кредитах и расчёт стоимости операции.
 *
 * Чистые функции без зависимостей — их используют PricingService, тесты и
 * (в будущем) Telegram-адаптер для показа цены перед дорогой операцией.
 */

/** Цены в целых кредитах. */
export interface PriceItems {
  /** Ответ персонажа на сообщение (текст или голос). */
  chat_message: number;
  /** Первое приветствие персонажа (запускается автоматически — обычно 0). */
  chat_greeting: number;
  /** Распознавание одного голосового сообщения. */
  stt_message: number;
  /** Озвучка: цена за каждые начатые 1000 символов. */
  tts_per_1k_chars: number;
  /** Генерация одного изображения (по умолчанию для всех моделей). */
  image: number;
  /** Надбавка за hires fix (апскейл) к цене изображения. */
  image_hires_extra: number;
  /** Генерация одного видео (по умолчанию для всех моделей). */
  video: number;
  /** Цены изображений для конкретных моделей: { "<modelId>": цена }. */
  image_models: Record<string, number>;
  /** Цены видео для конкретных моделей: { "<modelId>": цена }. */
  video_models: Record<string, number>;
}

/** Цены по умолчанию — пока в админке не сохранена своя таблица. */
export const DEFAULT_PRICES: PriceItems = {
  chat_message: 1,
  chat_greeting: 0,
  stt_message: 1,
  tts_per_1k_chars: 2,
  image: 5,
  image_hires_extra: 3,
  video: 30,
  image_models: {},
  video_models: {},
};

/** Операция, за которую списываются кредиты. */
export type BillableOperation =
  | { kind: "chat_message" }
  | { kind: "chat_greeting" }
  | { kind: "stt" }
  | { kind: "tts"; characters: number }
  | { kind: "image"; model?: string; hiresFix?: boolean }
  | { kind: "video"; model?: string };

/** Имя операции для резерва/журнала. */
export type OperationName = BillableOperation["kind"];

/** Неотрицательное целое (некорректное значение → fallback). */
function toPrice(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function toModelPrices(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [model, price] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(price);
    if (Number.isFinite(n) && n >= 0) out[model] = Math.round(n);
  }
  return out;
}

/**
 * Нормализует таблицу цен из БД/админки: недостающие и некорректные поля
 * заменяются значениями по умолчанию, лишние поля отбрасываются.
 */
export function normalizePrices(raw: unknown): PriceItems {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    chat_message: toPrice(src.chat_message, DEFAULT_PRICES.chat_message),
    chat_greeting: toPrice(src.chat_greeting, DEFAULT_PRICES.chat_greeting),
    stt_message: toPrice(src.stt_message, DEFAULT_PRICES.stt_message),
    tts_per_1k_chars: toPrice(src.tts_per_1k_chars, DEFAULT_PRICES.tts_per_1k_chars),
    image: toPrice(src.image, DEFAULT_PRICES.image),
    image_hires_extra: toPrice(src.image_hires_extra, DEFAULT_PRICES.image_hires_extra),
    video: toPrice(src.video, DEFAULT_PRICES.video),
    image_models: toModelPrices(src.image_models),
    video_models: toModelPrices(src.video_models),
  };
}

/** Стоимость операции в кредитах по таблице цен. */
export function quote(prices: PriceItems, op: BillableOperation): number {
  switch (op.kind) {
    case "chat_message":
      return prices.chat_message;
    case "chat_greeting":
      return prices.chat_greeting;
    case "stt":
      return prices.stt_message;
    case "tts":
      return Math.max(1, Math.ceil(Math.max(0, op.characters) / 1000)) * prices.tts_per_1k_chars;
    case "image":
      return modelPrice(prices.image_models, op.model, prices.image) + (op.hiresFix ? prices.image_hires_extra : 0);
    case "video":
      return modelPrice(prices.video_models, op.model, prices.video);
  }
}

/** Цена конкретной модели, если задана, иначе цена по умолчанию. */
function modelPrice(models: Record<string, number>, model: string | undefined, fallback: number): number {
  return model && Object.prototype.hasOwnProperty.call(models, model) ? models[model] : fallback;
}
