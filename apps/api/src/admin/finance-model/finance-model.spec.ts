import {
  calculateFinanceModel,
  defaultCreditPrice,
  groupCostUsd,
  marginOf,
  niceCredits,
  normalizeAssumptions,
  recommendCredits,
  defaultAssumptions,
  type FinanceData,
  type OperationCost,
} from "./finance-model";

const op = (costUsd: number, samples = 100): OperationCost => ({ costUsd, samples, basis: "тест" });

function data(overrides: Partial<FinanceData> = {}): FinanceData {
  return {
    windowDays: 30,
    costs: {
      chat_message: op(0.0006),
      chat_greeting: op(0.0006),
      stt_message: op(0.003),
      tts_per_1k_chars: op(0.08),
      image: op(0.005),
      image_hires_extra: op(0.006),
      video: op(0.35),
    },
    modelCosts: [
      { type: "image", model: "sdxl", costUsd: 0.0047, samples: 50 },
      { type: "video", model: "alibaba/wan-2.7/image-to-video", costUsd: 0.5, samples: 10 },
    ],
    usage: {
      activeUsers: 100,
      payingUsers: 10,
      perActiveUser: { chatMessages: 100, images: 5, hiresImages: 0, videos: 0, ttsChars: 0, sttMessages: 0 },
      perPayingUser: { chatMessages: 600, images: 40, hiresImages: 2, videos: 4, ttsChars: 5000, sttMessages: 20 },
    },
    prices: {
      chat_message: 1,
      chat_greeting: 0,
      stt_message: 1,
      tts_per_1k_chars: 2,
      image: 5,
      image_hires_extra: 3,
      video: 30,
      image_models: {},
      video_models: { "alibaba/wan-2.7/image-to-video": 30 },
    },
    priceVersion: 3,
    welcomeBonus: 100,
    products: [
      { id: "p1", kind: "credits", title: "500 кредитов", priceUsd: 4.99, credits: 500, periodDays: null, active: true },
      { id: "p2", kind: "credits", title: "6000 кредитов", priceUsd: 49.99, credits: 6000, periodDays: null, active: true },
      { id: "p3", kind: "premium", title: "Premium", priceUsd: 9.99, credits: 1000, periodDays: 30, active: false },
    ],
    ...overrides,
  };
}

describe("finance-model: базовые формулы", () => {
  it("маржа", () => {
    expect(marginOf(10, 3)).toBeCloseTo(0.7);
    expect(marginOf(0, 3)).toBeNull();
    expect(marginOf(1, 2)).toBeCloseTo(-1);
  });

  it("цена в кредитах даёт не меньше целевой маржи и не страдает от float", () => {
    // Чистая стоимость кредита $0.01, маржа 70% → на себестоимость остаётся $0.003 с кредита.
    expect(recommendCredits(0.009, 0.01, 0.7)).toBe(3);
    expect(recommendCredits(0.0091, 0.01, 0.7)).toBe(4);
    expect(recommendCredits(0.0001, 0.01, 0.7)).toBe(1);
    expect(recommendCredits(0, 0.01, 0.7)).toBe(0);
  });

  it("цена кредита по умолчанию — самый дешёвый активный пакет", () => {
    expect(defaultCreditPrice(data().products)).toBeCloseTo(49.99 / 6000, 6);
    expect(defaultCreditPrice([])).toBe(0.01);
  });

  it("красивые числа кредитов", () => {
    expect(niceCredits(523)).toBe(500);
    expect(niceCredits(1234)).toBe(1200);
    expect(niceCredits(57)).toBe(55);
    expect(niceCredits(0)).toBe(0);
  });

  it("допущения ограничиваются разумными пределами", () => {
    const a = normalizeAssumptions(
      { targetMargin: 2, paymentFeePct: -1, creditPriceUsd: 0, costOverrides: { image: "" as any, video: 0.4 } },
      defaultAssumptions(data()),
    );
    expect(a.targetMargin).toBe(0.95);
    expect(a.paymentFeePct).toBe(0);
    expect(a.creditPriceUsd).toBeGreaterThan(0);
    expect(a.costOverrides).toEqual({ video: 0.4 });
  });
});

