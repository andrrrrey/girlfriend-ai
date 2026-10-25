jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { CharacterIdentityService, sanitizeIdentityPrompt } from "./character-identity.service";

describe("sanitizeIdentityPrompt", () => {
  it("приводит ответ модели к тегам через запятую без дублей и пояснений", () => {
    expect(
      sanitizeIdentityPrompt('Tags: "Woman", 20s, Korean,\nBrown Hair, long hair, brown eyes, Brown hair, curvy, anime.'),
    ).toBe("woman, 20s, korean, brown hair, long hair, brown eyes, curvy, anime");
  });

  it("отказ модели или слишком короткий ответ — null", () => {
    expect(sanitizeIdentityPrompt("Sorry, I can't help with that image.")).toBeNull();
    expect(sanitizeIdentityPrompt("woman, anime")).toBeNull();
  });
});

describe("CharacterIdentityService.ensureIdentity", () => {
  const fetchMock = jest.fn();
  let prisma: any;
  let locks: any;
  let service: CharacterIdentityService;

  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
    prisma = {
      character: {
        findUnique: jest.fn().mockResolvedValue({ personality: { age: 43, nationality: "Korean" } }),
        update: jest.fn(),
      },
    };
    locks = { acquire: jest.fn().mockResolvedValue({ key: "k", token: "t" }), release: jest.fn().mockResolvedValue(undefined) };
    const generation = { toProviderImageUrl: jest.fn().mockResolvedValue("https://s3/signed/avatar.png") };
    service = new CharacterIdentityService(prisma, generation as any, locks, {} as any);
  });

  it("сохранённый avatarPrompt не трогается, модель не вызывается", async () => {
    const personality = { avatarPrompt: "woman, red hair, green eyes" };
    expect(await service.ensureIdentity({ id: "c", personality, avatarUrl: "/a.png" })).toBe(personality);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("без avatarPrompt — описывает аватар и сохраняет в personality", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: "woman, mature, korean, brown hair, long hair, brown eyes, anime", model: "qwen" }),
    });

    const result = await service.ensureIdentity({ id: "c", personality: { age: 43 }, avatarUrl: "/a.png" });

    expect(result).toMatchObject({
      age: 43,
      nationality: "Korean",
      avatarPrompt: "woman, mature, korean, brown hair, long hair, brown eyes, anime",
      avatarPromptSource: "vision",
    });
    expect(prisma.character.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { personality: result } });
  });

  it("сбой модели не ломает генерацию — возвращается исходная personality", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const personality = { age: 43 };
    expect(await service.ensureIdentity({ id: "c", personality, avatarUrl: "/a.png" })).toBe(personality);
    expect(prisma.character.update).not.toHaveBeenCalled();
    expect(locks.release).toHaveBeenCalled();
  });
});
