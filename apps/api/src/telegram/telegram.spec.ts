const mockEnv: Record<string, unknown> = { AI_HOST: "ai", AI_PORT: 8081, WEB_URL: "https://site.test", TELEGRAM_POLLING: "false" };
jest.mock("@repo/config", () => ({ loadEnv: () => mockEnv }));

import { ConflictException, HttpException } from "@nestjs/common";
import { Readable } from "stream";
import { TelegramApi, TelegramApiError } from "./telegram-api";
import { TelegramDeliveryService, mediaKeyFromUrl, splitTelegramText } from "./telegram-delivery.service";
import { RetryLaterError, TelegramHandlerService } from "./telegram-handler.service";
import { webhookUrl } from "./telegram-bots.service";

describe("TelegramApi", () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it("ok=false превращается в TelegramApiError с retry_after", async () => {
    fetchMock.mockResolvedValue({
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({ ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 7 } }),
    });
    const err = await new TelegramApi("t").sendMessage("1", "hi").catch((e) => e);
    expect(err).toBeInstanceOf(TelegramApiError);
    expect(err).toMatchObject({ code: 429, retryAfter: 7, retryable: true });
  });

  it("403 (бот заблокирован) не повторяется", () => {
    expect(new TelegramApiError("sendMessage", 403, "Forbidden").retryable).toBe(false);
  });
});

describe("delivery helpers", () => {
  it("длинный текст делится на части по лимиту", () => {
    const parts = splitTelegramText("a".repeat(30) + "\n" + "b".repeat(30), 40);
    expect(parts).toEqual(["a".repeat(30), "b".repeat(30)]);
  });

  it("ключ S3 извлекается из ссылки media-прокси", () => {
    expect(mediaKeyFromUrl("/api-proxy/media/stream?key=images%2Fa.png")).toBe("images/a.png");
    expect(mediaKeyFromUrl("https://cdn.example.com/a.png")).toBeNull();
  });

  it("webhook по умолчанию идёт через Next-прокси сайта", () => {
    expect(webhookUrl("bot-1")).toBe("https://site.test/api-proxy/telegram/webhook/bot-1");
  });

  it("завершающий слэш в адресе не даёт «//» (сервер отвечал редиректом 308)", () => {
    mockEnv.WEB_URL = "https://site.test/";
    expect(webhookUrl("bot-1")).toBe("https://site.test/api-proxy/telegram/webhook/bot-1");
    mockEnv.TELEGRAM_WEBHOOK_BASE_URL = " https://staging.site.test/api-proxy/ ";
    expect(webhookUrl("bot-1")).toBe("https://staging.site.test/api-proxy/telegram/webhook/bot-1");
    mockEnv.WEB_URL = "https://site.test";
    delete mockEnv.TELEGRAM_WEBHOOK_BASE_URL;
  });
});

