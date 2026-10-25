jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import {
  IntentRouter,
  classifyByRules,
  hasMediaHint,
  parseClassifierOutput,
  selectionsToSpec,
} from "./intent-router";
import { CATALOG } from "../generation/prompt/catalog.fixture";

describe("intent router", () => {
  const fetchMock = jest.fn();
  let router: IntentRouter;

  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    router = new IntentRouter({ get: jest.fn().mockResolvedValue(CATALOG) } as any);
  });

  it("быстрые правила: без медийных слов — обычный ответ без вызова модели", async () => {
    expect(hasMediaHint("как прошёл твой день?")).toBe(false);
    expect(hasMediaHint("Пришли фото в бикини")).toBe(true);
    expect(hasMediaHint("show me yourself")).toBe(true);

    expect(await router.route("как прошёл твой день?")).toEqual({ intent: "reply", via: "rules" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ответ классификатора проверяется по схеме и сопоставляется с каталогом", () => {
    const raw = '```json\n{"intent":"image","outfits":["bikini","unknown"],"poses":["img-hand-on-hip"],"locations":["Beach"],"extra":"wet hair"}\n```';
    expect(parseClassifierOutput(raw, CATALOG)).toEqual({
      intent: "image",
      selections: { outfits: ["bikini"], poses: ["img-hand-on-hip"], locations: ["beach"], facialExpressions: [], framing: [] },
      extra: "wet hair",
      via: "llm",
    });
    expect(parseClassifierOutput('{"intent":"dance"}', CATALOG)).toBeNull();
    expect(parseClassifierOutput('{"intent":"clarify"}', CATALOG)).toBeNull();
    expect(parseClassifierOutput('{"intent":"image","poses":"x"}', CATALOG)).toBeNull();
    expect(parseClassifierOutput("not json", CATALOG)).toBeNull();
  });

  it("запасные правила: тип медиа по словам, опции по названиям и синонимам (с падежами)", () => {
    expect(classifyByRules("скинь видео в купальнике", CATALOG)).toEqual({
      intent: "video",
      selections: { outfits: ["bikini"], poses: [], locations: [], facialExpressions: [], framing: [] },
      via: "rules",
    });
  });

  it("если классификатор недоступен — работают запасные правила", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await router.route("пришли фото в купальнике");
    expect(result).toMatchObject({ intent: "image", via: "rules", selections: { outfits: ["bikini"] } });
  });

  it("одинаковый текст → одинаковая спецификация (сайт, Telegram и internal API вызывают routeToSpec)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: '{"intent":"image","outfits":["Bikini"],"locations":["beach"]}' }),
    });
    const a = await router.routeToSpec("пришли фото на пляже в бикини", "char-1", "nsfw");
    const b = await router.routeToSpec("пришли фото на пляже в бикини", "char-1", "nsfw");
    expect(a.spec).toEqual(b.spec);
    expect(a.spec).toEqual(
      selectionsToSpec(
        "image",
        { outfits: ["bikini"], poses: [], locations: ["beach"], facialExpressions: [], framing: [] },
        "char-1",
        "nsfw",
      ),
    );
    expect(a.spec).toMatchObject({ kind: "image", preset: "chat", characterId: "char-1", appearance: { outfits: ["bikini"] } });
  });
});
