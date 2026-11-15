/**
 * @file finance-model.ts
 * @description Финансовая модель: себестоимость операций (USD) → цены в кредитах
 * и тарифы, при которых сходится экономика платформы.
 *
 * Чистые функции без зависимостей — их используют FinanceModelService и тесты.
 *
 * Основные понятия:
 * - **цена кредита** (`creditPriceUsd`) — сколько пользователь платит за 1 кредит.
 *   Ориентир — самый дешёвый за кредит тариф (самый крупный пакет): маржа
 *   должна сходиться и на нём;
 * - **чистая доля** (`netShare`) — сколько остаётся от каждого доллара после
 *   комиссии платёжки и возвратов/чарджбэков;
 * - **целевая маржа** (`targetMargin`) — доля чистой выручки, которая остаётся
 *   после расходов на нейросети. Цена операции в кредитах:
 *   `ceil(себестоимость / (чистая стоимость кредита × (1 − маржа)))`;
 * - **профиль потребления** (`usage`) — сколько операций в месяц делает платящий
 *   пользователь. Из него — себестоимость одного потраченного кредита, а значит,
 *   маржа тарифов при полном расходовании кредитов.
 */

/** Операции из таблицы цен (PriceItems), кроме цен по моделям. */
export type OperationKey =
  | "chat_message"
  | "chat_greeting"
  | "stt_message"
  | "tts_per_1k_chars"
  | "image"
  | "image_hires_extra"
  | "video";

export const OPERATION_KEYS: OperationKey[] = [
  "chat_message",
  "chat_greeting",
  "stt_message",
  "tts_per_1k_chars",
  "image",
  "image_hires_extra",
  "video",
];

/** Подпись и единица операции (для админки). */
export const OPERATION_META: Record<OperationKey, { label: string; unit: string }> = {
  chat_message: { label: "Ответ персонажа", unit: "за сообщение" },
  chat_greeting: { label: "Первое приветствие", unit: "за приветствие" },
  stt_message: { label: "Распознавание голосового", unit: "за сообщение" },
  tts_per_1k_chars: { label: "Озвучка", unit: "за 1000 символов" },
  image: { label: "Изображение (по умолчанию)", unit: "за генерацию" },
  image_hires_extra: { label: "Надбавка за hires fix", unit: "за генерацию" },
  video: { label: "Видео (по умолчанию)", unit: "за генерацию" },
};

/** Таблица цен в кредитах (как в billing/pricing.ts). */
export interface CreditPrices {
  chat_message: number;
  chat_greeting: number;
  stt_message: number;
  tts_per_1k_chars: number;
  image: number;
  image_hires_extra: number;
  video: number;
  image_models: Record<string, number>;
  video_models: Record<string, number>;
}

/** Себестоимость операции. */
export interface OperationCost {
  costUsd: number;
  /** Сколько операций за окно легло в расчёт (0 — оценка по ценам моделей). */
  samples: number;
  /** Как посчитано (для подсказки в админке). */
  basis: string;
}

/** Себестоимость генерации на конкретной модели. */
export interface ModelCost {
  type: "image" | "video";
  model: string;
  costUsd: number;
  samples: number;
}

/** Профиль потребления пользователя за месяц. */
export interface UsageMix {
  chatMessages: number;
  images: number;
  hiresImages: number;
  videos: number;
  ttsChars: number;
  sttMessages: number;
}

/** Продукт (пакет кредитов или Premium). */
export interface ProductInput {
  id: string;
  kind: "credits" | "premium" | string;
  title: string;
  priceUsd: number;
  credits: number;
  periodDays: number | null;
  active: boolean;
}

/** Данные для расчёта (собирает FinanceModelService). */
export interface FinanceData {
  windowDays: number;
  costs: Record<OperationKey, OperationCost>;
  modelCosts: ModelCost[];
  usage: {
    activeUsers: number;
    payingUsers: number;
    /** Средний профиль активного пользователя (в пересчёте на 30 дней). */
    perActiveUser: UsageMix;
    /** Средний профиль платящего пользователя (в пересчёте на 30 дней). */
    perPayingUser: UsageMix;
  };
  prices: CreditPrices;
  priceVersion: number;
  welcomeBonus: number;
  products: ProductInput[];
}

