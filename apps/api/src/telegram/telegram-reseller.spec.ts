jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { HttpException, NotFoundException } from "@nestjs/common";
import { currentBillingContext } from "../billing/billing-context";
import { ChatsService } from "../chats/chats.service";
import { DELETE_DATA_CALLBACK, TelegramHandlerService } from "./telegram-handler.service";
import { TelegramResellerService, limitReached, startOfUtcDay } from "./telegram-reseller.service";

const OWNER = "owner-1";
const bot = {
  id: "bot-1",
  mode: "RESELLER",
  ownerUserId: OWNER,
  characterId: "char-1",
  tokenEnc: "x",
  character: { id: "char-1", name: "Hannah" },
  starsEnabled: false,
  termsText: null,
  supportText: null,
};

const message = (text: string, tgUserId = 42, updateId = 100) => ({
  update_id: updateId,
  message: {
    message_id: 1,
    date: 0,
    text,
    from: { id: tgUserId, is_bot: false, first_name: "Ann" },
    chat: { id: tgUserId, type: "private" as const },
  },
});

describe("Бот для клиентов (RESELLER): обработчик", () => {
  let prisma: any;
  let api: any;
  let engine: any;
  let reseller: any;
  let stars: any;
  let handler: TelegramHandlerService;
  /** Контекст списаний, в котором ядро обрабатывало сообщение. */
  let seenContext: unknown;

  beforeEach(() => {
    seenContext = undefined;
    api = { sendMessage: jest.fn(), sendChatAction: jest.fn().mockResolvedValue(true), sendDocument: jest.fn() };
    prisma = {
      telegramBot: { findFirst: jest.fn().mockResolvedValue(bot) },
      telegramBotUser: {
        upsert: jest.fn(async ({ create }: any) => ({
          id: `bu-${create.tgUserId}`,
          chatId: create.chatId,
          linkedUserId: null,
          chatSessionId: `chat-${create.tgUserId}`,
          muted: false,
        })),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: OWNER, subscription: "free", contentMode: "nsfw", isAdult: true }) },
    };
    engine = {
      handleUserText: jest.fn(async function* () {
        seenContext = currentBillingContext();
        yield { type: "done" };
      }),
      greet: jest.fn(async function* () {
        yield { type: "done" };
      }),
    };
    reseller = {
      ensureEndUserSession: jest.fn(async (_bot: unknown, botUser: { chatSessionId: string }) => botUser.chatSessionId),
      allowance: jest.fn().mockResolvedValue({ messages: true, media: true, keepBalance: 50 }),
      exportEndUserData: jest.fn().mockResolvedValue("dump"),
      deleteEndUserData: jest.fn(),
    };
    stars = { paywallActive: jest.fn().mockResolvedValue(false), activeSubscription: jest.fn().mockResolvedValue(null) };
    handler = new TelegramHandlerService(prisma, {} as any, engine, {} as any, { apiFor: () => api } as any, reseller, stars);
  });

  it("привязка не нужна: у каждого клиента свой диалог, списание с владельца в контексте клиента", async () => {
    await handler.handle("bot-1", message("привет", 42));
    await handler.handle("bot-1", message("привет", 77, 101));

    const chats = engine.handleUserText.mock.calls.map((c: any[]) => c[0].chatId);
    expect(chats).toEqual(["chat-42", "chat-77"]);
    expect(engine.handleUserText).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ id: OWNER }),
        source: "telegram",
        externalId: "101",
        enforceLimits: false,
        routeIntents: true,
      }),
    );
    expect(seenContext).toEqual({ actorUserId: OWNER, endUserId: "bu-77", keepBalance: 50 });
    // Владельцу ничего не пишем про привязку аккаунта.
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it("лимит сообщений исчерпан — ядро не вызывается", async () => {
    reseller.allowance.mockResolvedValue({ messages: false, media: true, keepBalance: 0 });
    await handler.handle("bot-1", message("привет"));
    expect(engine.handleUserText).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith("42", expect.stringContaining("лимит сообщений"));
  });

  it("лимит медиа исчерпан — просьба о фото получает текстовый ответ без генерации", async () => {
    reseller.allowance.mockResolvedValue({ messages: true, media: false, keepBalance: 0 });
    await handler.handle("bot-1", message("пришли фото"));
    expect(api.sendMessage).toHaveBeenCalledWith("42", expect.stringContaining("Фото и видео на сегодня закончились"));
    expect(engine.handleUserText).toHaveBeenCalledWith(expect.objectContaining({ routeIntents: false }));
  });

  it("у владельца кончились кредиты — клиенту без подробностей", async () => {
    engine.handleUserText.mockImplementation(async function* () {
      throw new HttpException({ error: "INSUFFICIENT_CREDITS", required: 1, available: 0 }, 402);
    });
    await handler.handle("bot-1", message("привет"));
    expect(api.sendMessage).toHaveBeenCalledWith("42", "Бот сейчас недоступен. Попробуйте позже.");
  });

  it("новый клиент на /start — персонаж здоровается", async () => {
    prisma.telegramBotUser.upsert.mockResolvedValue({ id: "bu-42", chatId: "42", linkedUserId: null, chatSessionId: null, muted: false });
    reseller.ensureEndUserSession.mockResolvedValue("chat-new");
    await handler.handle("bot-1", message("/start"));
    expect(engine.greet).toHaveBeenCalledWith(expect.objectContaining({ chatId: "chat-new", source: "telegram", enforceLimits: false }));
  });

  it("/newchat начинает новый диалог", async () => {
    await handler.handle("bot-1", message("/newchat"));
    expect(reseller.ensureEndUserSession).toHaveBeenCalledWith(bot, expect.objectContaining({ id: "bu-42" }), true);
    expect(engine.handleUserText).not.toHaveBeenCalled();
  });

  it("/mydata присылает файл, /deletemydata удаляет только после подтверждения", async () => {
    await handler.handle("bot-1", message("/mydata"));
    expect(api.sendDocument).toHaveBeenCalledWith("42", expect.objectContaining({ filename: "my-data.txt" }), expect.any(String));

    await handler.handle("bot-1", message("/deletemydata"));
    expect(reseller.deleteEndUserData).not.toHaveBeenCalled();

    api.answerCallbackQuery = jest.fn().mockResolvedValue(true);
    api.editMessageReplyMarkup = jest.fn().mockResolvedValue(true);
    prisma.telegramBotUser.findUnique.mockResolvedValue({ id: "bu-42", chatId: "42", chatSessionId: "chat-42" });
    await handler.handle("bot-1", {
      update_id: 102,
      callback_query: { id: "q", from: { id: 42, is_bot: false, first_name: "Ann" }, data: DELETE_DATA_CALLBACK.yes },
    } as any);
    expect(reseller.deleteEndUserData).toHaveBeenCalledWith("bu-42");
  });
});