describe("TelegramDeliveryService", () => {
  let prisma: any;
  let api: any;
  let service: TelegramDeliveryService;

  beforeEach(() => {
    api = { sendMessage: jest.fn(), sendPhoto: jest.fn(), sendVideo: jest.fn() };
    prisma = {
      message: { findUnique: jest.fn() },
      telegramBotUser: {
        findMany: jest.fn().mockResolvedValue([{ id: "bu-1", chatId: "555", bot: { id: "b", tokenEnc: "x" } }]),
        update: jest.fn(),
      },
    };
    service = new TelegramDeliveryService(prisma, { registerHandler: jest.fn() } as any, { apiFor: () => api } as any, {} as any);
  });

  it("реплики пользователя из самого Telegram повторно не отправляются", async () => {
    await service.deliver({ messageId: "m", chatSessionId: "c", role: "user", type: "text", source: "telegram" });
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
  });

  it("ответ персонажа на сообщение с сайта тоже уходит в Telegram", async () => {
    prisma.message.findUnique.mockResolvedValue({
      role: "assistant", content: "хорошо, а у тебя?", type: "text", mediaUrl: null, deletedAt: null, chatSessionId: "c", metadata: null,
    });
    await service.deliver({ messageId: "m", chatSessionId: "c", role: "assistant", type: "text", source: "web" });
    expect(api.sendMessage).toHaveBeenCalledWith("555", "хорошо, а у тебя?", undefined);
  });

  it("реплика пользователя с сайта приходит в Telegram цитатой", async () => {
    prisma.message.findUnique.mockResolvedValue({
      role: "user", content: "как дела?", type: "text", mediaUrl: null, deletedAt: null, chatSessionId: "c", metadata: null,
    });
    await service.deliver({ messageId: "m", chatSessionId: "c", role: "user", type: "text", source: "web" });
    expect(api.sendMessage).toHaveBeenCalledWith("555", "💬 Вы на сайте: как дела?", undefined);
  });

  it("ответ на сообщение из Telegram отправляется; предложение цены — с кнопкой", async () => {
    prisma.message.findUnique.mockResolvedValue({
      content: "Это видео будет стоить 30 кредитов. Отправить?",
      type: "text",
      mediaUrl: null,
      deletedAt: null,
      chatSessionId: "c",
      metadata: { mediaConfirm: { token: "tok", price: 30, status: "pending" } },
    });
    await service.deliver({ messageId: "m", chatSessionId: "c", role: "assistant", type: "text", source: "telegram" });
    expect(api.sendMessage).toHaveBeenCalledWith("555", "Это видео будет стоить 30 кредитов. Отправить?", {
      inline_keyboard: [[{ text: "Отправить за 30 кредитов", callback_data: "mc:tok" }]],
    });
  });

  it("бот заблокирован (403) — пользователь помечается, событие не повторяется", async () => {
    prisma.message.findUnique.mockResolvedValue({ content: "hi", type: "text", mediaUrl: null, deletedAt: null, chatSessionId: "c", metadata: null });
    api.sendMessage.mockRejectedValue(new TelegramApiError("sendMessage", 403, "Forbidden: bot was blocked by the user"));
    await expect(
      service.deliver({ messageId: "m", chatSessionId: "c", role: "assistant", type: "text", source: "telegram" }),
    ).resolves.toBeUndefined();
    expect(prisma.telegramBotUser.update).toHaveBeenCalledWith({ where: { id: "bu-1" }, data: { blockedAt: expect.any(Date) } });
  });

  it("вариант общего кэша уже загружен в этого бота — отправка по file_id, без скачивания", async () => {
    prisma.message.findUnique.mockResolvedValue({
      role: "assistant", content: "📷", type: "image", mediaUrl: "/api-proxy/media/stream?key=a.png", deletedAt: null, chatSessionId: "c",
      metadata: { assetId: "asset-1" },
    });
    prisma.telegramFileCache = { findUnique: jest.fn().mockResolvedValue({ fileId: "FILE-1" }), createMany: jest.fn(), deleteMany: jest.fn() };
    await service.deliver({ messageId: "m", chatSessionId: "c", role: "assistant", type: "image", source: "web" });
    expect(prisma.telegramFileCache.findUnique).toHaveBeenCalledWith({
      where: { botId_assetId: { botId: "b", assetId: "asset-1" } },
      select: { fileId: true },
    });
    expect(api.sendPhoto).toHaveBeenCalledWith("555", "FILE-1");
  });

  it("первая отправка варианта — загрузка байтами и сохранение file_id", async () => {
    const s3 = { getObject: jest.fn().mockResolvedValue({ body: Readable.from([Buffer.from("png")]), contentType: "image/png" }) };
    service = new TelegramDeliveryService(prisma, { registerHandler: jest.fn() } as any, { apiFor: () => api } as any, s3 as any);
    prisma.message.findUnique.mockResolvedValue({
      role: "assistant", content: "📷", type: "image", mediaUrl: "/api-proxy/media/stream?key=a.png", deletedAt: null, chatSessionId: "c",
      metadata: { assetId: "asset-1" },
    });
    prisma.telegramFileCache = { findUnique: jest.fn().mockResolvedValue(null), createMany: jest.fn().mockResolvedValue({ count: 1 }) };
    api.sendPhoto.mockResolvedValue({ message_id: 1, photo: [{ file_id: "small" }, { file_id: "big" }] });

    await service.deliver({ messageId: "m", chatSessionId: "c", role: "assistant", type: "image", source: "web" });
    expect(s3.getObject).toHaveBeenCalledWith("a.png");
    expect(prisma.telegramFileCache.createMany).toHaveBeenCalledWith({
      data: [{ botId: "b", assetId: "asset-1", fileId: "big" }],
      skipDuplicates: true,
    });
  });

  it("429 — исключение, outbox повторит позже", async () => {
    prisma.message.findUnique.mockResolvedValue({ content: "hi", type: "text", mediaUrl: null, deletedAt: null, chatSessionId: "c", metadata: null });
    api.sendMessage.mockRejectedValue(new TelegramApiError("sendMessage", 429, "Too Many Requests", 5));
    await expect(
      service.deliver({ messageId: "m", chatSessionId: "c", role: "assistant", type: "text", source: "telegram" }),
    ).rejects.toBeInstanceOf(TelegramApiError);
  });
});