/** Допущения, которые задаёт администратор. */
export interface Assumptions {
  /** Целевая маржа после расходов на нейросети, 0..0.95. */
  targetMargin: number;
  /** Комиссия платёжного провайдера, доля от суммы. */
  paymentFeePct: number;
  /** Фиксированная комиссия за платёж, USD. */
  paymentFixedUsd: number;
  /** Возвраты и чарджбэки, доля выручки. */
  refundPct: number;
  /** Цена 1 кредита для пользователя, USD. */
  creditPriceUsd: number;
  /** Профиль потребления платящего пользователя за месяц. */
  usage: UsageMix;
  /** Ручные значения себестоимости операций, USD. */
  costOverrides?: Partial<Record<OperationKey, number>>;
  /** Цены пакетов кредитов для предлагаемой сетки, USD. */
  gridPrices?: number[];
  /** Цены Premium на 30 дней для предлагаемой сетки, USD. */
  premiumPrices?: number[];
}

export const DEFAULT_GRID_PRICES = [4.99, 9.99, 19.99, 49.99, 99.99];
export const DEFAULT_PREMIUM_PRICES = [9.99, 19.99];
/** Бонус кредитов крупным пакетам (доля сверх базы) — по индексу в сетке. */
export const GRID_BONUSES = [0, 0.05, 0.1, 0.15, 0.2, 0.25];

// ─── Себестоимость по истории генераций ──────────────────────────────────────

/** Агрегат завершённых заданий по (тип, модель) — как в разделе «Расходы». */
export interface CostGroup {
  type: string;
  model: string;
  count: number;
  /** Сумма фактической стоимости у провайдера (OpenRouter), USD. */
  providerCost: number;
  /** Заданий без фактической стоимости — их стоимость оценивается по цене модели. */
  estCount: number;
  /** Их единицы без разбивки (символы tts, секунды stt, токены чата). */
  estUnits: number;
  estPromptTokens: number;
  estCompletionTokens: number;
}

/** Цена модели (как в «Стоимость по моделям»). */
export interface ModelPrice {
  price: number | null;
  outputPrice: number | null;
}

/** Цена модели; чекпоинты Civitai без своей цены — по базовой цене "civitai". */
export function modelPriceOf(model: string, prices: Record<string, ModelPrice>): number {
  const direct = prices[model]?.price;
  if (typeof direct === "number") return direct;
  if (/^urn:air:/i.test(model)) return prices.civitai?.price ?? 0;
  return 0;
}

/**
 * Себестоимость группы заданий, USD: фактическая стоимость у провайдера плюс
 * оценка остальных по ценам моделей (та же формула, что в разделе «Расходы»).
 */
export function groupCostUsd(g: CostGroup, prices: Record<string, ModelPrice>): number {
  const price = modelPriceOf(g.model, prices);
  switch (g.type) {
    case "chat": {
      const out = prices[g.model]?.outputPrice ?? price;
      return (
        g.providerCost +
        (g.estPromptTokens / 1e6) * price +
        (g.estCompletionTokens / 1e6) * out +
        (g.estUnits / 1e6) * price
      );
    }
    case "tts":
      return g.providerCost + (g.estUnits / 1000) * price;
    case "stt":
      return g.providerCost + (g.estUnits / 60) * price;
    default:
      return g.providerCost + g.estCount * price;
  }
}

// ─── Результат ───────────────────────────────────────────────────────────────

export interface OperationResult {
  key: OperationKey;
  label: string;
  unit: string;
  costUsd: number;
  samples: number;
  basis: string;
  currentCredits: number;
  /** Маржа при текущей цене; null — операция бесплатна. */
  currentMargin: number | null;
  recommendedCredits: number;
  recommendedMargin: number | null;
  note?: string;
}

export interface ModelResult extends ModelCost {
  currentCredits: number;
  currentMargin: number | null;
  recommendedCredits: number;
  recommendedMargin: number | null;
}

