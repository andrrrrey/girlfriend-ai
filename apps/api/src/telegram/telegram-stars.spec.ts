jest.mock("@repo/config", () => ({ loadEnv: () => ({ AI_HOST: "ai", AI_PORT: 8081 }) }));

import { Prisma } from "@prisma/client";
import { TelegramHandlerService } from "./telegram-handler.service";
import { TelegramStarsService, extendExpiry, planIdFromPayload } from "./telegram-stars.service";

const BOT = "bot-1";
const PLAN = "11111111-1111-4111-8111-111111111111";
const DAY = 86_400_000;

/** In-memory хранилище платежей, подписок и тарифов. */
function fakeDb() {
  const payments: any[] = [];
  const subs: any[] = [];
  const plans: any[] = [{ id: PLAN, botId: BOT, title: "Месяц", priceStars: 100, periodDays: 30, active: true }];
  const key = (w: any) => w.botId_tgUserId;
  const prisma: any = {
    botPlan: {
      findFirst: async ({ where }: any) =>
        plans.find((p) => p.id === where.id && p.botId === where.botId && (where.active === undefined || p.active === where.active)) ?? null,
      count: async ({ where }: any) => plans.filter((p) => p.botId === where.botId && p.active === where.active).length,
    },
    starsPayment: {
      create: async ({ data }: any) => {
        if (payments.some((p) => p.chargeId === data.chargeId)) {
          throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
        }
        const row = { id: `pay-${payments.length + 1}`, status: "paid", createdAt: new Date(), ...data };
        payments.push(row);
        return row;
      },
      findFirst: async ({ where }: any) => payments.find((p) => p.botId === where.botId && p.chargeId === where.chargeId) ?? null,
      findUnique: async ({ where }: any) => payments.find((p) => p.chargeId === where.chargeId) ?? null,
      updateMany: async ({ where, data }: any) => {
        const rows = payments.filter((p) => p.id === where.id && p.status === where.status);
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    botSubscription: {
      findUnique: async ({ where }: any) =>
        subs.find((s) => s.botId === key(where).botId && s.tgUserId === key(where).tgUserId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const found = subs.find((s) => s.botId === key(where).botId && s.tgUserId === key(where).tgUserId);
        if (found) return Object.assign(found, update);
        const row = { id: `sub-${subs.length + 1}`, ...create };
        subs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(subs.find((s) => s.id === where.id), data),
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma, payments, subs, plans };
}

const payment = (chargeId: string, extra: Record<string, unknown> = {}) => ({
  currency: "XTR",
  total_amount: 100,
  invoice_payload: `plan:${PLAN}`,
  telegram_payment_charge_id: chargeId,
  ...extra,
});

describe("Оплата Telegram Stars", () => {
  let db: ReturnType<typeof fakeDb>;
  let api: any;
  let service: TelegramStarsService;

  beforeEach(() => {
    db = fakeDb();
    api = {
      sendMessage: jest.fn(),
      answerPreCheckoutQuery: jest.fn(),
      getStarTransactions: jest.fn(),
      refundStarPayment: jest.fn().mockResolvedValue(true),
    };
    service = new TelegramStarsService(db.prisma, { apiFor: () => api } as any, { scheduleDaily: jest.fn() } as any);
  });

  it("payload счёта: только plan:<uuid>", () => {
    expect(planIdFromPayload(`plan:${PLAN}`)).toBe(PLAN);
    expect(planIdFromPayload("plan:../../x")).toBeNull();
    expect(planIdFromPayload("other")).toBeNull();
  });

  it("нет successful_payment — нет доступа", async () => {
    expect(await service.activeSubscription(BOT, "42")).toBeNull();
  });

  it("оплата открывает доступ; повтор того же апдейта — одно продление", async () => {
    const first = await service.applyPayment(BOT, "42", payment("ch-1"));
    const again = await service.applyPayment(BOT, "42", payment("ch-1"));

    expect(first.fresh).toBe(true);
    expect(again.fresh).toBe(false);
    expect(db.payments).toHaveLength(1);
    expect(again.expiresAt.getTime()).toBe(first.expiresAt.getTime());
    expect(await service.activeSubscription(BOT, "42")).not.toBeNull();
  });

  it("второй платёж продлевает от текущего срока, а не от сегодня", () => {
    const now = new Date("2026-10-28T00:00:00Z");
    expect(extendExpiry(new Date(now.getTime() + 10 * DAY), 30, now).getTime()).toBe(now.getTime() + 40 * DAY);
    expect(extendExpiry(new Date(now.getTime() - 5 * DAY), 30, now).getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("подписка Telegram: срок — subscription_expiration_date, запоминается charge id первого платежа", async () => {
    const until = Math.floor(Date.now() / 1000) + 30 * 86_400;
    await service.applyPayment(BOT, "42", payment("ch-1", { subscription_expiration_date: until, is_recurring: true, is_first_recurring: true }));
    await service.applyPayment(BOT, "42", payment("ch-2", { subscription_expiration_date: until + 30 * 86_400, is_recurring: true }));

    expect(db.subs[0]).toMatchObject({ autoRenew: true, subscriptionChargeId: "ch-1" });
    expect(db.subs[0].expiresAt.getTime()).toBe((until + 30 * 86_400) * 1000);
  });

  it("истечение — доступ закрыт", async () => {
    await service.applyPayment(BOT, "42", payment("ch-1"));
    db.subs[0].expiresAt = new Date(Date.now() - 1000);
    expect(await service.activeSubscription(BOT, "42")).toBeNull();
  });

  it("возврат сокращает доступ на оплаченный период; повтор ничего не делает", async () => {
    await service.applyPayment(BOT, "42", payment("ch-1"));
    expect(await service.applyRefund(BOT, "ch-1")).toBe(true);
    expect(await service.applyRefund(BOT, "ch-1")).toBe(false);
    expect(db.payments[0].status).toBe("refunded");
    expect(await service.activeSubscription(BOT, "42")).toBeNull();
  });

  it("pre_checkout: тариф и сумма проверяются", async () => {
    const bot = { id: BOT, mode: "RESELLER", starsEnabled: true };
    const q = { id: "q", from: { id: 42, is_bot: false, first_name: "A" }, currency: "XTR", total_amount: 100, invoice_payload: `plan:${PLAN}` };

    await service.answerPreCheckout(bot, api, q);
    expect(api.answerPreCheckoutQuery).toHaveBeenLastCalledWith("q", true);

    await service.answerPreCheckout(bot, api, { ...q, total_amount: 50 });
    expect(api.answerPreCheckoutQuery).toHaveBeenLastCalledWith("q", false, expect.any(String));

    await service.answerPreCheckout({ ...bot, starsEnabled: false }, api, q);
    expect(api.answerPreCheckoutQuery).toHaveBeenLastCalledWith("q", false, expect.any(String));

    db.plans[0].active = false;
    await service.answerPreCheckout(bot, api, q);
    expect(api.answerPreCheckoutQuery).toHaveBeenLastCalledWith("q", false, expect.any(String));
  });

  it("сверка: пропущенный платёж зачисляется, возврат применяется", async () => {
    await service.applyPayment(BOT, "7", payment("ch-old"));
    api.getStarTransactions.mockResolvedValue({
      transactions: [
        { id: "ch-missed", amount: 100, date: 0, source: { type: "user", user: { id: 42 }, invoice_payload: `plan:${PLAN}` } },
        { id: "ch-old", amount: 100, date: 0, receiver: { type: "user", user: { id: 7 } } },
      ],
    });

    expect(await service.reconcile(BOT, api)).toEqual({ payments: 1, refunds: 1 });
    expect(await service.activeSubscription(BOT, "42")).not.toBeNull();
    expect(db.payments.find((p) => p.chargeId === "ch-old").status).toBe("refunded");
    // Повторная сверка ничего не меняет.
    expect(await service.reconcile(BOT, api)).toEqual({ payments: 0, refunds: 0 });
  });
});

describe("Paywall в боте для клиентов", () => {
  const bot = {
    id: BOT,
    mode: "RESELLER",
    ownerUserId: "owner",
    characterId: "char-1",
    tokenEnc: "x",
    character: { id: "char-1", name: "Hannah" },
    starsEnabled: true,
    termsText: "Условия",
    supportText: null,
  };
  const message = (text: string) => ({
    update_id: 1,
    message: { message_id: 1, date: 0, text, from: { id: 42, is_bot: false, first_name: "A" }, chat: { id: 42, type: "private" as const } },
  });
  let engine: any;
  let stars: any;
  let api: any;
  let handler: TelegramHandlerService;

  beforeEach(() => {
    api = { sendMessage: jest.fn(), sendChatAction: jest.fn().mockResolvedValue(true) };
    const prisma: any = {
      telegramBot: { findFirst: jest.fn().mockResolvedValue(bot) },
      telegramBotUser: {
        upsert: jest.fn().mockResolvedValue({ id: "bu-42", tgUserId: "42", chatId: "42", chatSessionId: "chat-42", muted: false }),
      },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "owner" }) },
    };
    engine = {
      handleUserText: jest.fn(async function* () {
        yield { type: "done" };
      }),
    };
    stars = {
      paywallActive: jest.fn().mockResolvedValue(true),
      activeSubscription: jest.fn().mockResolvedValue(null),
      sendPlans: jest.fn(),
      terms: jest.fn(),
    };
    const reseller = {
      ensureEndUserSession: jest.fn().mockResolvedValue("chat-42"),
      allowance: jest.fn().mockResolvedValue({ messages: true, media: true, keepBalance: 0 }),
    };
    handler = new TelegramHandlerService(prisma, {} as any, engine, {} as any, { apiFor: () => api } as any, reseller as any, stars);
  });

  it("без подписки — счета вместо ответа персонажа", async () => {
    await handler.handle(BOT, message("привет"));
    expect(stars.sendPlans).toHaveBeenCalledWith(api, BOT, "42");
    expect(engine.handleUserText).not.toHaveBeenCalled();
  });

  it("с активной подпиской — обычный диалог", async () => {
    stars.activeSubscription.mockResolvedValue({ expiresAt: new Date(Date.now() + DAY) });
    await handler.handle(BOT, message("привет"));
    expect(stars.sendPlans).not.toHaveBeenCalled();
    expect(engine.handleUserText).toHaveBeenCalled();
  });

  it("/terms доступен без подписки", async () => {
    await handler.handle(BOT, message("/terms"));
    expect(stars.terms).toHaveBeenCalledWith(api, bot, "42");
    expect(stars.sendPlans).not.toHaveBeenCalled();
  });
});
