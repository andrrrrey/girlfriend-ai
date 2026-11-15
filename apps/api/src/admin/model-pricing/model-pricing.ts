/**
 * @file model-pricing.ts
 * @description Себестоимость моделей нейросетей (USD) для раздела «Расходы»:
 * формат хранения, разбор каталогов цен провайдеров и сопоставление моделей.
 *
 * Чистые функции без зависимостей — их используют ModelPricingService и тесты.
 *
 * Хранение (AppSetting):
 * - `MODEL_PRICING`      — `{ "<model>": число }` — основная цена модели. Для чата —
 *                          цена входных токенов за 1M, для озвучки — за 1000 символов,
 *                          для распознавания — за минуту, для картинок/видео — за генерацию.
 *                          Формат не меняется (обратная совместимость).
 * - `MODEL_PRICING_META` — `{ "<model>": ModelPriceMeta }` — откуда цена, когда обновлена,
 *                          зафиксирована ли вручную, цена выходных токенов (чат).
 *
 * Автозагрузка: цены есть в открытых JSON-API только у OpenRouter (чат) и Atlas Cloud
 * (изображения/видео wan/van). ModelsLab, Civitai, ElevenLabs и OpenAI публикуют цены
 * только на страницах тарифов и зависят от плана — такие модели остаются с ручной ценой.
 */

/** Ключи настроек. */
export const MODEL_PRICING_KEY = "MODEL_PRICING";
export const MODEL_PRICING_META_KEY = "MODEL_PRICING_META";

/** Источник цены модели. */
export type PriceSource = "manual" | "default" | "openrouter" | "atlascloud";

/** Метаданные цены модели. */
export interface ModelPriceMeta {
  /** Откуда взята текущая цена. */
  source: PriceSource;
  /** Когда цена последний раз менялась/подтверждалась (ISO). */
  updatedAt?: string;
  /** Зафиксирована вручную — автообновление её не трогает. */
  locked?: boolean;
  /** Цена выходных токенов за 1M (только чат). */
  outputPrice?: number;
  /** Пояснение к цене (например «0.068 $/сек × 5 сек»). */
  note?: string;
  /** Последняя ошибка автообновления (модель не найдена у провайдера и т.п.). */
  lastError?: string;
  /** Когда была последняя попытка автообновления (ISO). */
  checkedAt?: string;
}

/** Цена модели, найденная в каталоге провайдера. */
export interface FetchedPrice {
  source: Exclude<PriceSource, "manual" | "default">;
  /** Основная цена (см. MODEL_PRICING). */
  price: number;
  /** Цена выходных токенов за 1M (чат). */
  outputPrice?: number;
  note?: string;
}

/** Цена модели OpenRouter: USD за 1M токенов. */
export interface OpenRouterPrice {
  inputPer1M: number;
  outputPer1M: number;
}

/** Цена модели Atlas Cloud. */
export interface AtlasPrice {
  type: string;
  /** Базовая цена (USD). */
  basePrice?: number;
  /** Единица базовой цены: "second" | "image" | ... (не всегда указана). */
  unit?: string;
  /** Для текстовых моделей — USD за 1M токенов. */
  inputPer1M?: number;
  outputPer1M?: number;
}

/**
 * Длительность видео по умолчанию (сек). Atlas Cloud тарифицирует видео посекундно
 * с минимумом 5 секунд, а AI-сервис генерирует 5-секундные ролики, если длительность
 * не указана, поэтому цена «за генерацию» = цена за секунду × 5.
 */
export const DEFAULT_VIDEO_SECONDS = 5;

/** Тип операции → модели с ценой по умолчанию (USD), пока нет сохранённой/загруженной. */
export interface DefaultModelPrice {
  type: "image" | "video" | "tts" | "stt" | "chat";
  price: number;
  outputPrice?: number;
}

/**
 * Цены по умолчанию — оценки по тарифам провайдеров. Используются, пока
 * администратор не сохранил свою цену и автозагрузка её не нашла.
 * ModelsLab: SD1.5 ~$0.002/img, SDXL/Flux ~$0.004/img; Civitai ~$0.005/img;
 * Atlas Cloud видео ~$0.07/сек × 5 сек; ElevenLabs ≈ $0.2/1k симв.; Whisper $0.006/мин;
 * ModelsLab LLM ~$0.2/1M токенов; minimax на OpenRouter ~$0.3 вход / $1.2 выход за 1M.
 */
export const DEFAULT_MODEL_PRICES: Record<string, DefaultModelPrice> = {
  "realistic-vision-v51": { type: "image", price: 0.002 },
  sdxl: { type: "image", price: 0.004 },
  "juggernaut-xl": { type: "image", price: 0.004 },
  flux: { type: "image", price: 0.004 },
  "alibaba/wan-2.6/text-to-image": { type: "image", price: 0.021 },
  civitai: { type: "image", price: 0.005 },
  "atlascloud/van-2.6/text-to-video": { type: "video", price: 0.35 },
  "atlascloud/wan-2.6-spicy/image-to-video": { type: "video", price: 0.35 },
  "alibaba/wan-2.7/image-to-video": { type: "video", price: 0.5 },
  eleven_multilingual_v2: { type: "tts", price: 0.2 },
  "whisper-1": { type: "stt", price: 0.006 },
  "llama-3.1-8b-uncensored": { type: "chat", price: 0.2, outputPrice: 0.2 },
  "minimax/minimax-m2-her": { type: "chat", price: 0.3, outputPrice: 1.2 },
};

