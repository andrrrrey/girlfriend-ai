import { DEFAULT_PRICES, normalizePrices, quote } from "./pricing";

describe("pricing", () => {
  it("недостающие и некорректные поля заменяются значениями по умолчанию", () => {
    const prices = normalizePrices({ chat_message: 3, image: -5, video: "abc", extra: 1, image_models: { a: 7, b: -1 } });
    expect(prices.chat_message).toBe(3);
    expect(prices.image).toBe(DEFAULT_PRICES.image);
    expect(prices.video).toBe(DEFAULT_PRICES.video);
    expect(prices.image_models).toEqual({ a: 7 });
    expect(prices).not.toHaveProperty("extra");
  });

  it("озвучка считается за каждые начатые 1000 символов, минимум 1", () => {
    const prices = normalizePrices({ tts_per_1k_chars: 2 });
    expect(quote(prices, { kind: "tts", characters: 0 })).toBe(2);
    expect(quote(prices, { kind: "tts", characters: 1000 })).toBe(2);
    expect(quote(prices, { kind: "tts", characters: 1001 })).toBe(4);
  });

  it("цена модели переопределяет цену по умолчанию, hires добавляет надбавку", () => {
    const prices = normalizePrices({ image: 5, image_hires_extra: 3, image_models: { premium: 9, free: 0 } });
    expect(quote(prices, { kind: "image" })).toBe(5);
    expect(quote(prices, { kind: "image", model: "premium" })).toBe(9);
    expect(quote(prices, { kind: "image", model: "free" })).toBe(0);
    expect(quote(prices, { kind: "image", model: "unknown", hiresFix: true })).toBe(8);
  });
});
