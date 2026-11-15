import {
  applyCatalogPrices,
  emptyCatalogs,
  findAtlasSimilar,
  guessModelType,
  median,
  normalizeMetaMap,
  parseAtlasCatalog,
  parseElevenLabsPricing,
  parseModelsLabPricing,
  parseOpenAIPricing,
  parseOpenRouterCatalog,
  resolveModelPrice,
  type PriceCatalogs,
} from "./model-pricing";

// Фрагменты реальных ответов и страниц провайдеров (форматы на ноябрь 2026).
const OPENROUTER = {
  data: [
    { id: "minimax/minimax-m2.5", pricing: { prompt: "0.00000027", completion: "0.00000095" } },
    { id: "broken/model", pricing: { prompt: "abc" } },
  ],
};

const ATLAS = {
  code: "200",
  data: [
    { model: "alibaba/wan-2.6/text-to-image", type: "Image", price: { actual: { base_price: "0.021" }, origin: { base_price: "0.03" } } },
    { model: "alibaba/wan-2.6/image-to-video", type: "Video", price: { actual: { base_price: "0.07" } } },
    { model: "alibaba/wan-2.6/image-to-video-flash", type: "Video", price: { actual: { base_price: "0.018" } } },
    { model: "atlascloud/van-2.6/text-to-video", type: "Video", price: { actual: { base_price: "0.068" } } },
    { model: "minimaxai/minimax-m2.5", type: "Text", price: { actual: { type: "flat", input_price: "0.295", output_price: "1.2" } } },
    { model: "no/price", type: "Image" },
  ],
};

const MODELSLAB_HTML = `<html><head><script>var x = "$9.99";</script></head><body>
  <p>Image generation starts at $0.0047 per image, video generation from $0.02 per second, and LLM inference from $0.20 per million tokens.</p>
  <h2>Stable Diffusion API pricing</h2><p>A Stable Diffusion API call costs <b>$0.0047</b> on the $47/month Standard plan (10,000 calls).</p>
</body></html>`;

const ELEVENLABS_HTML = `<div><span>v2 Multilingual</span> <span>Text to Speech</span> <span>$0.08</span> <span>Price per 1K characters</span></div>
  <div>Flash / Turbo Text to Speech $0.04 Price per 1K characters</div>
  <div>v3 Conversational Text to Speech $0.04 Price per 1K characters</div>
  <div>v3 Text to Speech $0.08 Price per 1K characters</div>`;

const OPENAI_HTML =
  `<x data="{&quot;model&quot;:[0,&quot;gpt-4o-mini-transcribe&quot;],&quot;rows&quot;:[1,[[1,[[0,&quot;Transcription&quot;],[0,1.25],[0,5],[0,&quot;$0.003 / minute&quot;]]]]]}` +
  `,{&quot;model&quot;:[0,&quot;Whisper&quot;],&quot;modelId&quot;:[0,&quot;whisper-1&quot;],&quot;rows&quot;:[1,[[1,[[0,&quot;Transcription&quot;],[0,&quot;-&quot;],[0,&quot;-&quot;],[0,&quot;$0.006 / minute&quot;]]]]]}"></x>`;

function catalogs(): PriceCatalogs {
  return {
    ...emptyCatalogs(),
    openrouter: parseOpenRouterCatalog(OPENROUTER),
    atlascloud: parseAtlasCatalog(ATLAS),
    modelslab: parseModelsLabPricing(MODELSLAB_HTML),
    elevenlabs: parseElevenLabsPricing(ELEVENLABS_HTML),
    openai: parseOpenAIPricing(OPENAI_HTML),
    civitai: new Map([
      ["urn:air:sdxl:checkpoint:civitai:1@2", { usd: 0.006, buzz: 6 }],
      ["civitai", { usd: 0.005, buzz: 5 }],
    ]),
    history: new Map([["minimax/minimax-m2-her", { per1M: 0.42, replies: 120 }]]),
    modelslabModels: new Set(["sdxl", "flux", "llama-3.1-8b-uncensored"]),
  };
}

