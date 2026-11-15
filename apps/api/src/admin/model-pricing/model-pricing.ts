/**
 * @file model-pricing.ts
 * @description Себестоимость моделей нейросетей (USD) для раздела «Расходы»:
 * формат хранения, разбор цен провайдеров и сопоставление моделей.
 *
 * Чистые функции без зависимостей — их используют ModelPricingService и тесты.
 *
 * Хранение (AppSetting):
 * - `MODEL_PRICING`      — `{ "<model>": число }` — основная цена модели. Для чата —
 *                          цена входных токенов за 1M, для озвучки — за 1000 символов,
 *                          для распознавания — за минуту, для картинок/видео — за генерацию.
 * - `MODEL_PRICING_META` — `{ "<model>": ModelPriceMeta }` — откуда цена, когда обновлена,
 *                          зафиксирована ли вручную, цена выходных токенов (чат).
 *
 * Источники цен:
 * - OpenRouter — JSON-каталог моделей (чат);
 * - Atlas Cloud — JSON-каталог моделей (Wan/Van: изображения, видео), с поиском
 *   аналогичной модели, если точного id нет в каталоге;
 * - ModelsLab — страница тарифов (цена вызова SD/SDXL/Flux на тарифе Standard, LLM);
 * - ElevenLabs — страница тарифов API (озвучка, за 1000 символов);
 * - OpenAI — страница цен (распознавание речи, за минуту);
 * - Civitai — оценка стоимости воркфлоу (whatif) через AI-сервис, Buzz → USD;
 * - история — фактическая стоимость ответов чата у провайдера ($/1M токенов),
 *   если модели уже нет в каталоге.
 */

/** Ключи настроек. */
export const MODEL_PRICING_KEY = "MODEL_PRICING";
export const MODEL_PRICING_META_KEY = "MODEL_PRICING_META";

/** Источник цены модели. */
export type PriceSource =
  | "manual"
  | "default"
  | "openrouter"
  | "atlascloud"
  | "modelslab"
  | "elevenlabs"
  | "openai"
  | "civitai"
  | "history";

const PRICE_SOURCES: PriceSource[] = [
  "manual",
  "default",
  "openrouter",
  "atlascloud",
  "modelslab",
  "elevenlabs",
  "openai",
  "civitai",
  "history",
];

/** Метаданные цены модели. */
export interface ModelPriceMeta {
  /** Откуда взята текущая цена. */
  source: PriceSource;
  /** Когда цена последний раз менялась (ISO). */
  updatedAt?: string;
  /** Зафиксирована вручную — автообновление её не трогает. */
  locked?: boolean;
  /** Цена выходных токенов за 1M (только чат). */
  outputPrice?: number;
  /** Пояснение к цене (например «$0.068/сек × 5 сек»). */
  note?: string;
  /** Последняя ошибка автообновления (модель не найдена у провайдера и т.п.). */
  lastError?: string;
  /** Когда была последняя попытка автообновления (ISO). */
  checkedAt?: string;
}

/** Цена модели, найденная у провайдера. */
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

/** Цены ModelsLab со страницы тарифов. */
export interface ModelsLabPrices {
  /** Цена вызова генерации изображения (SD/SDXL/Flux), USD. */
  imagePerCall?: number;
  /** Тариф, к которому относится цена вызова. */
  plan?: string;
  /** Цена LLM, USD за 1M токенов («от»). */
  llmPer1M?: number;
}

/** Типы операций, для которых считается себестоимость. */
export type CostType = "image" | "video" | "tts" | "stt" | "chat";

/** Цена модели по умолчанию (USD). */
export interface DefaultModelPrice {
  type: CostType;
  price: number;
  outputPrice?: number;
}

/**
 * Цены по умолчанию — пока цена не сохранена и не загружена от провайдера.
 * Оценки по тарифам провайдеров на ноябрь 2026.
 */
