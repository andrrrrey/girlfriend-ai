jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { ConflictException } from "@nestjs/common";
import { ChatsService } from "../chats/chats.service";
import { messagesToSummarize } from "./chat-memory.service";
import {
  DEFAULT_PROACTIVE_POLICY,
  PROACTIVE_EVENT,
  ProactiveService,
  delayMs,
  isQuietHour,
  localHour,
  mergePolicy,
  parseProactivePolicy,
  quietHoursEnd,
  variantFor,
} from "./proactive.service";

const HOUR = 3_600_000;

describe("Инициативные сообщения: политика", () => {
  it("битая настройка — значения по умолчанию; частичная — накладывается", () => {
    expect(parseProactivePolicy("{oops")).toEqual(DEFAULT_PROACTIVE_POLICY);
    const p = parseProactivePolicy(JSON.stringify({ enabled: true, maxUnanswered: 1, delaysHours: [2, "x", -1] }));
    expect(p).toMatchObject({ enabled: true, maxUnanswered: 1, delaysHours: [2], quietStart: 23 });
    // Переопределение бота клиентов.
    expect(mergePolicy(p, { enabled: false, quietStart: 22 })).toMatchObject({ enabled: false, quietStart: 22, maxUnanswered: 1 });
  });

  it("A/B: вариант стабилен для чата, задержки умножаются, последняя повторяется", () => {
    const variants = DEFAULT_PROACTIVE_POLICY.variants;
    expect(variantFor("chat-1", variants)).toBe(variantFor("chat-1", variants));
    const b = { name: "B", delayFactor: 0.5, prompt: "p" };
    const policy = { ...DEFAULT_PROACTIVE_POLICY, delaysHours: [6, 24] };
    expect(delayMs(policy, b, 1)).toBe(3 * HOUR);
    expect(delayMs(policy, b, 5)).toBe(12 * HOUR);
  });

  it("тихие часы через полночь и по часовому поясу пользователя", () => {
    expect(isQuietHour(23, 23, 9)).toBe(true);
    expect(isQuietHour(3, 23, 9)).toBe(true);
    expect(isQuietHour(9, 23, 9)).toBe(false);
    expect(isQuietHour(12, 0, 0)).toBe(false);

    const at = new Date("2026-10-28T20:30:00Z");
    expect(localHour(at, "Europe/Moscow")).toBe(23);
    expect(localHour(at, "Bad/Zone")).toBe(20);
    // 23:30 в Москве → конец тихих часов в 09:00 МСК = 06:00 UTC.
    expect(quietHoursEnd(at, DEFAULT_PROACTIVE_POLICY, "Europe/Moscow").toISOString()).toBe("2026-10-29T06:00:00.000Z");
  });
});