/** Тип операции для модели без истории генераций (по известным спискам). */
export function guessModelType(model: string): string | undefined {
  if (DEFAULT_MODEL_PRICES[model]) return DEFAULT_MODEL_PRICES[model].type;
  if (/^eleven_/.test(model)) return "tts";
  if (/whisper|transcribe/.test(model)) return "stt";
  if (/^urn:air:/i.test(model)) return "image";
  if (/text-to-video|image-to-video|video-to-video/.test(model)) return "video";
  if (/text-to-image|image-edit/.test(model)) return "image";
  if (/llama|minimax|mistral|qwen|gpt|claude|gemini|deepseek|hermes|uncensored/i.test(model)) return "chat";
  return undefined;
}

/** Неотрицательное конечное число или undefined. */
function toNum(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Округление до 6 знаков, чтобы не тащить в админку 0.30000000000000004. */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Разбирает ответ `GET https://openrouter.ai/api/v1/models`.
 * Цены там в USD за 1 токен строками (`"0.0000003"`) — переводим в USD за 1M.
 */
export function parseOpenRouterCatalog(json: unknown): Map<string, OpenRouterPrice> {
  const out = new Map<string, OpenRouterPrice>();
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("OpenRouter: неожиданный формат ответа (нет data[])");
  for (const m of data) {
    const id = typeof m?.id === "string" ? m.id : null;
    const prompt = toNum(m?.pricing?.prompt);
    const completion = toNum(m?.pricing?.completion);
    if (!id || prompt === undefined || completion === undefined) continue;
    out.set(id, { inputPer1M: round6(prompt * 1e6), outputPer1M: round6(completion * 1e6) });
  }
  return out;
}

/**
 * Разбирает ответ `GET https://api.atlascloud.ai/api/v1/models`.
 * Берётся фактическая цена со скидкой (`price.actual`), а не исходная (`price.origin`).
 */
export function parseAtlasCatalog(json: unknown): Map<string, AtlasPrice> {
  const out = new Map<string, AtlasPrice>();
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("Atlas Cloud: неожиданный формат ответа (нет data[])");
  for (const m of data) {
    const id = typeof m?.model === "string" ? m.model : null;
    const actual = m?.price?.actual ?? m?.price?.origin;
    if (!id || !actual || typeof actual !== "object") continue;
    const price: AtlasPrice = {
      type: String(m?.type ?? ""),
      basePrice: toNum(actual.base_price),
      unit: typeof actual.unit === "string" ? actual.unit : undefined,
      inputPer1M: toNum(actual.input_price),
      outputPer1M: toNum(actual.output_price),
    };
    if (price.basePrice === undefined && price.inputPer1M === undefined) continue;
    out.set(id, price);
  }
  return out;
}

/** Каталоги цен, загруженные с провайдеров (null — каталог недоступен). */
export interface PriceCatalogs {
  openrouter: Map<string, OpenRouterPrice> | null;
  atlascloud: Map<string, AtlasPrice> | null;
}

/**
 * Находит цену модели в каталогах провайдеров.
 *
 * @param model — id модели, как он записан в ai_jobs.input.model
 * @param type  — тип операции: "chat" | "image" | "video" | "tts" | "stt"
 * @returns цену или причину, почему её нет
 */
export function resolveModelPrice(
  model: string,
  type: string,
  catalogs: PriceCatalogs,
): { ok: true; price: FetchedPrice } | { ok: false; reason: string } {
  if (type === "chat") {
    const or = catalogs.openrouter?.get(model);
    if (or) {
      return {
        ok: true,
        price: {
          source: "openrouter",
          price: or.inputPer1M,
          outputPrice: or.outputPer1M,
          note: `вход $${or.inputPer1M} / выход $${or.outputPer1M} за 1M токенов`,
        },
      };
    }
    const atlas = catalogs.atlascloud?.get(model);
    if (atlas?.inputPer1M !== undefined) {
      return {
        ok: true,
        price: {
          source: "atlascloud",
          price: atlas.inputPer1M,
          outputPrice: atlas.outputPer1M,
          note: `вход $${atlas.inputPer1M} / выход $${atlas.outputPer1M ?? atlas.inputPer1M} за 1M токенов`,
        },
      };
    }
    if (!catalogs.openrouter && !catalogs.atlascloud) return { ok: false, reason: "каталоги провайдеров недоступны" };
    return { ok: false, reason: "модели нет в каталогах OpenRouter/Atlas Cloud — цена задаётся вручную" };
  }

  if (type === "image" || type === "video") {
    const atlas = catalogs.atlascloud?.get(model);
    if (!atlas || atlas.basePrice === undefined) {
      if (!catalogs.atlascloud) return { ok: false, reason: "каталог Atlas Cloud недоступен" };
      return { ok: false, reason: "модели нет в каталоге Atlas Cloud — цена задаётся вручную" };
    }
    // Видео в Atlas тарифицируется посекундно (unit "second" или без unit).
    const perSecond = type === "video" && (!atlas.unit || atlas.unit === "second");
    if (perSecond) {
      return {
        ok: true,
        price: {
          source: "atlascloud",
          price: round6(atlas.basePrice * DEFAULT_VIDEO_SECONDS),
          note: `$${atlas.basePrice}/сек × ${DEFAULT_VIDEO_SECONDS} сек`,
        },
      };
    }
    if (atlas.unit && atlas.unit !== "image" && atlas.unit !== "generation" && atlas.unit !== "request") {
      return { ok: false, reason: `неизвестная единица цены Atlas Cloud: «${atlas.unit}»` };
    }
    return { ok: true, price: { source: "atlascloud", price: atlas.basePrice, note: `$${atlas.basePrice} за генерацию` } };
  }

  return { ok: false, reason: "у провайдера нет API цен — цена задаётся вручную" };
}

/** Безопасный разбор JSON-настройки в объект. */
export function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const v = JSON.parse(value);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Нормализует MODEL_PRICING: только неотрицательные числа. */
export function normalizePriceMap(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [model, v] of Object.entries(raw)) {
    const n = toNum(v);
    if (model && n !== undefined) out[model] = n;
  }
  return out;
}

