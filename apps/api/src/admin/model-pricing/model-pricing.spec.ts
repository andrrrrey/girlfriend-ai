import {
  applyCatalogPrices,
  guessModelType,
  normalizeMetaMap,
  parseAtlasCatalog,
  parseOpenRouterCatalog,
  resolveModelPrice,
  type PriceCatalogs,
} from "./model-pricing";

// Фрагменты реальных ответов каталогов (форматы на ноябрь 2026).
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
    { model: "atlascloud/van-2.6/text-to-video", type: "Video", price: { actual: { base_price: "0.068" } } },
    { model: "some/video-unit", type: "Video", price: { actual: { base_price: "0.05", unit: "second" } } },
    { model: "some/audio", type: "Audio", price: { actual: { base_price: "0.1", unit: "1k characters" } } },
    { model: "minimaxai/minimax-m2.5", type: "Text", price: { actual: { type: "flat", input_price: "0.295", output_price: "1.2" } } },
    { model: "no/price", type: "Image" },
  ],
};

function catalogs(): PriceCatalogs {
  return { openrouter: parseOpenRouterCatalog(OPENROUTER), atlascloud: parseAtlasCatalog(ATLAS) };
}

describe("model-pricing: разбор каталогов", () => {
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

  it("неожиданный формат ответа — ошибка (каталог не применяется)", () => {
    expect(() => parseOpenRouterCatalog({ error: "x" })).toThrow();
    expect(() => parseAtlasCatalog("<html>")).toThrow();
  });
});

describe("model-pricing: сопоставление моделей", () => {
  it("чат: цена входа и выхода из OpenRouter", () => {
    const r = resolveModelPrice("minimax/minimax-m2.5", "chat", catalogs());
    expect(r).toMatchObject({ ok: true, price: { source: "openrouter", price: 0.27, outputPrice: 0.95 } });
  });

  it("изображение: плоская цена за генерацию", () => {
    const r = resolveModelPrice("alibaba/wan-2.6/text-to-image", "image", catalogs());
    expect(r).toMatchObject({ ok: true, price: { source: "atlascloud", price: 0.021 } });
  });

  it("видео: цена за секунду × 5 секунд", () => {
    const r = resolveModelPrice("atlascloud/van-2.6/text-to-video", "video", catalogs());
    expect(r).toMatchObject({ ok: true, price: { price: 0.34 } });
  });

  it("модели нет у провайдеров / у провайдера нет API цен — причина вместо цены", () => {
    expect(resolveModelPrice("sdxl", "image", catalogs())).toMatchObject({ ok: false });
    expect(resolveModelPrice("eleven_multilingual_v2", "tts", catalogs())).toMatchObject({ ok: false });
    expect(resolveModelPrice("llama-3.1-8b-uncensored", "chat", { openrouter: null, atlascloud: null })).toMatchObject({
      ok: false,
      reason: "каталоги провайдеров недоступны",
    });
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
    const prices = { "minimax/minimax-m2.5": 0.1, "alibaba/wan-2.6/text-to-image": 0.05, sdxl: 0.004 };
    const meta = normalizeMetaMap({ "alibaba/wan-2.6/text-to-image": { source: "manual", locked: true } });
    const res = applyCatalogPrices(
      prices,
      meta,
      [
        { model: "minimax/minimax-m2.5", type: "chat" },
        { model: "alibaba/wan-2.6/text-to-image", type: "image" },
        { model: "sdxl", type: "image" },
      ],
      catalogs(),
      NOW,
    );

    expect(res.prices["minimax/minimax-m2.5"]).toBe(0.27);
    expect(res.meta["minimax/minimax-m2.5"]).toMatchObject({ source: "openrouter", outputPrice: 0.95, updatedAt: NOW });
    expect(res.prices["alibaba/wan-2.6/text-to-image"]).toBe(0.05);
    expect(res.prices.sdxl).toBe(0.004);
    expect(res.meta.sdxl.lastError).toBeTruthy();
    expect(res.items.map((i) => i.status)).toEqual(["updated", "locked", "not_found"]);
  });

  it("цена не изменилась — дата обновления прежняя", () => {
    const prices = { "minimax/minimax-m2.5": 0.27 };
    const meta = normalizeMetaMap({ "minimax/minimax-m2.5": { source: "openrouter", outputPrice: 0.95, updatedAt: "2026-11-01T00:00:00.000Z" } });
    const res = applyCatalogPrices(prices, meta, [{ model: "minimax/minimax-m2.5", type: "chat" }], catalogs(), NOW);
    expect(res.items[0].status).toBe("unchanged");
    expect(res.meta["minimax/minimax-m2.5"].updatedAt).toBe("2026-11-01T00:00:00.000Z");
  });
});