describe("Инициативные сообщения: расписание и отправка", () => {
  let prisma: any;
  let outbox: any;
  let engine: any;
  let analytics: any;
  let service: ProactiveService;
  let chat: any;

  const policy = (patch: Record<string, unknown> = {}) =>
    (prisma.appSetting.findUnique = jest
      .fn()
      .mockResolvedValue({ value: JSON.stringify({ enabled: true, delaysHours: [6], maxUnanswered: 2, quietStart: 0, quietEnd: 0, ...patch }) }));

  beforeEach(() => {
    chat = {
      id: "chat-1",
      userId: "u1",
      endUserId: null,
      deletedAt: null,
      proactiveEnabled: true,
      proactiveCount: 0,
      lastUserMessageAt: new Date("2026-10-28T10:00:00Z"),
      nextProactiveAt: new Date("2026-10-28T16:00:00Z"),
      user: { id: "u1", subscription: "paid", contentMode: "nsfw", isAdult: true, timezone: "UTC" },
    };
    prisma = {
      appSetting: {},
      chatSession: {
        findUnique: jest.fn(async () => chat),
        findMany: jest.fn(async () => [chat]),
        update: jest.fn(async ({ data }: any) => Object.assign(chat, data)),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const match = Object.entries(where).every(([k, v]) => k === "id" || (chat[k] instanceof Date ? chat[k].getTime() === (v as Date)?.getTime() : chat[k] === v));
          if (match) Object.assign(chat, data);
          return { count: match ? 1 : 0 };
        }),
      },
      telegramBotUser: { findMany: jest.fn().mockResolvedValue([]) },
      message: { count: jest.fn().mockResolvedValue(0) },
    };
    policy();
    outbox = { registerHandler: jest.fn(), enqueue: jest.fn() };
    engine = {
      respond: jest.fn(async function* () {
        yield { type: "done", messageId: "m-1" };
      }),
    };
    analytics = { capture: jest.fn() };
    service = new ProactiveService(
      prisma,
      outbox,
      { scheduleInterval: jest.fn() } as any,
      analytics,
      { quote: jest.fn().mockResolvedValue({ amount: 1 }) } as any,
      engine,
    );
  });

  it("реплика пользователя — счётчик с нуля и первое сообщение через задержку", async () => {
    chat.proactiveCount = 2;
    await service.onUserMessage("chat-1");
    expect(chat.proactiveCount).toBe(0);
    const variant = variantFor("chat-1", DEFAULT_PROACTIVE_POLICY.variants);
    expect(chat.nextProactiveAt.getTime()).toBe(chat.lastUserMessageAt.getTime() + 6 * HOUR * variant.delayFactor);
    // Ответ на инициативное сообщение — в аналитику.
    expect(analytics.capture).toHaveBeenCalledWith("u1", "proactive_replied", expect.objectContaining({ n: 2 }));
  });

  it("политика выключена — расписание не ставится", async () => {
    policy({ enabled: false });
    await service.onUserMessage("chat-1");
    expect(chat.nextProactiveAt).toBeNull();
  });

  it("созревший диалог → событие в outbox с dedupeKey (повтор не создаёт второе сообщение)", async () => {
    expect(await service.tick(new Date("2026-10-28T16:01:00Z"))).toBe(1);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      PROACTIVE_EVENT,
      expect.objectContaining({ chatSessionId: "chat-1", n: 1 }),
      `chat:chat-1:proactive:${chat.lastUserMessageAt.getTime()}:1`,
    );
    expect(chat.nextProactiveAt).toBeNull();
  });

  it("тихие часы — перенос, а не отправка", async () => {
    policy({ quietStart: 22, quietEnd: 8 });
    chat.nextProactiveAt = new Date("2026-10-28T23:00:00Z");
    await service.tick(new Date("2026-10-28T23:00:00Z"));
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(chat.nextProactiveAt.toISOString()).toBe("2026-10-29T08:00:00.000Z");
  });

  it("лимит без ответа исчерпан — стоп до реплики пользователя", async () => {
    chat.proactiveCount = 2;
    await service.tick(new Date("2026-10-28T16:01:00Z"));
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(chat.nextProactiveAt).toBeNull();
  });

  it("бот заблокирован или /mute — не пишем", async () => {
    prisma.telegramBotUser.findMany.mockResolvedValue([{ tgUserId: "42", muted: true, blockedAt: null, bot: { id: "b", mode: "PERSONAL", starsEnabled: false } }]);
    await service.tick(new Date("2026-10-28T16:01:00Z"));
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("дневной бюджет исчерпан — перенос на завтра", async () => {
    policy({ dailyBudgetCredits: 3 });
    prisma.message.count.mockResolvedValue(3);
    await service.tick(new Date("2026-10-28T16:01:00Z"));
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(chat.nextProactiveAt.toISOString()).toBe("2026-10-29T00:05:00.000Z");
  });

  it("отправка: ядро source=proactive, счётчик +1 и следующее расписание", async () => {
    const since = chat.lastUserMessageAt.getTime();
    await service.send({ chatSessionId: "chat-1", n: 1, variant: "A", since });

    expect(engine.respond).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-1", source: "proactive", enforceLimits: false, trailingNote: expect.any(String) }),
    );
    expect(chat.proactiveCount).toBe(1);
    expect(chat.nextProactiveAt).toBeInstanceOf(Date);
    expect(analytics.capture).toHaveBeenCalledWith("u1", "proactive_sent", expect.objectContaining({ variant: "A", n: 1 }));

    // Повтор того же события — сообщение уже есть, второе не создаётся.
    await service.send({ chatSessionId: "chat-1", n: 1, variant: "A", since });
    expect(engine.respond).toHaveBeenCalledTimes(1);
  });

  it("последнее разрешённое сообщение — дальше без расписания", async () => {
    chat.proactiveCount = 1;
    await service.send({ chatSessionId: "chat-1", n: 2, variant: "A", since: chat.lastUserMessageAt.getTime() });
    expect(chat.proactiveCount).toBe(2);
    expect(chat.nextProactiveAt).toBeNull();
  });

  it("пользователь успел ответить — не отправляем", async () => {
    await service.send({ chatSessionId: "chat-1", n: 1, variant: "A", since: chat.lastUserMessageAt.getTime() - 1000 });
    expect(engine.respond).not.toHaveBeenCalled();
  });

  it("диалог занят — ошибка наружу, outbox повторит", async () => {
    engine.respond.mockImplementation(async function* () {
      throw new ConflictException({ error: "CHAT_BUSY" });
    });
    await expect(service.send({ chatSessionId: "chat-1", n: 1, variant: "A", since: chat.lastUserMessageAt.getTime() })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe("Непрочитанные и память диалога", () => {
  it("реплика пользователя сбрасывает непрочитанные, сообщение персонажа — +1", async () => {
    const tx: any = {
      message: { create: jest.fn().mockResolvedValue({ id: "m", type: "text", source: "proactive" }) },
      chatSession: { update: jest.fn() },
      outboxEvent: { createMany: jest.fn() },
    };
    const chats = new ChatsService({} as any, { enqueue: jest.fn() } as any);

    await chats.saveMessage("c", "user", "привет", undefined, tx);
    expect(tx.chatSession.update).toHaveBeenLastCalledWith({
      where: { id: "c" },
      data: expect.objectContaining({ unreadCount: 0, lastUserMessageAt: expect.any(Date) }),
    });
    await chats.saveMessage("c", "assistant", "привет!", { source: "proactive" }, tx);
    expect(tx.chatSession.update).toHaveBeenLastCalledWith({
      where: { id: "c" },
      data: expect.objectContaining({ unreadCount: { increment: 1 } }),
    });
  });

  it("в summary сворачивается только то, что вышло за окно истории, и пачками", () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => i);
    expect(messagesToSummarize(list(39), 20, 20)).toEqual([]);
    expect(messagesToSummarize(list(40), 20, 20)).toEqual(list(20));
  });
});