/** Нормализует MODEL_PRICING_META. */
export function normalizeMetaMap(raw: Record<string, unknown>): Record<string, ModelPriceMeta> {
  const out: Record<string, ModelPriceMeta> = {};
  const sources: PriceSource[] = ["manual", "default", "openrouter", "atlascloud"];
  for (const [model, v] of Object.entries(raw)) {
    if (!v || typeof v !== "object") continue;
    const m = v as Record<string, unknown>;
    const source = sources.includes(m.source as PriceSource) ? (m.source as PriceSource) : "manual";
    const meta: ModelPriceMeta = { source };
    if (typeof m.updatedAt === "string") meta.updatedAt = m.updatedAt;
    if (m.locked === true) meta.locked = true;
    const outputPrice = toNum(m.outputPrice);
    if (outputPrice !== undefined) meta.outputPrice = outputPrice;
    if (typeof m.note === "string") meta.note = m.note;
    if (typeof m.lastError === "string") meta.lastError = m.lastError;
    if (typeof m.checkedAt === "string") meta.checkedAt = m.checkedAt;
    out[model] = meta;
  }
  return out;
}

/** Результат автообновления по одной модели. */
export interface RefreshItem {
  model: string;
  type: string;
  status: "updated" | "unchanged" | "locked" | "not_found";
  oldPrice?: number;
  newPrice?: number;
  source?: PriceSource;
  reason?: string;
}

/**
 * Применяет найденные цены к текущим ценам. Зафиксированные модели не меняются.
 * Модели, которых нет у провайдеров, сохраняют прежнюю цену и получают lastError.
 *
 * @param models — модели с типами операций, для которых нужна цена
 * @param now    — время обновления (ISO)
 */
export function applyCatalogPrices(
  prices: Record<string, number>,
  meta: Record<string, ModelPriceMeta>,
  models: { model: string; type: string }[],
  catalogs: PriceCatalogs,
  now: string,
): { prices: Record<string, number>; meta: Record<string, ModelPriceMeta>; items: RefreshItem[] } {
  const nextPrices = { ...prices };
  const nextMeta: Record<string, ModelPriceMeta> = { ...meta };
  const items: RefreshItem[] = [];

  for (const { model, type } of models) {
    const current = nextMeta[model];
    if (current?.locked) {
      items.push({ model, type, status: "locked", oldPrice: prices[model] });
      continue;
    }
    const found = resolveModelPrice(model, type, catalogs);
    if (!found.ok) {
      const base: ModelPriceMeta = current ?? { source: prices[model] !== undefined ? "manual" : "default" };
      nextMeta[model] = { ...base, lastError: found.reason, checkedAt: now };
      items.push({ model, type, status: "not_found", oldPrice: prices[model], reason: found.reason });
      continue;
    }
    const { price } = found;
    const changed = prices[model] !== price.price || current?.outputPrice !== price.outputPrice;
    nextPrices[model] = price.price;
    nextMeta[model] = {
      source: price.source,
      updatedAt: changed || !current?.updatedAt ? now : current.updatedAt,
      checkedAt: now,
      ...(price.outputPrice !== undefined ? { outputPrice: price.outputPrice } : {}),
      ...(price.note ? { note: price.note } : {}),
    };
    items.push({
      model,
      type,
      status: changed ? "updated" : "unchanged",
      oldPrice: prices[model],
      newPrice: price.price,
      source: price.source,
    });
  }

  return { prices: nextPrices, meta: nextMeta, items };
}