describe("finance-model: себестоимость группы заданий", () => {
  const prices = {
    chatm: { price: 0.3, outputPrice: 1.2 },
    civitai: { price: 0.005, outputPrice: null },
    "eleven_multilingual_v2": { price: 0.08, outputPrice: null },
    "whisper-1": { price: 0.006, outputPrice: null },
  };
  const g = { count: 0, providerCost: 0, estCount: 0, estUnits: 0, estPromptTokens: 0, estCompletionTokens: 0 };

  it("чат: фактическая стоимость + раздельные токены + старые записи по цене входа", () => {
    const cost = groupCostUsd(
      { ...g, type: "chat", model: "chatm", providerCost: 0.01, estPromptTokens: 1e6, estCompletionTokens: 1e6, estUnits: 1e6 },
      prices,
    );
    expect(cost).toBeCloseTo(0.01 + 0.3 + 1.2 + 0.3);
  });

  it("картинки Civitai без своей цены — по базовой цене civitai", () => {
    expect(groupCostUsd({ ...g, type: "image", model: "urn:air:sdxl:checkpoint:civitai:1@2", estCount: 10 }, prices)).toBeCloseTo(0.05);
  });

  it("озвучка за 1000 символов, распознавание за минуту", () => {
    expect(groupCostUsd({ ...g, type: "tts", model: "eleven_multilingual_v2", estUnits: 5000 }, prices)).toBeCloseTo(0.4);
    expect(groupCostUsd({ ...g, type: "stt", model: "whisper-1", estUnits: 120 }, prices)).toBeCloseTo(0.012);
  });
});

describe("finance-model: полный расчёт", () => {
  const assumptions = { targetMargin: 0.7, paymentFeePct: 0.1, refundPct: 0, paymentFixedUsd: 0, creditPriceUsd: 0.01 };

  it("рекомендованные цены дают целевую маржу на каждой операции", () => {
    const r = calculateFinanceModel(data(), assumptions);
    expect(r.netCreditValueUsd).toBeCloseTo(0.009);
    for (const o of r.operations) {
      if (o.key === "chat_greeting" || o.costUsd === 0) continue;
      expect(o.recommendedMargin!).toBeGreaterThanOrEqual(0.7 - 1e-9);
    }
    // Видео $0.35 при $0.0027 на себестоимость с кредита → 130 кредитов.
    expect(r.recommendedPrices.video).toBe(130);
    // Приветствие не меняется.
    expect(r.recommendedPrices.chat_greeting).toBe(0);
    // Цена по модели с историей.
    expect(r.recommendedPrices.video_models["alibaba/wan-2.7/image-to-video"]).toBe(186);
  });

  it("убыточные операции и модели попадают в предупреждения", () => {
    const r = calculateFinanceModel(data(), assumptions);
    expect(r.warnings.some((w) => w.includes("Видео"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("alibaba/wan-2.7/image-to-video"))).toBe(true);
  });

  it("тарифы: маржа при полном расходовании кредитов и максимум кредитов", () => {
    const r = calculateFinanceModel(data(), assumptions);
    const p1 = r.products.find((p) => p.id === "p1")!;
    expect(p1.netUsd).toBeCloseTo(4.99 * 0.9);
    expect(p1.aiCostUsd).toBeCloseTo(500 * r.mix.current.costPerCredit);
    expect(p1.maxCreditsAtTarget).toBe(Math.floor((p1.netUsd * 0.3) / r.mix.recommended.costPerCredit));
  });

  it("сетка тарифов укладывается в целевую маржу", () => {
    const r = calculateFinanceModel(data(), { ...assumptions, gridPrices: [4.99, 99.99], premiumPrices: [9.99] });
    expect(r.grid.map((g) => g.kind)).toEqual(["credits", "credits", "premium"]);
    for (const g of r.grid) expect(g.margin!).toBeGreaterThanOrEqual(0.7 - 1e-9);
  });

  it("ручная себестоимость переопределяет историю", () => {
    const r = calculateFinanceModel(data(), { ...assumptions, costOverrides: { image: 0.027 } });
    const image = r.operations.find((o) => o.key === "image")!;
    expect(image.costUsd).toBe(0.027);
    expect(image.basis).toBe("задано вручную");
    expect(image.recommendedCredits).toBe(10);
  });
});