export interface MixResult {
  /** Кредитов в месяц на профиль потребления. */
  credits: number;
  /** Себестоимость профиля, USD в месяц. */
  costUsd: number;
  /** Себестоимость одного потраченного кредита, USD. */
  costPerCredit: number;
  /** Сколько пользователь заплатит за эти кредиты по цене кредита, USD. */
  spendUsd: number;
  /** Маржа на этом профиле. */
  margin: number | null;
}

export interface ProductResult extends ProductInput {
  usdPerCredit: number | null;
  /** Чистая выручка после комиссий и возвратов, USD. */
  netUsd: number;
  /** Себестоимость, если все кредиты потрачены по профилю (текущие цены), USD. */
  aiCostUsd: number;
  margin: number | null;
  /** Маржа при рекомендованных ценах операций. */
  marginRecommended: number | null;
  /** Максимум кредитов, при котором маржа (по рекомендованным ценам) не ниже целевой. */
  maxCreditsAtTarget: number;
  status: "ok" | "low" | "loss";
}

export interface GridItem {
  kind: "credits" | "premium";
  title: string;
  priceUsd: number;
  credits: number;
  bonusPct: number;
  periodDays: number | null;
  usdPerCredit: number;
  margin: number | null;
}

export interface FinanceResult {
  assumptions: Assumptions;
  netShare: number;
  netCreditValueUsd: number;
  operations: OperationResult[];
  models: ModelResult[];
  recommendedPrices: CreditPrices;
  mix: { current: MixResult; recommended: MixResult };
  products: ProductResult[];
  grid: GridItem[];
  welcomeBonus: { credits: number; costUsd: number };
  warnings: string[];
}

// ─── Расчёт ──────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function finiteOr(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** Округление денег до 6 знаков (себестоимость операций — доли цента). */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Маржа при выручке revenue и себестоимости cost; null — выручки нет. */
export function marginOf(revenue: number, cost: number): number | null {
  if (revenue <= 0) return null;
  return 1 - cost / revenue;
}

/** Нормализует допущения: доли в разумных пределах, неотрицательные числа. */
export function normalizeAssumptions(raw: Partial<Assumptions>, fallback: Assumptions): Assumptions {
  const usage = { ...fallback.usage, ...(raw.usage ?? {}) };
  for (const k of Object.keys(usage) as (keyof UsageMix)[]) usage[k] = Math.max(0, finiteOr(usage[k], fallback.usage[k]));
  const overrides: Partial<Record<OperationKey, number>> = {};
  for (const [k, value] of Object.entries((raw.costOverrides ?? {}) as Record<string, unknown>)) {
    const n = Number(value);
    if (OPERATION_KEYS.includes(k as OperationKey) && value !== null && value !== "" && Number.isFinite(n) && n >= 0) {
      overrides[k as OperationKey] = n;
    }
  }
  const prices = (list: unknown, def: number[]) => {
    const arr = Array.isArray(list) ? list.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
    return (arr.length ? arr : def).slice(0, 8).sort((a, b) => a - b);
  };
  return {
    targetMargin: clamp(finiteOr(raw.targetMargin, fallback.targetMargin), 0, 0.95),
    paymentFeePct: clamp(finiteOr(raw.paymentFeePct, fallback.paymentFeePct), 0, 0.9),
    paymentFixedUsd: Math.max(0, finiteOr(raw.paymentFixedUsd, fallback.paymentFixedUsd)),
    refundPct: clamp(finiteOr(raw.refundPct, fallback.refundPct), 0, 0.9),
    creditPriceUsd: Math.max(0.0001, finiteOr(raw.creditPriceUsd, fallback.creditPriceUsd)),
    usage,
    costOverrides: overrides,
    gridPrices: prices(raw.gridPrices, fallback.gridPrices ?? DEFAULT_GRID_PRICES),
    premiumPrices: prices(raw.premiumPrices, fallback.premiumPrices ?? DEFAULT_PREMIUM_PRICES),
  };
}

/**
 * Цена кредита по умолчанию — самая низкая цена кредита среди активных пакетов
 * (на ней маржа минимальна). Нет пакетов — $0.01 (100 кредитов = $1).
 */
