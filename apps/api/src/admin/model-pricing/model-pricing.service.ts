/**
 * @file model-pricing.service.ts
 * @description Себестоимость моделей нейросетей для раздела «Расходы»:
 * чтение/сохранение цен и автозагрузка цен из каталогов провайдеров.
 *
 * Автообновление выполняется раз в сутки (под распределённым локом) и по кнопке
 * в админке. Зафиксированные вручную цены не перезаписываются. Если провайдер
 * недоступен или модели у него нет — прежняя цена сохраняется, а в метаданных
 * модели записывается причина (видна в админке).
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { SchedulerService } from "../../common/scheduler.service";
import { IMAGE_MODELS, VIDEO_MODELS } from "../../generation/models";
import {
  DEFAULT_MODEL_PRICES,
  MODEL_PRICING_KEY,
  MODEL_PRICING_META_KEY,
  ModelPriceMeta,
  PriceCatalogs,
  RefreshItem,
  applyCatalogPrices,
  guessModelType,
  normalizeMetaMap,
  normalizePriceMap,
  parseAtlasCatalog,
  parseJsonObject,
  parseOpenRouterCatalog,
} from "./model-pricing";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const ATLAS_MODELS_URL = "https://api.atlascloud.ai/api/v1/models";
const FETCH_TIMEOUT_MS = 30_000;
/** Час ежедневного автообновления (UTC). */
const REFRESH_HOUR_UTC = 2;

/** Цена модели для админки. */
export interface ModelPriceView {
  model: string;
  /** Тип операции (определяет единицу цены). */
  type: string;
  /** Основная цена; null — не задана. */
  price: number | null;
  /** Цена выходных токенов за 1M (чат). */
  outputPrice: number | null;
  meta: ModelPriceMeta;
}

/** Цена, присланная админкой при сохранении. */
export interface ModelPriceInput {
  price: number | null;
  outputPrice?: number | null;
  locked?: boolean;
}

@Injectable()
export class ModelPricingService implements OnModuleInit {
  private readonly logger = new Logger(ModelPricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit() {
    this.scheduler.scheduleDaily("model-pricing-refresh", REFRESH_HOUR_UTC, async () => {
      const res = await this.refreshFromProviders();
      this.logger.log(
        `model pricing refreshed: updated=${res.summary.updated} unchanged=${res.summary.unchanged} ` +
          `locked=${res.summary.locked} not_found=${res.summary.notFound}`,
      );
    });
  }

  /** Сохранённые цены и метаданные. */
  async load(): Promise<{ prices: Record<string, number>; meta: Record<string, ModelPriceMeta> }> {
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: [MODEL_PRICING_KEY, MODEL_PRICING_META_KEY] } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return {
      prices: normalizePriceMap(parseJsonObject(byKey.get(MODEL_PRICING_KEY))),
      meta: normalizeMetaMap(parseJsonObject(byKey.get(MODEL_PRICING_META_KEY))),
    };
  }

  private async save(prices: Record<string, number>, meta: Record<string, ModelPriceMeta>) {
    await this.prisma.$transaction([
      this.prisma.appSetting.upsert({
        where: { key: MODEL_PRICING_KEY },
        update: { value: JSON.stringify(prices) },
        create: { key: MODEL_PRICING_KEY, value: JSON.stringify(prices) },
      }),
      this.prisma.appSetting.upsert({
        where: { key: MODEL_PRICING_META_KEY },
        update: { value: JSON.stringify(meta) },
        create: { key: MODEL_PRICING_META_KEY, value: JSON.stringify(meta) },
      }),
    ]);
  }

  /**
   * Все модели, которым нужна цена, с типом операции: из истории генераций,
   * списков моделей генерации, текущей модели чата, цен по умолчанию и сохранённых цен.
   */
  async listModels(saved?: Record<string, number>): Promise<{ model: string; type: string }[]> {
    const types = new Map<string, string>();
    const add = (model: string | null | undefined, type: string | undefined) => {
      if (!model || model === "unknown" || !type) return;
      if (!types.has(model)) types.set(model, type);
    };

    const [jobModels, chatSettings] = await Promise.all([
      this.prisma.$queryRaw<{ type: string; model: string | null }[]>`
        SELECT DISTINCT type, input->>'model' AS model FROM ai_jobs
        WHERE status = 'completed' AND type IN ('image', 'video', 'tts', 'stt', 'chat') AND input->>'model' IS NOT NULL`,
      this.prisma.appSetting.findMany({
        where: { key: { in: ["OPENROUTER_CHAT_MODEL", "MODELSLAB_CHAT_MODEL", "ELEVENLABS_MODEL"] } },
      }),
    ]);

    for (const j of jobModels) add(j.model, j.type);
    for (const m of IMAGE_MODELS) add(m.id, "image");
    for (const m of VIDEO_MODELS) add(m.id, "video");
    for (const s of chatSettings) add(s.value, s.key === "ELEVENLABS_MODEL" ? "tts" : "chat");
    for (const [model, d] of Object.entries(DEFAULT_MODEL_PRICES)) add(model, d.type);
    for (const model of Object.keys(saved ?? {})) add(model, guessModelType(model));

    return Array.from(types, ([model, type]) => ({ model, type })).sort((a, b) => a.model.localeCompare(b.model));
  }

