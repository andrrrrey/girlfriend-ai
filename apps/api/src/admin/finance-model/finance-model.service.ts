/**
 * @file finance-model.service.ts
 * @description Данные для финансовой модели: себестоимость операций по истории
 * генераций, профиль потребления пользователей, текущие цены в кредитах и тарифы.
 *
 * Себестоимость считается за последние WINDOW_DAYS дней:
 * - фактическая стоимость у провайдера (OpenRouter) или оценка по ценам моделей
 *   из раздела «Расходы → Стоимость по моделям»;
 * - выдача готового медиа из кэша (cached_from) нам ничего не стоит, но кредиты
 *   списываются — поэтому средняя себестоимость операции делится на все операции,
 *   включая копии из кэша.
 * Если истории нет — себестоимость оценивается по ценам текущих моделей.
 */

import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { PricingService } from "../../billing/pricing.service";
import { BillingConfigService } from "../../billing/billing-config.service";
import { ModelPricingService } from "../model-pricing/model-pricing.service";
import {
  Assumptions,
  CostGroup,
  CreditPrices,
  FinanceData,
  FinanceResult,
  ModelCost,
  ModelPrice,
  OperationCost,
  OperationKey,
  UsageMix,
  calculateFinanceModel,
  groupCostUsd,
  modelPriceOf,
} from "./finance-model";

/** Окно истории для себестоимости и профиля потребления, дней. */
const WINDOW_DAYS = 30;
/** Типичный ответ чата, если истории нет: контекст и ответ, токенов. */
const FALLBACK_CHAT_TOKENS = { prompt: 2500, completion: 150 };
/** Типичная длина голосового, если истории нет, минут. */
const FALLBACK_STT_MINUTES = 0.5;