export const DEFAULT_MODEL_PRICES: Record<string, DefaultModelPrice> = {
  "realistic-vision-v51": { type: "image", price: 0.0047 },
  sdxl: { type: "image", price: 0.0047 },
  "juggernaut-xl": { type: "image", price: 0.0047 },
  flux: { type: "image", price: 0.0047 },
  "alibaba/wan-2.6/text-to-image": { type: "image", price: 0.021 },
  civitai: { type: "image", price: 0.005 },
  "atlascloud/van-2.6/text-to-video": { type: "video", price: 0.34 },
  "atlascloud/wan-2.6-spicy/image-to-video": { type: "video", price: 0.35 },
  "alibaba/wan-2.7/image-to-video": { type: "video", price: 0.5 },
  eleven_multilingual_v2: { type: "tts", price: 0.08 },
  "whisper-1": { type: "stt", price: 0.006 },
  "llama-3.1-8b-uncensored": { type: "chat", price: 0.2, outputPrice: 0.2 },
  "minimax/minimax-m2-her": { type: "chat", price: 0.3, outputPrice: 1.2 },
};

/** Тип операции для модели без истории генераций (по известным спискам). */
export function guessModelType(model: string): CostType | undefined {
  if (DEFAULT_MODEL_PRICES[model]) return DEFAULT_MODEL_PRICES[model].type;
  if (/^eleven_/.test(model)) return "tts";
  if (/whisper|transcribe/.test(model)) return "stt";
  if (/^urn:air:/i.test(model)) return "image";
  if (/text-to-video|image-to-video|video-to-video/.test(model)) return "video";
  if (/text-to-image|image-edit/.test(model)) return "image";
  if (/llama|minimax|mistral|qwen|gpt|claude|gemini|deepseek|hermes|uncensored/i.test(model)) return "chat";
  return undefined;
}

/**
 * Длительность видео по умолчанию (сек). Atlas Cloud тарифицирует видео посекундно
 * с минимумом 5 секунд, а AI-сервис генерирует 5-секундные ролики, если длительность
 * не указана, поэтому цена «за генерацию» = цена за секунду × 5.
 */
export const DEFAULT_VIDEO_SECONDS = 5;

/** Курс Buzz Civitai по умолчанию: 1000 Buzz = $1. Переопределяется настройкой CIVITAI_BUZZ_USD. */
export const DEFAULT_BUZZ_USD = 0.001;

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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Основные HTML-сущности (страницы тарифов кодируют кавычки и амперсанды). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Видимый текст HTML-страницы одной строкой (без скриптов, стилей и тегов). */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ");
}

// ─── Разбор источников ────────────────────────────────────────────────────────

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

/**
 * Разбирает страницу https://modelslab.com/pricing: цену вызова Stable Diffusion
 * («A Stable Diffusion API call costs $0.0047 on the $47/month Standard plan») и
 * минимальную цену LLM («LLM inference from $0.20 per million tokens»).
 */
export function parseModelsLabPricing(html: string): ModelsLabPrices {
  const text = htmlToText(html);
  const out: ModelsLabPrices = {};
  const call = text.match(/Stable Diffusion API call costs \$([\d.]+) on the \$\d+\/month (\w+) plan/i);
  if (call) {
    out.imagePerCall = toNum(call[1]);
    out.plan = call[2];
  } else {
    const from = text.match(/Image generation starts at \$([\d.]+) per image/i);
    if (from) out.imagePerCall = toNum(from[1]);
  }
  const llm = text.match(/LLM inference from \$([\d.]+) per million tokens/i);
  if (llm) out.llmPer1M = toNum(llm[1]);
  if (out.imagePerCall === undefined && out.llmPer1M === undefined) {
    throw new Error("ModelsLab: цены на странице тарифов не найдены");
  }
  return out;
}

/** Группы моделей ElevenLabs на странице тарифов API. */
const ELEVENLABS_LABELS = ["v2 Multilingual", "Flash / Turbo", "v3 Conversational", "v3", "v4 Turbo", "v4"];

