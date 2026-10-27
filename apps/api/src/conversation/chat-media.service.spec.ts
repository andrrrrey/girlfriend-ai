jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { NotFoundException } from "@nestjs/common";
import { ChatMediaService } from "./chat-media.service";

describe("ChatMediaService.regenerate", () => {
  const actor = { id: "u", subscription: "paid", contentMode: "nsfw", isAdult: true };
  let prisma: any;
  let service: ChatMediaService;
  let start: jest.SpyInstance;

  beforeEach(() => {
    prisma = { message: { findFirst: jest.fn() } };
    service = new ChatMediaService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    start = jest.spyOn(service, "start").mockResolvedValue({ kind: "image", jobId: "job-2" });
  });

  it("повторяет сохранённую спецификацию фото (персонаж и режим — текущие)", async () => {
    prisma.message.findFirst.mockResolvedValue({
      type: "image",
      metadata: {
        poseName: "photo",
        spec: { kind: "image", preset: "chat", characterId: "old", appearance: { outfits: ["bikini"] } },
      },
    });

    await expect(service.regenerate("chat-1", actor, "m-1", "char-1", "sfw")).resolves.toEqual({ kind: "image", jobId: "job-2" });
    expect(start).toHaveBeenCalledWith(
      "chat-1",
      actor,
      { kind: "image", preset: "chat", characterId: "char-1", contentMode: "sfw", appearance: { outfits: ["bikini"] } },
      { caption: "photo", source: "web" },
    );
  });

  it("старое фото из пикера поз (без спецификации) — по позе из подписи", async () => {
    prisma.message.findFirst.mockResolvedValue({ type: "image", metadata: { poseName: "img_hand_on_hip" } });

    await service.regenerate("chat-1", actor, "m-1", "char-1", "nsfw");
    expect(start).toHaveBeenCalledWith(
      "chat-1",
      actor,
      { kind: "image", preset: "chat", characterId: "char-1", contentMode: "nsfw", pose: { poses: ["img_hand_on_hip"] } },
      { caption: "img_hand_on_hip", source: "web" },
    );
  });

  it("фото по просьбе без спецификации — подпись «photo» не считается позой", async () => {
    prisma.message.findFirst.mockResolvedValue({ type: "image", metadata: { poseName: "photo" } });

    await service.regenerate("chat-1", actor, "m-1", "char-1", "nsfw");
    expect(start.mock.calls[0][2]).toEqual({ kind: "image", preset: "chat", characterId: "char-1", contentMode: "nsfw" });
  });

  it("не медиа или чужое сообщение — 404", async () => {
    prisma.message.findFirst.mockResolvedValue(null);
    await expect(service.regenerate("chat-1", actor, "m-x", "char-1", "nsfw")).rejects.toBeInstanceOf(NotFoundException);
    expect(start).not.toHaveBeenCalled();
  });
});

describe("ChatMediaService + общий кэш", () => {
  const actor = { id: "u", subscription: "paid", contentMode: "nsfw", isAdult: true };
  const spec = { kind: "image" as const, preset: "chat" as const, characterId: "char-1", contentMode: "nsfw" as const };
  let chats: any;
  let mediaCache: any;
  let service: ChatMediaService;
  let prisma: any;

  beforeEach(() => {
    chats = { saveMessage: jest.fn() };
    prisma = {
      aiJob: {
        findUnique: jest.fn(async ({ where }: any) => ({
          type: "image",
          input: { chat: { sessionId: `chat-of-${where.id}`, caption: "photo", source: "web" } },
        })),
      },
    };
    mediaCache = { request: jest.fn(), onJobCompleted: jest.fn() };
    const demo = { checkImageGeneration: jest.fn(), checkVideoGeneration: jest.fn() };
    const specs = { toImageJob: jest.fn().mockResolvedValue({ prompt: "p" }) };
    const generation = { toClientMediaUrl: jest.fn(async (u: string) => `/proxy/${u}`) };
    service = new ChatMediaService(prisma, chats, demo as any, generation as any, specs as any, {} as any, {} as any, mediaCache, {} as any);
  });

  it("вариант из кэша сразу появляется сообщением в диалоге (с assetId)", async () => {
    mediaCache.request.mockResolvedValue({ jobId: "job-c", via: "cache", hit: { assetId: "asset-1", output: { url: "s3/a.png" } } });

    await expect(service.start("chat-1", actor, spec, { caption: "photo", source: "web" })).resolves.toEqual({
      kind: "image",
      jobId: "job-c",
      via: "cache",
    });
    expect(chats.saveMessage).toHaveBeenCalledWith(
      "chat-of-job-c",
      "assistant",
      "📷",
      expect.objectContaining({ mediaUrl: "/proxy/s3/a.png", metadata: expect.objectContaining({ assetId: "asset-1" }), externalId: "aijob:job-c" }),
    );
  });

  it("свободный текст пользователя передаётся в кэш (scope владельца)", async () => {
    mediaCache.request.mockResolvedValue({ jobId: "job-1", via: "generated" });
    await service.start("chat-1", actor, { ...spec, userText: "в красном платье" }, { caption: "photo", source: "web" });
    expect(mediaCache.request).toHaveBeenCalledWith(expect.objectContaining({ hasUserText: true, characterId: "char-1", userId: "u" }));
    expect(chats.saveMessage).not.toHaveBeenCalled();
  });

  it("завершение генерации: сообщение получают и запустивший, и ожидавшие", async () => {
    mediaCache.onJobCompleted.mockImplementation(async (_id: string, _out: unknown, cb: any) => {
      await cb("follower-1", "asset-1");
      return { assetId: "asset-1", followerJobIds: ["follower-1"] };
    });
    await service.onJobCompleted("leader-1", { url: "s3/a.png" });
    expect(chats.saveMessage.mock.calls.map((c: any[]) => c[0])).toEqual(["chat-of-follower-1", "chat-of-leader-1"]);
  });
});