@Injectable()
export class FinanceModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly billingConfig: BillingConfigService,
    private readonly modelPricing: ModelPricingService,
  ) {}

  /** Данные модели и расчёт по допущениям (без допущений — значения по умолчанию). */
  async calculate(assumptions: Partial<Assumptions> = {}): Promise<{ data: FinanceData; result: FinanceResult }> {
    const data = await this.loadData();
    return { data, result: calculateFinanceModel(data, assumptions) };
  }

  /** Собирает данные платформы для расчёта. */
  async loadData(): Promise<FinanceData> {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
    const [active, welcomeBonus, modelView, products, groups, opCounts, usage, settings] = await Promise.all([
      this.pricing.getActive(),
      this.billingConfig.welcomeBonus(),
      this.modelPricing.getView(),
      this.prisma.billingProduct.findMany({ orderBy: [{ sortOrder: "asc" }, { priceMinor: "asc" }] }),
      this.costGroups(since),
      this.operationCounts(since),
      this.usage(since),
      this.prisma.appSetting.findMany({
        where: { key: { in: ["CHAT_PROVIDER", "OPENROUTER_CHAT_MODEL", "MODELSLAB_CHAT_MODEL", "ELEVENLABS_MODEL"] } },
      }),
    ]);

    const prices: Record<string, ModelPrice> = {};
    for (const m of modelView) prices[m.model] = { price: m.price, outputPrice: m.outputPrice };
    const cfg = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    // Себестоимость по (тип, модель) — только реальные генерации (без копий из кэша).
    const realCost = new Map<string, number>();
    for (const g of groups) realCost.set(`${g.type}|${g.model}`, groupCostUsd(g, prices));
    const sumCost = (type: string) =>
      groups.filter((g) => g.type === type).reduce((s, g) => s + (realCost.get(`${g.type}|${g.model}`) ?? 0), 0);
    const opsOf = (type: string) => opCounts.filter((o) => o.type === type);
    const countOps = (type: string) => opsOf(type).reduce((s, o) => s + o.total, 0);
    const cachedShare = (type: string) => {
      const total = countOps(type);
      return total > 0 ? opsOf(type).reduce((s, o) => s + o.cached, 0) / total : 0;
    };
    const cacheNote = (type: string) => {
      const share = cachedShare(type);
      return share > 0 ? `, ${Math.round(share * 100)}% выдано из кэша бесплатно для нас` : "";
    };

    const median = (values: number[]) => {
      const v = values.filter((x) => x > 0).sort((a, b) => a - b);
      if (!v.length) return 0;
      const mid = Math.floor(v.length / 2);
      return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
    };
    const priceOfType = (type: string) => median(modelView.filter((m) => m.type === type).map((m) => m.price ?? 0));

    // ── Чат
    const chatOps = countOps("chat");
    const chatModel =
      (cfg.CHAT_PROVIDER || "modelslab").toLowerCase() === "openrouter"
        ? cfg.OPENROUTER_CHAT_MODEL || "minimax/minimax-m2-her"
        : cfg.MODELSLAB_CHAT_MODEL || "llama-3.1-8b-uncensored";
    const chatFallback =
      (FALLBACK_CHAT_TOKENS.prompt / 1e6) * modelPriceOf(chatModel, prices) +
      (FALLBACK_CHAT_TOKENS.completion / 1e6) * (prices[chatModel]?.outputPrice ?? modelPriceOf(chatModel, prices));
    const chat: OperationCost =
      chatOps > 0
        ? { costUsd: sumCost("chat") / chatOps, samples: chatOps, basis: `среднее по ${chatOps} ответам за ${WINDOW_DAYS} дн.` }
        : {
            costUsd: chatFallback,
            samples: 0,
            basis: `оценка: ${chatModel}, ~${FALLBACK_CHAT_TOKENS.prompt} вх. + ${FALLBACK_CHAT_TOKENS.completion} вых. токенов`,
          };

    // ── Распознавание
    const sttOps = countOps("stt");
    const sttModelPrice = prices["whisper-1"]?.price ?? priceOfType("stt");
    const stt: OperationCost =
      sttOps > 0
        ? { costUsd: sumCost("stt") / sttOps, samples: sttOps, basis: `среднее по ${sttOps} голосовым за ${WINDOW_DAYS} дн.` }
        : { costUsd: sttModelPrice * FALLBACK_STT_MINUTES, samples: 0, basis: `оценка: голосовое ~${FALLBACK_STT_MINUTES * 60} сек` };

    // ── Озвучка (за 1000 символов)
    const ttsChars = groups.filter((g) => g.type === "tts").reduce((s, g) => s + g.estUnits, 0);
    const ttsModel = cfg.ELEVENLABS_MODEL || "eleven_multilingual_v2";
    const tts: OperationCost =
      ttsChars > 0
        ? {
            costUsd: (sumCost("tts") / ttsChars) * 1000,
            samples: countOps("tts"),
            basis: `по ${Math.round(ttsChars).toLocaleString("ru-RU")} символам за ${WINDOW_DAYS} дн.`,
          }
        : { costUsd: modelPriceOf(ttsModel, prices) || priceOfType("tts"), samples: 0, basis: `цена модели ${ttsModel}` };

    // ── Изображения и видео: по моделям и в среднем
    const modelCosts: ModelCost[] = [];
    for (const type of ["image", "video"] as const) {
      for (const o of opsOf(type)) {
        if (!o.model || o.model === "unknown" || o.total === 0) continue;
        modelCosts.push({ type, model: o.model, costUsd: (realCost.get(`${type}|${o.model}`) ?? 0) / o.total, samples: o.total });
      }
    }
    const mediaCost = (type: "image" | "video"): OperationCost => {
      const ops = countOps(type);
      if (ops > 0) {
        return {
          costUsd: sumCost(type) / ops,
          samples: ops,
          basis: `среднее по ${ops} генерациям за ${WINDOW_DAYS} дн.${cacheNote(type)}`,
        };
      }
      return { costUsd: priceOfType(type), samples: 0, basis: "оценка: медиана цен моделей" };
    };
    const image = mediaCost("image");
    const video = mediaCost("video");

    // Hires fix — ещё один проход генерации на чекпоинте Civitai (+ апскейл).
    const civitaiModels = modelCosts.filter((m) => m.type === "image" && /^urn:air:/i.test(m.model));
    const civitaiAvg = civitaiModels.length
      ? civitaiModels.reduce((s, m) => s + m.costUsd * m.samples, 0) / civitaiModels.reduce((s, m) => s + m.samples, 0)
      : prices.civitai?.price ?? image.costUsd;
    const hiresOps = opCounts.reduce((s, o) => s + (o.type === "image" ? o.hires : 0), 0);
    const hires: OperationCost = {
      costUsd: civitaiAvg,
      samples: hiresOps,
      basis: "оценка: дополнительный проход генерации Civitai",
    };

    const costs: Record<OperationKey, OperationCost> = {
      chat_message: chat,
      chat_greeting: { ...chat, basis: `как ответ персонажа (${chat.basis})` },
      stt_message: stt,
      tts_per_1k_chars: tts,
      image,
      image_hires_extra: hires,
      video,
    };

    return {
      windowDays: WINDOW_DAYS,
      costs,
      modelCosts: modelCosts.sort((a, b) => b.samples - a.samples),
      usage,
      prices: active.items as CreditPrices,
      priceVersion: active.version,
      welcomeBonus,
      products: products.map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        priceUsd: p.priceMinor / 100,
        credits: p.credits,
        periodDays: p.periodDays,
        active: p.active,
      })),
    };
  }

  /** Реальные генерации (без копий из кэша) по (тип, модель) за окно. */
  private async costGroups(since: Date): Promise<CostGroup[]> {
    const rows = await this.prisma.$queryRaw<
      {
        type: string;
        model: string | null;
        count: number;
        provider_cost: number;
        est_count: number;
        est_units: number;
        est_prompt: number;
        est_completion: number;
      }[]
    >(Prisma.sql`
      SELECT type, input->>'model' AS model, COUNT(*)::int AS count,
        COALESCE(SUM((input->>'providerCostUsd')::numeric), 0)::float8 AS provider_cost,
        (COUNT(*) FILTER (WHERE input->>'providerCostUsd' IS NULL))::int AS est_count,
        COALESCE(SUM(COALESCE((input->>'units')::numeric, tokens_used, 0))
          FILTER (WHERE input->>'providerCostUsd' IS NULL AND input->>'promptTokens' IS NULL), 0)::float8 AS est_units,
        COALESCE(SUM((input->>'promptTokens')::numeric)
          FILTER (WHERE input->>'providerCostUsd' IS NULL AND input->>'promptTokens' IS NOT NULL), 0)::float8 AS est_prompt,
        COALESCE(SUM(COALESCE((input->>'completionTokens')::numeric, 0))
          FILTER (WHERE input->>'providerCostUsd' IS NULL AND input->>'promptTokens' IS NOT NULL), 0)::float8 AS est_completion
      FROM ai_jobs
      WHERE status = 'completed' AND created_at >= ${since} AND cached_from IS NULL
        AND type IN ('image', 'video', 'tts', 'stt', 'chat')
      GROUP BY type, input->>'model'`);
    return rows.map((r) => ({
      type: r.type,
      model: r.model ?? "unknown",
      count: Number(r.count),
      providerCost: Number(r.provider_cost) || 0,
      estCount: Number(r.est_count) || 0,
      estUnits: Number(r.est_units) || 0,
      estPromptTokens: Number(r.est_prompt) || 0,
      estCompletionTokens: Number(r.est_completion) || 0,
    }));
  }

  /** Все операции (включая копии из кэша) по (тип, модель) за окно. */
  private async operationCounts(
    since: Date,
  ): Promise<{ type: string; model: string; total: number; cached: number; hires: number }[]> {
    const rows = await this.prisma.$queryRaw<
      { type: string; model: string | null; total: number; cached: number; hires: number }[]
    >(Prisma.sql`
      SELECT type, input->>'model' AS model, COUNT(*)::int AS total,
        (COUNT(*) FILTER (WHERE cached_from IS NOT NULL))::int AS cached,
        (COUNT(*) FILTER (WHERE input->>'hiresFix' = 'true'))::int AS hires
      FROM ai_jobs
      WHERE status = 'completed' AND created_at >= ${since}
        AND type IN ('image', 'video', 'tts', 'stt', 'chat')
      GROUP BY type, input->>'model'`);
    return rows.map((r) => ({
      type: r.type,
      model: r.model ?? "unknown",
      total: Number(r.total),
      cached: Number(r.cached),
      hires: Number(r.hires),
    }));
  }

  /**
   * Профиль потребления за окно (в пересчёте на 30 дней): средний активный
   * пользователь и средний платящий (оплатил что-либо за окно). Админы не учитываются.
   */
  private async usage(since: Date): Promise<FinanceData["usage"]> {
    const rows = await this.prisma.$queryRaw<
      {
        paying: boolean;
        users: number;
        chat: number;
        images: number;
        hires: number;
        videos: number;
        tts_chars: number;
        stt: number;
      }[]
    >(Prisma.sql`
      WITH paying AS (
        SELECT DISTINCT user_id FROM payments
        WHERE user_id IS NOT NULL AND paid_at >= ${since} AND status IN ('paid', 'partially_refunded')
      )
      SELECT (p.user_id IS NOT NULL) AS paying,
        COUNT(DISTINCT j.user_id)::int AS users,
        (COUNT(*) FILTER (WHERE j.type = 'chat'))::int AS chat,
        (COUNT(*) FILTER (WHERE j.type = 'image'))::int AS images,
        (COUNT(*) FILTER (WHERE j.type = 'image' AND j.input->>'hiresFix' = 'true'))::int AS hires,
        (COUNT(*) FILTER (WHERE j.type = 'video'))::int AS videos,
        COALESCE(SUM(COALESCE((j.input->>'units')::numeric, 0)) FILTER (WHERE j.type = 'tts'), 0)::float8 AS tts_chars,
        (COUNT(*) FILTER (WHERE j.type = 'stt'))::int AS stt
      FROM ai_jobs j
      JOIN users u ON u.id = j.user_id
      LEFT JOIN paying p ON p.user_id = j.user_id
      WHERE j.status = 'completed' AND j.created_at >= ${since} AND u.role <> 'admin'
      GROUP BY (p.user_id IS NOT NULL)`);

    const scale = 30 / WINDOW_DAYS;
    const perUser = (r: (typeof rows)[number] | undefined, users: number): UsageMix => {
      if (!r || users <= 0) return { chatMessages: 0, images: 0, hiresImages: 0, videos: 0, ttsChars: 0, sttMessages: 0 };
      const avg = (v: number) => Math.round((Number(v) / users) * scale * 10) / 10;
      return {
        chatMessages: avg(r.chat),
        images: avg(r.images),
        hiresImages: avg(r.hires),
        videos: avg(r.videos),
        ttsChars: Math.round((Number(r.tts_chars) / users) * scale),
        sttMessages: avg(r.stt),
      };
    };

    const payingRow = rows.find((r) => r.paying);
    const freeRow = rows.find((r) => !r.paying);
    const payingUsers = Number(payingRow?.users ?? 0);
    const activeUsers = payingUsers + Number(freeRow?.users ?? 0);
    // Активный пользователь — сумма по обеим группам.
    const total = {
      paying: false,
      users: activeUsers,
      chat: Number(payingRow?.chat ?? 0) + Number(freeRow?.chat ?? 0),
      images: Number(payingRow?.images ?? 0) + Number(freeRow?.images ?? 0),
      hires: Number(payingRow?.hires ?? 0) + Number(freeRow?.hires ?? 0),
      videos: Number(payingRow?.videos ?? 0) + Number(freeRow?.videos ?? 0),
      tts_chars: Number(payingRow?.tts_chars ?? 0) + Number(freeRow?.tts_chars ?? 0),
      stt: Number(payingRow?.stt ?? 0) + Number(freeRow?.stt ?? 0),
    };
    return {
      activeUsers,
      payingUsers,
      perActiveUser: perUser(total, activeUsers),
      perPayingUser: perUser(payingRow, payingUsers),
    };
  }
}