/**
 * Разбирает страницу https://elevenlabs.io/pricing/api: цена озвучки за 1000 символов
 * по группам моделей («v2 Multilingual Text to Speech $0.08 Price per 1K characters»).
 *
 * @returns карта «группа моделей → $ за 1000 символов»
 */
export function parseElevenLabsPricing(html: string): Map<string, number> {
  const text = htmlToText(html);
  const out = new Map<string, number>();
  for (const label of ELEVENLABS_LABELS) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(label)} Text to Speech (?:New )?\\$([\\d.]+) Price per 1K characters`, "i");
    const m = text.match(re);
    const price = m ? toNum(m[1]) : undefined;
    if (price !== undefined) out.set(label, price);
  }
  if (out.size === 0) throw new Error("ElevenLabs: цены на странице тарифов не найдены");
  return out;
}

/** Группа ElevenLabs на странице тарифов по id модели. */
export function elevenLabsLabel(model: string): string | undefined {
  if (/^eleven_multilingual_v2/.test(model)) return "v2 Multilingual";
  if (/^eleven_(turbo|flash)_/.test(model)) return "Flash / Turbo";
  if (/^eleven_v3_conversational/.test(model)) return "v3 Conversational";
  if (/^eleven_v3/.test(model)) return "v3";
  if (/^eleven_v4_turbo/.test(model)) return "v4 Turbo";
  if (/^eleven_v4/.test(model)) return "v4";
  return undefined;
}

/**
 * Разбирает страницу https://developers.openai.com/api/docs/pricing: цены
 * распознавания речи за минуту. Таблица лежит в JSON-атрибуте компонента:
 * `"modelId":[0,"whisper-1"],"rows":[...,"$0.006 / minute"]`.
 *
 * @returns карта «id модели → $ за минуту»
 */
export function parseOpenAIPricing(html: string): Map<string, number> {
  const src = decodeEntities(html);
  const out = new Map<string, number>();
  // У одной записи бывают и "model" (название), и "modelId" — поэтому цену ищем
  // вперёд от каждого упоминания отдельно, а не одним глобальным выражением
  // (оно «съело» бы modelId, стоящий между названием и ценой).
  const idRe = /"(?:modelId|model)":\[0,"([^"]+)"\]/g;
  for (const m of src.matchAll(idRe)) {
    const from = (m.index ?? 0) + m[0].length;
    const priceMatch = src.slice(from, from + 400).match(/^[^{}]*?"\$([\d.]+) \/ minute"/);
    const price = priceMatch ? toNum(priceMatch[1]) : undefined;
    if (price !== undefined && !out.has(m[1])) out.set(m[1], price);
  }
  if (out.size === 0) throw new Error("OpenAI: цены за минуту на странице не найдены");
  return out;
}

/** Медиана списка чисел (для базовой цены «civitai» по оценкам чекпоинтов). */
export function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Сопоставление моделей ───────────────────────────────────────────────────

/** Цены, загруженные из всех источников (null — источник недоступен). */
export interface PriceCatalogs {
  openrouter: Map<string, OpenRouterPrice> | null;
  atlascloud: Map<string, AtlasPrice> | null;
  modelslab: ModelsLabPrices | null;
  elevenlabs: Map<string, number> | null;
  openai: Map<string, number> | null;
  /** Civitai: AIR (и "civitai" — медиана) → USD за генерацию. */
  civitai: Map<string, { usd: number; buzz: number }> | null;
  /** Фактическая стоимость чата: модель → $ за 1M токенов (по ответам провайдера). */
  history: Map<string, { per1M: number; replies: number }> | null;
  /** Модели, которые обслуживает ModelsLab (картинки и чат). */
  modelslabModels: Set<string>;
}

/** Пустые каталоги (для тестов и частичных обновлений). */
export function emptyCatalogs(): PriceCatalogs {
  return {
    openrouter: null,
    atlascloud: null,
    modelslab: null,
    elevenlabs: null,
    openai: null,
    civitai: null,
    history: null,
    modelslabModels: new Set(),
  };
}

/**
 * Ищет в каталоге Atlas аналогичную модель, если точного id нет: та же модель
 * и задача без NSFW-суффиксов (`atlascloud/wan-2.6-spicy/image-to-video` →
 * `…/wan-2.6/image-to-video`).
 */
export function findAtlasSimilar(model: string, catalog: Map<string, AtlasPrice>): string | undefined {
  const segs = model.split("/");
  if (segs.length < 2) return undefined;
  const key = `${segs[segs.length - 2]}/${segs[segs.length - 1]}`
    .replace(/-(spicy|nsfw|uncensored)(?=\/|$)/gi, "")
    .toLowerCase();
  const candidates = Array.from(catalog.keys()).filter((id) => id.toLowerCase().endsWith(`/${key}`));
  if (!candidates.length) return undefined;
  const org = segs[0].toLowerCase();
  return candidates.find((id) => id.toLowerCase().startsWith(`${org}/`)) ?? candidates.sort()[0];
}

/** Цена картинки/видео из записи Atlas; null — непонятная единица. */
function atlasMediaPrice(type: string, atlas: AtlasPrice, note: string): FetchedPrice | string {
  if (atlas.basePrice === undefined) return "у модели в каталоге Atlas Cloud нет цены";
  const perSecond = type === "video" && (!atlas.unit || atlas.unit === "second");
  if (perSecond) {
    return {
      source: "atlascloud",
      price: round6(atlas.basePrice * DEFAULT_VIDEO_SECONDS),
      note: `$${atlas.basePrice}/сек × ${DEFAULT_VIDEO_SECONDS} сек${note}`,
    };
  }
  if (atlas.unit && !["image", "generation", "request"].includes(atlas.unit)) {
    return `неизвестная единица цены Atlas Cloud: «${atlas.unit}»`;
  }
  return { source: "atlascloud", price: atlas.basePrice, note: `$${atlas.basePrice} за генерацию${note}` };
}

type Resolved = { ok: true; price: FetchedPrice } | { ok: false; reason: string };

function chatPrice(model: string, c: PriceCatalogs): Resolved {
  const or = c.openrouter?.get(model);
  if (or) {
    return {
      ok: true,
      price: {
        source: "openrouter",
        price: or.inputPer1M,
        outputPrice: or.outputPer1M,
        note: `OpenRouter: вход $${or.inputPer1M} / выход $${or.outputPer1M} за 1M токенов`,
      },
    };
  }
  const atlas = c.atlascloud?.get(model);
  if (atlas?.inputPer1M !== undefined) {
    const out = atlas.outputPer1M ?? atlas.inputPer1M;
    return {
      ok: true,
      price: {
        source: "atlascloud",
        price: atlas.inputPer1M,
        outputPrice: out,
        note: `Atlas Cloud: вход $${atlas.inputPer1M} / выход $${out} за 1M токенов`,
      },
    };
  }
  const hist = c.history?.get(model);
  if (hist) {
    return {
      ok: true,
      price: {
        source: "history",
        price: hist.per1M,
        outputPrice: hist.per1M,
        note: `по фактической стоимости ${hist.replies} ответов у провайдера (в среднем за 1M токенов)`,
      },
    };
  }
  if (c.modelslabModels.has(model) && c.modelslab?.llmPer1M !== undefined) {
    const p = c.modelslab.llmPer1M;
    return { ok: true, price: { source: "modelslab", price: p, outputPrice: p, note: `ModelsLab: LLM от $${p} за 1M токенов` } };
  }
  return { ok: false, reason: "модели нет у OpenRouter/Atlas Cloud/ModelsLab и нет истории фактических расходов" };
}

function imageVideoPrice(model: string, type: string, c: PriceCatalogs): Resolved {
  // Civitai: чекпоинты по AIR и базовая цена «civitai».
  if (/^urn:air:/i.test(model) || model === "civitai") {
    const civ = c.civitai?.get(model);
    if (civ) {
      const note =
        model === "civitai"
          ? `медиана оценок чекпоинтов Civitai (${civ.buzz} Buzz)`
          : `оценка Civitai: ${civ.buzz} Buzz за генерацию (без апскейла)`;
      return { ok: true, price: { source: "civitai", price: civ.usd, note } };
    }
    if (!c.civitai) return { ok: false, reason: "оценка Civitai недоступна (нет токена или AI-сервис не ответил)" };
    return { ok: false, reason: "Civitai не вернул оценку стоимости для этого чекпоинта" };
  }

  const atlas = c.atlascloud;
  if (atlas) {
    const exact = atlas.get(model);
    if (exact) {
      const r = atlasMediaPrice(type, exact, "");
      return typeof r === "string" ? { ok: false, reason: r } : { ok: true, price: r };
    }
    const similar = findAtlasSimilar(model, atlas);
    if (similar) {
      const r = atlasMediaPrice(type, atlas.get(similar)!, ` (по аналогичной модели ${similar})`);
      return typeof r === "string" ? { ok: false, reason: r } : { ok: true, price: r };
    }
  }

  if (type === "image" && c.modelslabModels.has(model) && c.modelslab?.imagePerCall !== undefined) {
    const p = c.modelslab.imagePerCall;
    const plan = c.modelslab.plan ? ` на тарифе ${c.modelslab.plan}` : "";
    return { ok: true, price: { source: "modelslab", price: p, note: `ModelsLab: $${p} за вызов${plan}` } };
  }

  if (!atlas && !c.modelslab) return { ok: false, reason: "каталоги Atlas Cloud и ModelsLab недоступны" };
  return { ok: false, reason: "модели нет в каталогах Atlas Cloud/ModelsLab" };
}

/**
 * Находит цену модели в загруженных источниках.
 *
 * @param model — id модели, как он записан в ai_jobs.input.model
 * @param type  — тип операции: "chat" | "image" | "video" | "tts" | "stt"
 * @returns цену или причину, почему её нет
 */
export function resolveModelPrice(model: string, type: string, catalogs: PriceCatalogs): Resolved {
  switch (type) {
    case "chat":
      return chatPrice(model, catalogs);
    case "image":
    case "video":
      return imageVideoPrice(model, type, catalogs);
    case "tts": {
      const label = elevenLabsLabel(model);
      if (!label) return { ok: false, reason: "неизвестная модель ElevenLabs" };
      if (!catalogs.elevenlabs) return { ok: false, reason: "страница тарифов ElevenLabs недоступна" };
      const p = catalogs.elevenlabs.get(label);
      if (p === undefined) return { ok: false, reason: `на странице ElevenLabs нет цены для «${label}»` };
      return { ok: true, price: { source: "elevenlabs", price: p, note: `ElevenLabs API: $${p} за 1000 символов (${label})` } };
    }
    case "stt": {
      if (!catalogs.openai) return { ok: false, reason: "страница цен OpenAI недоступна" };
      const p = catalogs.openai.get(model);
      if (p === undefined) return { ok: false, reason: "модели нет на странице цен OpenAI" };
      return { ok: true, price: { source: "openai", price: p, note: `OpenAI: $${p} за минуту` } };
    }
    default:
      return { ok: false, reason: "неизвестный тип операции" };
  }
}

// ─── Хранение ────────────────────────────────────────────────────────────────

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
  for (const [model, v] of Object.entries(raw)) {
    if (!v || typeof v !== "object") continue;
    const m = v as Record<string, unknown>;
    const source = PRICE_SOURCES.includes(m.source as PriceSource) ? (m.source as PriceSource) : "manual";
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
