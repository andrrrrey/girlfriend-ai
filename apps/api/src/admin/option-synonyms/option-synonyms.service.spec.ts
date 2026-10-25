jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { parseSynonymsResponse } from "./option-synonyms.service";
import { normalizeSynonyms, MAX_SYNONYMS } from "../../generation/prompt/synonyms";

describe("normalizeSynonyms", () => {
  it("чистит регистр, пробелы, дубли и название самой опции", () => {
    expect(normalizeSynonyms(["  Купальник ", "купальник", "Bikini", "", 5, "в   бикини"], "Bikini")).toEqual([
      "купальник",
      "в бикини",
    ]);
  });

  it("ограничивает количество и длину синонимов", () => {
    const many = Array.from({ length: 30 }, (_, i) => `syn ${i}`);
    expect(normalizeSynonyms(many)).toHaveLength(MAX_SYNONYMS);
    expect(normalizeSynonyms(["x".repeat(61)])).toEqual([]);
  });
});

describe("parseSynonymsResponse", () => {
  const batch = [
    { id: "o1", name: "Bikini", prompt: "red bikini" },
    { id: "o2", name: "Beach", prompt: null },
  ];

  it("берёт синонимы только известных опций из JSON (в т.ч. в markdown-блоке)", () => {
    const raw = '```json\n{"o1": ["Купальник", "bikini", "swimsuit"], "o2": "not a list", "zzz": ["x"]}\n```';
    const result = parseSynonymsResponse(raw, batch);
    expect([...result.entries()]).toEqual([["o1", ["купальник", "swimsuit"]]]);
  });

  it("невалидный ответ — пустой результат", () => {
    expect(parseSynonymsResponse("sorry, cannot help", batch).size).toBe(0);
    expect(parseSynonymsResponse("{broken", batch).size).toBe(0);
  });
});