export function defaultCreditPrice(products: ProductInput[]): number {
  const perCredit = products
    .filter((p) => p.active && p.kind === "credits" && p.credits > 0 && p.priceUsd > 0)
    .map((p) => p.priceUsd / p.credits);
  return perCredit.length ? round6(Math.min(...perCredit)) : 0.01;
}

/** Допущения по умолчанию: данные платформы + типичные комиссии. */
export function defaultAssumptions(data: FinanceData): Assumptions {
  const fromData = data.usage.payingUsers > 0 ? data.usage.perPayingUser : data.usage.perActiveUser;
  const hasUsage = Object.values(fromData).some((v) => v > 0);
  return {
    targetMargin: 0.7,
    paymentFeePct: 0.1,
    paymentFixedUsd: 0.3,
    refundPct: 0.03,
    creditPriceUsd: defaultCreditPrice(data.products),
    // Нет истории — условный активный пользователь: 300 сообщений, 20 фото, 2 видео в месяц.
    usage: hasUsage
      ? fromData
      : { chatMessages: 300, images: 20, hiresImages: 0, videos: 2, ttsChars: 3000, sttMessages: 10 },
    costOverrides: {},
    gridPrices: DEFAULT_GRID_PRICES,
    premiumPrices: DEFAULT_PREMIUM_PRICES,
  };
}

/** Цена в кредитах, при которой операция даёт целевую маржу. */
export function recommendCredits(costUsd: number, netCreditValueUsd: number, targetMargin: number): number {
  if (costUsd <= 0) return 0;
  const perCredit = netCreditValueUsd * (1 - targetMargin);
  if (perCredit <= 0) return 0;
  // Защита от погрешности float: 0.3 / 0.1 = 2.9999999999999996 → 3, а не 4.
  return Math.max(1, Math.ceil(round6(costUsd / perCredit)));
}

/** Кредиты и себестоимость профиля потребления при заданных ценах. */
export function mixOf(
  usage: UsageMix,
  costs: Record<OperationKey, number>,
  prices: CreditPrices,
  creditPriceUsd: number,
  netShare: number,
): MixResult {
  const credits =
    usage.chatMessages * prices.chat_message +
    usage.images * prices.image +
    usage.hiresImages * prices.image_hires_extra +
    usage.videos * prices.video +
    (usage.ttsChars / 1000) * prices.tts_per_1k_chars +
    usage.sttMessages * prices.stt_message;
  const costUsd =
    usage.chatMessages * costs.chat_message +
    usage.images * costs.image +
    usage.hiresImages * costs.image_hires_extra +
    usage.videos * costs.video +
    (usage.ttsChars / 1000) * costs.tts_per_1k_chars +
    usage.sttMessages * costs.stt_message;
  const spendUsd = credits * creditPriceUsd;
  return {
    credits: Math.round(credits),
    costUsd: round6(costUsd),
    costPerCredit: credits > 0 ? round6(costUsd / credits) : 0,
    spendUsd: Math.round(spendUsd * 100) / 100,
    margin: marginOf(spendUsd * netShare, costUsd),
  };
}

/** «Красивое» число кредитов: округление вниз до 5/10/50/100 в зависимости от величины. */
export function niceCredits(n: number): number {
  if (n <= 0) return 0;
  const step = n >= 10_000 ? 500 : n >= 2_000 ? 100 : n >= 500 ? 50 : n >= 100 ? 10 : 5;
  const rounded = Math.floor(n / step) * step;
  // Только вниз: округление вверх нарушило бы ограничение по марже.
  return rounded > 0 ? rounded : Math.floor(n);
}

/** Чистая выручка с продукта: после процентной и фиксированной комиссии и возвратов. */
export function productNet(priceUsd: number, a: Assumptions): number {
  return Math.max(0, priceUsd * (1 - a.paymentFeePct - a.refundPct) - a.paymentFixedUsd);
}

