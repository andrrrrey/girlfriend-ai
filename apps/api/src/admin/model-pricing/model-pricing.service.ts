/**
 * @file model-pricing.service.ts
 * @description Себестоимость моделей нейросетей для раздела «Расходы»:
 * чтение/сохранение цен и автозагрузка цен от провайдеров.
 *
 * Автообновление выполняется раз в сутки (под распределённым локом) и по кнопке
 * в админке. Зафиксированные вручную цены не перезаписываются. Если источник
 * недоступен или модели в нём нет — прежняя цена сохраняется, а в метаданных
 * модели записывается причина (видна в админке).
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { loadEnv } from "@repo/config";
import { PrismaService } from "../../prisma.service";
import { SchedulerService } from "../../common/scheduler.service";
import { IMAGE_MODELS, VIDEO_MODELS } from "../../generation/models";
import {
  DEFAULT_BUZZ_USD,
  DEFAULT_MODEL_PRICES,
  MODEL_PRICING_KEY,
  MODEL_PRICING_META_KEY,
  ModelPriceMeta,
  PriceCatalogs,
  RefreshItem,
  applyCatalogPrices,
  median,
  normalizeMetaMap,
  normalizePriceMap,
  parseAtlasCatalog,
  parseElevenLabsPricing,
  parseJsonObject,
  parseModelsLabPricing,
  parseOpenAIPricing,
  parseOpenRouterCatalog,
  round6,
} from "./model-pricing";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

const SOURCES = {
  openrouter: "https://openrouter.ai/api/v1/models",
  atlascloud: "https://api.atlascloud.ai/api/v1/models",
  modelslab: "https://modelslab.com/pricing",
  elevenlabs: "https://elevenlabs.io/pricing/api",
  openai: "https://developers.openai.com/api/docs/pricing",
};
const FETCH_TIMEOUT_MS = 30_000;
/** Оценка Civitai — по запросу на чекпоинт, даём больше времени. */
const CIVITAI_ESTIMATE_TIMEOUT_MS = 5 * 60_000;
/** Окно истории фактических расходов чата. */
const HISTORY_DAYS = 30;
/** Час ежедневного автообновления (UTC). */
const REFRESH_HOUR_UTC = 2;
/** Страницы тарифов отдают полную версию только «браузеру». */
const USER_AGENT = "Mozilla/5.0 (compatible; PriceSync/1.0)";

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

  /** Настройки, от которых зависит список моделей и источники. */
  private async settings(keys: string[]): Promise<Record<string, string>> {
    const rows = await this.prisma.appSetting.findMany({ where: { key: { in: keys } } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /**
   * Модели, которым нужна цена, с типом операции: из истории генераций,
   * списков моделей генерации, текущих моделей чата/озвучки и цен по умолчанию.
   * Сохранённые цены моделей, которых больше нет нигде, не показываются.
   */
  async listModels(): Promise<{ model: string; type: string }[]> {
    const types = new Map<string, string>();
    const add = (model: string | null | undefined, type: string | undefined) => {
      if (!model || model === "unknown" || !type) return;
      if (!types.has(model)) types.set(model, type);
    };

    const [jobModels, cfg] = await Promise.all([
      this.prisma.$queryRaw<{ type: string; model: string | null }[]>`
        SELECT DISTINCT type, input->>'model' AS model FROM ai_jobs
        WHERE status = 'completed' AND type IN ('image', 'video', 'tts', 'stt', 'chat') AND input->>'model' IS NOT NULL`,
      this.settings(["OPENROUTER_CHAT_MODEL", "MODELSLAB_CHAT_MODEL", "ELEVENLABS_MODEL"]),
    ]);

    for (const j of jobModels) add(j.model, j.type);
    for (const m of IMAGE_MODELS) add(m.id, "image");
    for (const m of VIDEO_MODELS) add(m.id, "video");
    add(cfg.OPENROUTER_CHAT_MODEL, "chat");
    add(cfg.MODELSLAB_CHAT_MODEL, "chat");
    add(cfg.ELEVENLABS_MODEL, "tts");
    for (const [model, d] of Object.entries(DEFAULT_MODEL_PRICES)) add(model, d.type);

    return Array.from(types, ([model, type]) => ({ model, type })).sort((a, b) => a.model.localeCompare(b.model));
  }

  /** Цены всех моделей для админки (сохранённая → по умолчанию). */
  async getView(): Promise<ModelPriceView[]> {
    const { prices, meta } = await this.load();
    const models = await this.listModels();
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
      const base: ModelPriceMeta = current ?? { source: "manual" };
      const next: ModelPriceMeta = {
        ...base,
        ...(changed ? { source: "manual" as const, updatedAt: now, note: undefined, lastError: undefined } : {}),
        locked: item.locked === true ? true : undefined,
        outputPrice: validOutput,
      };
      // Убираем undefined-поля, чтобы JSON был чистым.
      for (const k of Object.keys(next) as (keyof ModelPriceMeta)[]) {
        if (next[k] === undefined) delete next[k];
      }
      nextPrices[model] = price;
      nextMeta[model] = next;
    }

    await this.save(nextPrices, nextMeta);
    return this.getView();
  }

  /** Загружает источник; при ошибке — null и текст ошибки. */
  private async fetchSource<T>(
    name: string,
    url: string,
    kind: "json" | "text",
    parse: (body: any) => T,
  ): Promise<{ value: T | null; error?: string }> {
    try {
      const res = await fetch(url, {
        headers: { Accept: kind === "json" ? "application/json" : "text/html", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { value: parse(kind === "json" ? await res.json() : await res.text()) };
    } catch (err: any) {
      const error = `${name}: ${err?.message ?? String(err)}`;
      this.logger.warn(`model pricing source failed — ${error}`);
      return { value: null, error };
    }
  }

  /**
   * Средняя фактическая стоимость ответа чата за 1M токенов по моделям — из
   * стоимости, которую вернул провайдер (input.providerCostUsd), за HISTORY_DAYS дней.
   */
  private async chatHistory(): Promise<Map<string, { per1M: number; replies: number }>> {
    const since = new Date(Date.now() - HISTORY_DAYS * 24 * 3600 * 1000);
    const rows = await this.prisma.$queryRaw<{ model: string | null; cost: number; tokens: number; replies: number }[]>`
      SELECT input->>'model' AS model,
        SUM((input->>'providerCostUsd')::numeric)::float8 AS cost,
        SUM(tokens_used)::float8 AS tokens,
        COUNT(*)::int AS replies
      FROM ai_jobs
      WHERE type = 'chat' AND status = 'completed' AND created_at >= ${since}
        AND input->>'providerCostUsd' IS NOT NULL AND tokens_used > 0
      GROUP BY input->>'model'`;
    const out = new Map<string, { per1M: number; replies: number }>();
    for (const r of rows) {
      const cost = Number(r.cost);
      const tokens = Number(r.tokens);
      if (r.model && tokens > 0 && cost >= 0) {
        out.set(r.model, { per1M: round6((cost / tokens) * 1e6), replies: Number(r.replies) });
      }
    }
    return out;
  }

  /**
   * Оценка стоимости генерации на чекпоинтах Civitai (whatif через AI-сервис):
   * AIR → USD. Ключ "civitai" — медиана оценок (базовая цена Civitai).
   */
  private async civitaiEstimates(
    airs: string[],
    buzzUsd: number,
  ): Promise<{ value: PriceCatalogs["civitai"]; error?: string }> {
    if (!airs.length) return { value: new Map() };
    try {
      const res = await fetch(`${AI_BASE}/ai/civitai/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airs }),
        signal: AbortSignal.timeout(CIVITAI_ESTIMATE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { results?: { air: string; buzz?: number; error?: string }[] };
      const out = new Map<string, { usd: number; buzz: number }>();
      const errors: string[] = [];
      for (const r of body.results ?? []) {
        if (typeof r.buzz === "number" && Number.isFinite(r.buzz)) {
          out.set(r.air, { usd: round6(r.buzz * buzzUsd), buzz: r.buzz });
        } else if (r.error) {
          errors.push(r.error);
        }
      }
      const buzzMedian = median(Array.from(out.values(), (v) => v.buzz));
      if (buzzMedian !== undefined) out.set("civitai", { usd: round6(buzzMedian * buzzUsd), buzz: buzzMedian });
      return { value: out, error: errors.length && !out.size ? `Civitai: ${errors[0]}` : undefined };
    } catch (err: any) {
      const error = `Civitai: ${err?.message ?? String(err)}`;
      this.logger.warn(`model pricing source failed — ${error}`);
      return { value: null, error };
    }
  }

  /** Загружает цены из всех источников и применяет к незафиксированным моделям. */
  async refreshFromProviders(): Promise<{
    items: RefreshItem[];
    errors: string[];
    summary: { updated: number; unchanged: number; locked: number; notFound: number };
    models: ModelPriceView[];
  }> {
    const [{ prices, meta }, models, cfg] = await Promise.all([
      this.load(),
      this.listModels(),
      this.settings(["MODELSLAB_CHAT_MODEL", "CIVITAI_BUZZ_USD"]),
    ]);
    const buzzUsd = Number(cfg.CIVITAI_BUZZ_USD) > 0 ? Number(cfg.CIVITAI_BUZZ_USD) : DEFAULT_BUZZ_USD;

    // Оцениваем только незафиксированные чекпоинты Civitai — каждый это запрос к Civitai.
    const civitaiAirs = models
      .filter((m) => /^urn:air:/i.test(m.model) && !meta[m.model]?.locked)
      .map((m) => m.model);

    const [openrouter, atlascloud, modelslab, elevenlabs, openai, civitai, history] = await Promise.all([
      this.fetchSource("OpenRouter", SOURCES.openrouter, "json", parseOpenRouterCatalog),
      this.fetchSource("Atlas Cloud", SOURCES.atlascloud, "json", parseAtlasCatalog),
      this.fetchSource("ModelsLab", SOURCES.modelslab, "text", parseModelsLabPricing),
      this.fetchSource("ElevenLabs", SOURCES.elevenlabs, "text", parseElevenLabsPricing),
      this.fetchSource("OpenAI", SOURCES.openai, "text", parseOpenAIPricing),
      this.civitaiEstimates(civitaiAirs, buzzUsd),
      this.chatHistory().catch((err) => {
        this.logger.warn(`chat cost history failed: ${err?.message}`);
        return null;
      }),
    ]);

    // Модели ModelsLab: генерация без явного провайдера и чат ModelsLab.
    const modelslabModels = new Set<string>(
      IMAGE_MODELS.filter((m) => !(m as { provider?: string }).provider).map((m) => m.id),
    );
    modelslabModels.add(cfg.MODELSLAB_CHAT_MODEL || "llama-3.1-8b-uncensored");

    const catalogs: PriceCatalogs = {
      openrouter: openrouter.value,
      atlascloud: atlascloud.value,
      modelslab: modelslab.value,
      elevenlabs: elevenlabs.value,
      openai: openai.value,
      civitai: civitai.value,
      history,
      modelslabModels,
    };
    const errors = [openrouter, atlascloud, modelslab, elevenlabs, openai, civitai]
      .map((s) => s.error)
      .filter((e): e is string => Boolean(e));

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