describe("model-pricing: разбор источников", () => {
  it("OpenRouter: цены за токен → за 1M токенов, битые записи пропускаются", () => {
    const or = parseOpenRouterCatalog(OPENROUTER);
    expect(or.get("minimax/minimax-m2.5")).toEqual({ inputPer1M: 0.27, outputPer1M: 0.95 });
    expect(or.has("broken/model")).toBe(false);
  });

  it("Atlas: берётся фактическая цена (со скидкой), записи без цены пропускаются", () => {
    const atlas = parseAtlasCatalog(ATLAS);
    expect(atlas.get("alibaba/wan-2.6/text-to-image")?.basePrice).toBe(0.021);
    expect(atlas.get("minimaxai/minimax-m2.5")).toMatchObject({ inputPer1M: 0.295, outputPer1M: 1.2 });
    expect(atlas.has("no/price")).toBe(false);
  });

  it("ModelsLab: цена вызова на тарифе и цена LLM, скрипты игнорируются", () => {
    expect(parseModelsLabPricing(MODELSLAB_HTML)).toEqual({ imagePerCall: 0.0047, plan: "Standard", llmPer1M: 0.2 });
  });

  it("ElevenLabs: цены по группам моделей, v3 не путается с v3 Conversational", () => {
    const el = parseElevenLabsPricing(ELEVENLABS_HTML);
    expect(el.get("v2 Multilingual")).toBe(0.08);
    expect(el.get("Flash / Turbo")).toBe(0.04);
    expect(el.get("v3")).toBe(0.08);
    expect(el.get("v3 Conversational")).toBe(0.04);
  });

  it("OpenAI: цены за минуту по id модели", () => {
    const oa = parseOpenAIPricing(OPENAI_HTML);
    expect(oa.get("whisper-1")).toBe(0.006);
    expect(oa.get("gpt-4o-mini-transcribe")).toBe(0.003);
  });

  it("неожиданный формат — ошибка (источник не применяется)", () => {
    expect(() => parseOpenRouterCatalog({ error: "x" })).toThrow();
    expect(() => parseAtlasCatalog("<html>")).toThrow();
    expect(() => parseModelsLabPricing("<html>maintenance</html>")).toThrow();
    expect(() => parseElevenLabsPricing("<html></html>")).toThrow();
    expect(() => parseOpenAIPricing("<html></html>")).toThrow();
  });

  it("медиана", () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("model-pricing: сопоставление моделей", () => {
  it("чат: OpenRouter → история фактических расходов → ModelsLab", () => {
    const c = catalogs();
    expect(resolveModelPrice("minimax/minimax-m2.5", "chat", c)).toMatchObject({
      ok: true,
      price: { source: "openrouter", price: 0.27, outputPrice: 0.95 },
    });
    expect(resolveModelPrice("minimax/minimax-m2-her", "chat", c)).toMatchObject({
      ok: true,
      price: { source: "history", price: 0.42 },
    });
    expect(resolveModelPrice("llama-3.1-8b-uncensored", "chat", c)).toMatchObject({
      ok: true,
      price: { source: "modelslab", price: 0.2 },
    });
    expect(resolveModelPrice("llama-3-70b-instruct", "chat", c)).toMatchObject({ ok: false });
  });

  it("изображения: Atlas, ModelsLab, Civitai (чекпоинт и базовая цена)", () => {
    const c = catalogs();
    expect(resolveModelPrice("alibaba/wan-2.6/text-to-image", "image", c)).toMatchObject({ ok: true, price: { source: "atlascloud", price: 0.021 } });
    expect(resolveModelPrice("sdxl", "image", c)).toMatchObject({ ok: true, price: { source: "modelslab", price: 0.0047 } });
    expect(resolveModelPrice("urn:air:sdxl:checkpoint:civitai:1@2", "image", c)).toMatchObject({ ok: true, price: { source: "civitai", price: 0.006 } });
    expect(resolveModelPrice("civitai", "image", c)).toMatchObject({ ok: true, price: { source: "civitai", price: 0.005 } });
    expect(resolveModelPrice("urn:air:sdxl:checkpoint:civitai:9@9", "image", c)).toMatchObject({ ok: false });
  });

  it("видео: цена за секунду × 5, аналогичная модель для spicy-версии", () => {
    const c = catalogs();
    expect(resolveModelPrice("atlascloud/van-2.6/text-to-video", "video", c)).toMatchObject({ ok: true, price: { price: 0.34 } });
    const spicy = resolveModelPrice("atlascloud/wan-2.6-spicy/image-to-video", "video", c);
    expect(spicy).toMatchObject({ ok: true, price: { source: "atlascloud", price: 0.35 } });
    expect(spicy.ok && spicy.price.note).toContain("alibaba/wan-2.6/image-to-video");
  });

  it("поиск аналогичной модели Atlas не цепляет flash-версию", () => {
    expect(findAtlasSimilar("atlascloud/wan-2.6-spicy/image-to-video", parseAtlasCatalog(ATLAS))).toBe("alibaba/wan-2.6/image-to-video");
    expect(findAtlasSimilar("sdxl", parseAtlasCatalog(ATLAS))).toBeUndefined();
  });

  it("озвучка и распознавание", () => {
    const c = catalogs();
    expect(resolveModelPrice("eleven_multilingual_v2", "tts", c)).toMatchObject({ ok: true, price: { source: "elevenlabs", price: 0.08 } });
    expect(resolveModelPrice("eleven_flash_v2_5", "tts", c)).toMatchObject({ ok: true, price: { price: 0.04 } });
    expect(resolveModelPrice("whisper-1", "stt", c)).toMatchObject({ ok: true, price: { source: "openai", price: 0.006 } });
  });

  it("источник недоступен — причина вместо цены", () => {
    const r = resolveModelPrice("urn:air:sdxl:checkpoint:civitai:1@2", "image", emptyCatalogs());
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toContain("Civitai");
  });

  it("тип модели без истории генераций", () => {
    expect(guessModelType("eleven_turbo_v2_5")).toBe("tts");
    expect(guessModelType("gpt-4o-mini-transcribe")).toBe("stt");
    expect(guessModelType("urn:air:sdxl:checkpoint:civitai:1@2")).toBe("image");
    expect(guessModelType("minimax/minimax-m2-her")).toBe("chat");
  });
});

describe("model-pricing: применение цен", () => {
  const NOW = "2026-11-15T02:00:00.000Z";

  it("обновляет незафиксированные, не трогает зафиксированные, ненайденные сохраняют цену", () => {
    const prices = { "minimax/minimax-m2.5": 0.1, "alibaba/wan-2.6/text-to-image": 0.05, "juggernaut-xl": 0.004 };
    const meta = normalizeMetaMap({ "alibaba/wan-2.6/text-to-image": { source: "manual", locked: true } });
    const res = applyCatalogPrices(
      prices,
      meta,
      [
        { model: "minimax/minimax-m2.5", type: "chat" },
        { model: "alibaba/wan-2.6/text-to-image", type: "image" },
        { model: "juggernaut-xl", type: "image" },
      ],
      catalogs(),
      NOW,
    );

    expect(res.prices["minimax/minimax-m2.5"]).toBe(0.27);
    expect(res.meta["minimax/minimax-m2.5"]).toMatchObject({ source: "openrouter", outputPrice: 0.95, updatedAt: NOW });
    expect(res.prices["alibaba/wan-2.6/text-to-image"]).toBe(0.05);
    // juggernaut-xl не входит в modelslabModels тестового каталога — цена остаётся.
    expect(res.prices["juggernaut-xl"]).toBe(0.004);
    expect(res.meta["juggernaut-xl"].lastError).toBeTruthy();
    expect(res.items.map((i) => i.status)).toEqual(["updated", "locked", "not_found"]);
  });

  it("цена не изменилась — дата обновления прежняя", () => {
    const prices = { "minimax/minimax-m2.5": 0.27 };
    const meta = normalizeMetaMap({
      "minimax/minimax-m2.5": { source: "openrouter", outputPrice: 0.95, updatedAt: "2026-11-01T00:00:00.000Z" },
    });
    const res = applyCatalogPrices(prices, meta, [{ model: "minimax/minimax-m2.5", type: "chat" }], catalogs(), NOW);
    expect(res.items[0].status).toBe("unchanged");
    expect(res.meta["minimax/minimax-m2.5"].updatedAt).toBe("2026-11-01T00:00:00.000Z");
  });
});