/** Полный расчёт финансовой модели. */
export function calculateFinanceModel(data: FinanceData, rawAssumptions: Partial<Assumptions>): FinanceResult {
  const a = normalizeAssumptions(rawAssumptions, defaultAssumptions(data));
  const warnings: string[] = [];
  const netShare = Math.max(0, 1 - a.paymentFeePct - a.refundPct);
  const netCreditValueUsd = a.creditPriceUsd * netShare;

  // Себестоимость операций: данные платформы или ручные значения.
  const costs = {} as Record<OperationKey, number>;
  const operations: OperationResult[] = OPERATION_KEYS.map((key) => {
    const base = data.costs[key];
    const override = a.costOverrides?.[key];
    const costUsd = override !== undefined ? override : base.costUsd;
    costs[key] = costUsd;
    const currentCredits = data.prices[key];
    // Приветствие запускается автоматически — оставляем текущую цену (обычно бесплатно).
    const isGreeting = key === "chat_greeting";
    const recommendedCredits = isGreeting ? currentCredits : recommendCredits(costUsd, netCreditValueUsd, a.targetMargin);
    return {
      key,
      label: OPERATION_META[key].label,
      unit: OPERATION_META[key].unit,
      costUsd: round6(costUsd),
      samples: override !== undefined ? 0 : base.samples,
      basis: override !== undefined ? "задано вручную" : base.basis,
      currentCredits,
      currentMargin: marginOf(currentCredits * netCreditValueUsd, costUsd),
      recommendedCredits,
      recommendedMargin: marginOf(recommendedCredits * netCreditValueUsd, costUsd),
      ...(isGreeting ? { note: "Запускается автоматически — цена не меняется, расход идёт в маркетинг" } : {}),
    };
  });

  // Цены по моделям: у каждой модели с историей — своя рекомендованная цена.
  const models: ModelResult[] = data.modelCosts.map((m) => {
    const table = m.type === "image" ? data.prices.image_models : data.prices.video_models;
    const fallback = m.type === "image" ? data.prices.image : data.prices.video;
    const currentCredits = table[m.model] ?? fallback;
    const recommendedCredits = recommendCredits(m.costUsd, netCreditValueUsd, a.targetMargin);
    return {
      ...m,
      costUsd: round6(m.costUsd),
      currentCredits,
      currentMargin: marginOf(currentCredits * netCreditValueUsd, m.costUsd),
      recommendedCredits,
      recommendedMargin: marginOf(recommendedCredits * netCreditValueUsd, m.costUsd),
    };
  });

  const recommendedPrices: CreditPrices = {
    chat_message: 0,
    chat_greeting: 0,
    stt_message: 0,
    tts_per_1k_chars: 0,
    image: 0,
    image_hires_extra: 0,
    video: 0,
    // Сохраняем цены моделей, которых нет в истории, — их не с чем сравнить.
    image_models: { ...data.prices.image_models },
    video_models: { ...data.prices.video_models },
  };
  for (const op of operations) recommendedPrices[op.key] = op.recommendedCredits;
  for (const m of models) {
    if (m.recommendedCredits > 0) {
      (m.type === "image" ? recommendedPrices.image_models : recommendedPrices.video_models)[m.model] = m.recommendedCredits;
    }
  }

  const mix = {
    current: mixOf(a.usage, costs, data.prices, a.creditPriceUsd, netShare),
    recommended: mixOf(a.usage, costs, recommendedPrices, a.creditPriceUsd, netShare),
  };

  // Тарифы: маржа, если все кредиты потрачены по профилю потребления.
  const products: ProductResult[] = data.products.map((p) => {
    const netUsd = productNet(p.priceUsd, a);
    const aiCostUsd = p.credits * mix.current.costPerCredit;
    const aiCostRecommended = p.credits * mix.recommended.costPerCredit;
    const margin = marginOf(netUsd, aiCostUsd);
    const maxCredits =
      mix.recommended.costPerCredit > 0 ? Math.floor((netUsd * (1 - a.targetMargin)) / mix.recommended.costPerCredit) : 0;
    return {
      ...p,
      usdPerCredit: p.credits > 0 ? round6(p.priceUsd / p.credits) : null,
      netUsd: round6(netUsd),
      aiCostUsd: round6(aiCostUsd),
      margin,
      marginRecommended: marginOf(netUsd, aiCostRecommended),
      maxCreditsAtTarget: maxCredits,
      status: margin === null || margin < 0 ? "loss" : margin < a.targetMargin ? "low" : "ok",
    };
  });

  // Предлагаемая сетка: базовая цена кредита, крупным пакетам — бонус кредитов.
  // Бонус ограничен целевой маржой: на нём цена кредита ниже базовой.
  const costPerCredit = mix.recommended.costPerCredit;
  const grid: GridItem[] = [];
  (a.gridPrices ?? DEFAULT_GRID_PRICES).forEach((priceUsd, i) => {
    const netUsd = productNet(priceUsd, a);
    const base = priceUsd / a.creditPriceUsd;
    const maxByMargin = costPerCredit > 0 ? (netUsd * (1 - a.targetMargin)) / costPerCredit : Infinity;
    const bonus = GRID_BONUSES[Math.min(i, GRID_BONUSES.length - 1)];
    const credits = niceCredits(Math.min(base * (1 + bonus), maxByMargin));
    if (credits <= 0) return;
    grid.push({
      kind: "credits",
      title: `${credits} кредитов`,
      priceUsd,
      credits,
      bonusPct: Math.round((credits / base - 1) * 100),
      periodDays: null,
      usdPerCredit: round6(priceUsd / credits),
      margin: marginOf(netUsd, credits * costPerCredit),
    });
  });
  for (const priceUsd of a.premiumPrices ?? DEFAULT_PREMIUM_PRICES) {
    const netUsd = productNet(priceUsd, a);
    // Premium снимает ограничения демо-режима; кредиты — по той же цене, что пакет.
    const maxByMargin = costPerCredit > 0 ? (netUsd * (1 - a.targetMargin)) / costPerCredit : Infinity;
    const credits = niceCredits(Math.min(priceUsd / a.creditPriceUsd, maxByMargin));
    if (credits <= 0) continue;
    grid.push({
      kind: "premium",
      title: `Premium 30 дней + ${credits} кредитов`,
      priceUsd,
      credits,
      bonusPct: 0,
      periodDays: 30,
      usdPerCredit: round6(priceUsd / credits),
      margin: marginOf(netUsd, credits * costPerCredit),
    });
  }

  // Предупреждения.
  if (netShare <= 0) warnings.push("Комиссии и возвраты забирают всю выручку — проверьте допущения.");
  for (const op of operations) {
    if (op.key !== "chat_greeting" && op.costUsd > 0 && op.currentMargin !== null && op.currentMargin < 0) {
      warnings.push(`«${op.label}»: текущая цена ниже себестоимости — каждая операция в убыток.`);
    }
  }
  const lossModels = models.filter((m) => m.currentMargin !== null && m.currentMargin < 0);
  if (lossModels.length) {
    warnings.push(`Генерации в убыток на моделях: ${lossModels.map((m) => m.model).join(", ")}.`);
  }
  for (const p of products) {
    if (p.active && p.status === "loss") warnings.push(`Тариф «${p.title}» убыточен при полном расходовании кредитов.`);
  }
  if (data.welcomeBonus > 0 && mix.current.costPerCredit > 0) {
    const cost = data.welcomeBonus * mix.current.costPerCredit;
    if (cost > 0.5) warnings.push(`Стартовый бонус обходится в $${cost.toFixed(2)} на каждого нового пользователя.`);
  }
  const noHistory = OPERATION_KEYS.filter((k) => k !== "chat_greeting" && data.costs[k].samples === 0);
  if (noHistory.length) {
    warnings.push(
      `Нет истории за ${data.windowDays} дней для: ${noHistory.map((k) => OPERATION_META[k].label).join(", ")} — себестоимость оценена по ценам моделей.`,
    );
  }

  return {
    assumptions: a,
    netShare: round6(netShare),
    netCreditValueUsd: round6(netCreditValueUsd),
    operations,
    models,
    recommendedPrices,
    mix,
    products,
    grid,
    welcomeBonus: { credits: data.welcomeBonus, costUsd: round6(data.welcomeBonus * mix.current.costPerCredit) },
    warnings,
  };
}