describe("Бот для клиентов (RESELLER): данные и лимиты", () => {
  it("диалог клиента создаётся скрытым от владельца и привязан к клиенту", async () => {
    const prisma: any = {
      chatSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "chat-new" }),
      },
      telegramBotUser: { update: jest.fn() },
    };
    const service = new TelegramResellerService(prisma);
    const id = await service.ensureEndUserSession(bot, { id: "bu-1", chatSessionId: "old" });

    expect(id).toBe("chat-new");
    expect(prisma.chatSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "old", endUserId: "bu-1" }) }),
    );
    expect(prisma.chatSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: OWNER, hiddenFromOwner: true, endUserId: "bu-1" }) }),
    );
    expect(prisma.telegramBotUser.update).toHaveBeenCalledWith({ where: { id: "bu-1" }, data: { chatSessionId: "chat-new" } });
  });

  it("скрытый диалог не виден на сайте: нет в списке чатов, по id — 404", async () => {
    const prisma: any = {
      chatSession: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: "c", userId: OWNER, hiddenFromOwner: true }),
      },
    };
    const chats = new ChatsService(prisma, {} as any);
    await chats.getUserChats(OWNER);
    expect(prisma.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: OWNER, hiddenFromOwner: false }) }),
    );
    await expect(chats.getChat("c", OWNER)).rejects.toBeInstanceOf(NotFoundException);
    // Ядро в канале Telegram открывает его.
    await expect(chats.getChat("c", OWNER, { includeHidden: true })).resolves.toMatchObject({ id: "c" });
  });

  it("лимиты: null — без ограничения; сутки по UTC", async () => {
    expect(limitReached(null, 1000)).toBe(false);
    expect(limitReached(10, 9)).toBe(false);
    expect(limitReached(10, 10)).toBe(true);
    expect(limitReached(0, 0)).toBe(true);
    expect(startOfUtcDay(new Date("2026-10-27T23:30:00+03:00")).toISOString()).toBe("2026-10-27T00:00:00.000Z");
  });

  it("allowance сравнивает счётчики бота и клиента с лимитами", async () => {
    const prisma: any = {
      botLimits: {
        findUnique: jest.fn().mockResolvedValue({ messagesPerDay: 100, messagesPerUser: 5, mediaPerDay: null, mediaPerUser: 2, keepBalance: 40 }),
      },
      // Порядок: сообщения бота, сообщения клиента, медиа бота, медиа клиента.
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ n: 50n }])
        .mockResolvedValueOnce([{ n: 5n }])
        .mockResolvedValueOnce([{ n: 0n }])
        .mockResolvedValueOnce([{ n: 1n }]),
    };
    const service = new TelegramResellerService(prisma);
    expect(await service.allowance("bot-1", "bu-1")).toEqual({ messages: false, media: true, keepBalance: 40 });
  });
});