  /** Цены всех моделей для админки (сохранённая → по умолчанию). */
  async getView(): Promise<ModelPriceView[]> {
    const { prices, meta } = await this.load();
    const models = await this.listModels(prices);
    return models.map(({ model, type }) => {
      const def = DEFAULT_MODEL_PRICES[model];
      const m = meta[model];
      const hasSaved = prices[model] !== undefined;
      return {
        model,
        type,
        price: hasSaved ? prices[model] : def?.price ?? null,
        outputPrice: m?.outputPrice ?? (hasSaved ? null : def?.outputPrice ?? null),
        meta: m ?? { source: hasSaved ? "manual" : "default" },
      };
    });
  }

  /**
   * Сохраняет цены из админки. Изменённая вручную цена получает source "manual";
   * признак locked берётся из запроса.
   */
  async saveManual(input: Record<string, ModelPriceInput>): Promise<ModelPriceView[]> {
    const { prices, meta } = await this.load();
    const now = new Date().toISOString();
    const nextPrices = { ...prices };
    const nextMeta = { ...meta };

    for (const [model, item] of Object.entries(input ?? {})) {
      if (!model || !item || typeof item !== "object") continue;
      const price = item.price === null || item.price === undefined ? null : Number(item.price);
      const output = item.outputPrice === null || item.outputPrice === undefined ? null : Number(item.outputPrice);
      const current = nextMeta[model];

      if (price === null || !Number.isFinite(price) || price < 0) {
        // Пустое значение — удаляем сохранённую цену (вернётся цена по умолчанию).
        delete nextPrices[model];
        delete nextMeta[model];
        continue;
      }
      const validOutput = output !== null && Number.isFinite(output) && output >= 0 ? output : undefined;
      const changed = prices[model] !== price || (current?.outputPrice ?? undefined) !== validOutput;
      nextPrices[model] = price;
      nextMeta[model] = {
        ...(current ?? { source: "manual" }),
        ...(changed ? { source: "manual" as const, updatedAt: now, note: undefined, lastError: undefined } : {}),
        locked: item.locked === true ? true : undefined,
        outputPrice: validOutput,
      };
      // Убираем undefined-поля, чтобы JSON был чистым.
      for (const k of Object.keys(nextMeta[model]) as (keyof ModelPriceMeta)[]) {
        if (nextMeta[model][k] === undefined) delete nextMeta[model][k];
      }
    }

    await this.save(nextPrices, nextMeta);
    return this.getView();
  }

  /** Загружает каталог провайдера; при ошибке — null и запись в лог. */
  private async fetchCatalog<T>(name: string, url: string, parse: (json: unknown) => T): Promise<{ value: T | null; error?: string }> {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { value: parse(await res.json()) };
    } catch (err: any) {
      const error = `${name}: ${err?.message ?? String(err)}`;
      this.logger.warn(`model pricing catalog failed — ${error}`);
      return { value: null, error };
    }
  }

  /** Загружает цены из каталогов провайдеров и применяет к незафиксированным моделям. */
  async refreshFromProviders(): Promise<{
    items: RefreshItem[];
    errors: string[];
    summary: { updated: number; unchanged: number; locked: number; notFound: number };
    models: ModelPriceView[];
  }> {
    const [openrouter, atlascloud] = await Promise.all([
      this.fetchCatalog("OpenRouter", OPENROUTER_MODELS_URL, parseOpenRouterCatalog),
      this.fetchCatalog("Atlas Cloud", ATLAS_MODELS_URL, parseAtlasCatalog),
    ]);
    const catalogs: PriceCatalogs = { openrouter: openrouter.value, atlascloud: atlascloud.value };
    const errors = [openrouter.error, atlascloud.error].filter((e): e is string => Boolean(e));

    const { prices, meta } = await this.load();
    const models = await this.listModels(prices);
    const result = applyCatalogPrices(prices, meta, models, catalogs, new Date().toISOString());
    await this.save(result.prices, result.meta);

    const count = (s: RefreshItem["status"]) => result.items.filter((i) => i.status === s).length;
    return {
      items: result.items,
      errors,
      summary: { updated: count("updated"), unchanged: count("unchanged"), locked: count("locked"), notFound: count("not_found") },
      models: await this.getView(),
    };
  }
}
