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
    service = new ChatMediaService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
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