describe("TelegramHandlerService", () => {
  const OWNER = "owner-1";
  let prisma: any;
  let api: any;
  let engine: any;
  let handler: TelegramHandlerService;

  const bot = { id: "bot-1", ownerUserId: OWNER, characterId: "char-1", tokenEnc: "x", character: { id: "char-1", name: "Hannah" } };
  const message = (text: string, updateId = 100) => ({
    update_id: updateId,
    message: { message_id: 1, date: 0, text, from: { id: 42, is_bot: false, first_name: "Ann" }, chat: { id: 42, type: "private" as const } },
  });

  beforeEach(() => {
    api = { sendMessage: jest.fn(), sendChatAction: jest.fn().mockResolvedValue(true) };
    prisma = {
      telegramBot: { findFirst: jest.fn().mockResolvedValue(bot) },
      telegramBotUser: {
        upsert: jest.fn().mockResolvedValue({ id: "bu-1", chatId: "42", linkedUserId: OWNER, chatSessionId: "chat-s", muted: false }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      telegramLinkToken: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      chatSession: { findFirst: jest.fn().mockResolvedValue({ id: "chat-s" }) },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: OWNER, subscription: "paid", contentMode: "nsfw", isAdult: true }) },
    };
    engine = {
      handleUserText: jest.fn(async function* () {
        yield { type: "done" };
      }),
      greet: jest.fn(async function* () {
        yield { type: "done" };
      }),
    };
    handler = new TelegramHandlerService(prisma, { resetChat: jest.fn(), createChat: jest.fn() } as any, engine, {} as any, {
      apiFor: () => api,
    } as any, {} as any);
  });

  it("текст привязанного владельца идёт в общее ядро (source=telegram, externalId=update_id)", async () => {
    await handler.handle("bot-1", message("пришли фото"));
    expect(engine.handleUserText).toHaveBeenCalledWith({
      chatId: "chat-s",
      actor: { id: OWNER, subscription: "paid", contentMode: "nsfw", isAdult: true },
      content: "пришли фото",
      source: "telegram",
      externalId: "100",
    });
  });

  it("не привязанный пользователь получает инструкцию, ядро не вызывается", async () => {
    prisma.telegramBotUser.upsert.mockResolvedValue({ id: "bu-1", chatId: "42", linkedUserId: null, chatSessionId: null, muted: false });
    await handler.handle("bot-1", message("привет"));
    expect(api.sendMessage).toHaveBeenCalledWith("42", expect.stringContaining("Привязать Telegram"));
    expect(engine.handleUserText).not.toHaveBeenCalled();
  });

  it("/start <token> привязывает владельца, токен одноразовый, персонаж здоровается", async () => {
    prisma.telegramBotUser.upsert.mockResolvedValue({ id: "bu-1", chatId: "42", linkedUserId: null, chatSessionId: null, muted: false });
    prisma.telegramLinkToken.findUnique.mockResolvedValue({
      id: "lt-1",
      botId: "bot-1",
      userId: OWNER,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await handler.handle("bot-1", message("/start abc"));

    expect(prisma.telegramLinkToken.updateMany).toHaveBeenCalledWith({ where: { id: "lt-1", usedAt: null }, data: { usedAt: expect.any(Date) } });
    expect(prisma.telegramBotUser.update).toHaveBeenCalledWith({ where: { id: "bu-1" }, data: { linkedUserId: OWNER } });
    expect(api.sendMessage).toHaveBeenCalledWith("42", expect.stringContaining("Hannah"));
    expect(engine.greet).toHaveBeenCalledWith(expect.objectContaining({ chatId: "chat-s", source: "telegram" }));
  });

  it("диалог занят — обновление повторяется позже", async () => {
    engine.handleUserText.mockImplementation(async function* () {
      throw new ConflictException({ error: "CHAT_BUSY" });
    });
    await expect(handler.handle("bot-1", message("ещё"))).rejects.toBeInstanceOf(RetryLaterError);
  });

  it("нет кредитов — понятное сообщение пользователю", async () => {
    engine.handleUserText.mockImplementation(async function* () {
      throw new HttpException({ error: "INSUFFICIENT_CREDITS", required: 1, available: 0 }, 402);
    });
    await handler.handle("bot-1", message("привет"));
    expect(api.sendMessage).toHaveBeenCalledWith("42", expect.stringContaining("Недостаточно кредитов"));
  });
});
