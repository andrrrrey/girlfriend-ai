import { Prisma } from "@prisma/client";
import { FulfillmentService, PaymentEventNotReadyError } from "./fulfillment.service";
import type { NormalizedEvent } from "./payment-provider";

const USER = "11111111-1111-4111-8111-111111111111";
const DAY = 86_400_000;

/** In-memory платежи, транзакции, подписки и кошелёк. */
function fakeDb() {
  const payments: any[] = [];
  const transactions: any[] = [];
  const subs: any[] = [];
  const users: any[] = [{ id: USER, subscription: "free", paymentsBlockedAt: null, paymentsBlockReason: null }];
  const prisma: any = {
    $queryRaw: async () => [],
    payment: {
      findFirst: async ({ where }: any) => payments.find((p) => p.id === where.id && p.provider === where.provider) ?? null,
      findUnique: async ({ where }: any) =>
        payments.find((p) =>
          where.id ? p.id === where.id : p.provider === where.provider_externalId.provider && p.externalId === where.provider_externalId.externalId,
        ) ?? null,
      findUniqueOrThrow: async ({ where }: any) => payments.find((p) => p.id === where.id),
      update: async ({ where, data }: any) => Object.assign(payments.find((p) => p.id === where.id), data),
      updateMany: async ({ where, data }: any) => {
        const allowed = where.status?.in ?? [where.status];
        const rows = payments.filter((p) => p.id === where.id && allowed.includes(p.status));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
    paymentTransaction: {
      findUnique: async ({ where }: any) => {
        const key = where.provider_externalTransactionId;
        return transactions.find((t) => t.provider === key.provider && t.externalTransactionId === key.externalTransactionId) ?? null;
      },
      findMany: async ({ where }: any) => transactions.filter((t) => t.paymentId === where.paymentId),
      create: async ({ data }: any) => {
        if (transactions.some((t) => t.provider === data.provider && t.externalTransactionId === data.externalTransactionId)) {
          throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
        }
        const row = { id: `tx-${transactions.length + 1}`, relatedId: null, ...data };
        transactions.push(row);
        return row;
      },
    },
    siteSubscription: {
      findUnique: async ({ where }: any) => {
        if (where.userId) return subs.find((s) => s.userId === where.userId) ?? null;
        const key = where.provider_externalSubscriptionId;
        return subs.find((s) => s.provider === key.provider && s.externalSubscriptionId === key.externalSubscriptionId) ?? null;
      },
      findFirst: async ({ where }: any) => subs.find((s) => s.originPaymentId === where.originPaymentId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const found = subs.find((s) => s.userId === where.userId);
        if (found) return Object.assign(found, update);
        const row = { id: `sub-${subs.length + 1}`, ...create };
        subs.push(row);
        return row;
      },
      update: async ({ where, data }: any) => Object.assign(subs.find((s) => s.id === where.id), data),
    },
    user: {
      update: async ({ where, data }: any) => Object.assign(users.find((u) => u.id === where.id), data),
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);
  return { prisma, payments, transactions, subs, users };
}

function creditPayment(extra: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    userId: USER,
    provider: "upgate",
    productId: "prod-1",
    productKind: "credits",
    productTitle: "100 credits",
    amountMinor: 1000,
    currency: "USD",
    credits: 100,
    periodDays: null,
    status: "created",
    externalId: "ext-1",
    refundedMinor: 0,
    needsReview: false,
    reviewReason: null,
    ...extra,
  };
}

const premiumPayment = () => creditPayment({ productKind: "premium", productTitle: "Premium", credits: 0, periodDays: 30 });

const event = (kind: NormalizedEvent["kind"], txId?: string, extra: Partial<NormalizedEvent> = {}): NormalizedEvent => ({
  eventKey: `${kind}:${txId ?? "none"}`,
  kind,
  paymentId: undefined,
  externalPaymentId: "ext-1",
  externalTransactionId: txId,
  ...(["paid", "renewal"].includes(kind) ? { amountMinor: 1000, currency: "USD" } : {}),
  ...extra,
});

describe("FulfillmentService", () => {
  let db: ReturnType<typeof fakeDb>;
  let wallet: any;
  let balance: number;
  let provider: { cancelSubscription: jest.Mock };
  let service: FulfillmentService;

  beforeEach(() => {
    db = fakeDb();
    balance = 0;
    const seen = new Set<string>();
    wallet = {
      ensureWallet: jest.fn(),
      creditTx: jest.fn(async (_db: unknown, params: any) => {
        if (seen.has(params.operationKey)) return;
        seen.add(params.operationKey);
        balance += params.amount;
      }),
    };
    provider = { cancelSubscription: jest.fn() };
    service = new FulfillmentService(db.prisma, wallet, { get: () => provider } as any);
  });

  describe("оплата", () => {
    it("начисляет кредиты и переводит платёж в paid", async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1"));
      expect(balance).toBe(100);
      expect(db.payments[0].status).toBe("paid");
      expect(db.payments[0].paidAt).toBeInstanceOf(Date);
    });

    it("повтор той же транзакции не начисляет дважды", async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1"));
      await service.apply("upgate", event("paid", "t1"));
      expect(balance).toBe(100);
      expect(db.transactions).toHaveLength(1);
    });

    it("гонка за транзакцию (P2002) считается уже обработанной", async () => {
      db.payments.push(creditPayment());
      const create = db.prisma.paymentTransaction.create;
      db.prisma.paymentTransaction.create = jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }),
      );
      await expect(service.apply("upgate", event("paid", "t1"))).resolves.toBeUndefined();
      db.prisma.paymentTransaction.create = create;
      expect(balance).toBe(0);
    });

    it.each([
      ["сумма", { amountMinor: 999 }],
      ["валюта", { currency: "EUR" }],
      ["нет суммы", { amountMinor: undefined }],
    ])("при расхождении (%s) ничего не выдаёт и ставит на проверку", async (_name, extra) => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1", extra));
      expect(balance).toBe(0);
      expect(db.payments[0].status).toBe("created");
      expect(db.payments[0].needsReview).toBe(true);
    });

    it("спорное событие адаптера не выдаёт товар", async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1", { reviewReason: "Недоплата" }));
      expect(balance).toBe(0);
      expect(db.payments[0].reviewReason).toBe("Недоплата");
    });

    it("поздняя оплата истёкшего платежа выдаёт товар", async () => {
      db.payments.push(creditPayment({ status: "expired" }));
      await service.apply("upgate", event("paid", "t1"));
      expect(db.payments[0].status).toBe("paid");
      expect(balance).toBe(100);
    });

    it("вторая оплата с другим id не начисляет и идёт на проверку", async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1"));
      await service.apply("upgate", event("paid", "t2"));
      expect(balance).toBe(100);
      expect(db.payments[0].needsReview).toBe(true);
    });

    it("отказ после успеха не меняет статус", async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1"));
      await service.apply("upgate", event("failed"));
      expect(db.payments[0].status).toBe("paid");
    });

    it("неизвестный платёж повторяется позже", async () => {
      await expect(service.apply("upgate", event("paid", "t1"))).rejects.toBeInstanceOf(PaymentEventNotReadyError);
    });

    it("не находит платёж другого провайдера по внешнему id", async () => {
      db.payments.push(creditPayment({ provider: "coingate" }));
      await expect(service.apply("upgate", event("paid", "t1"))).rejects.toBeInstanceOf(PaymentEventNotReadyError);
    });
  });

  describe("Premium", () => {
    const withSub = { externalSubscriptionId: "s1", subscription: { autoRenew: true, version: 1 } };

    it("активирует подписку и флаг пользователя", async () => {
      db.payments.push(premiumPayment());
      const before = Date.now();
      await service.apply("upgate", event("paid", "t1", withSub));
      expect(db.users[0].subscription).toBe("paid");
      expect(db.subs[0].status).toBe("active");
      expect(db.subs[0].autoRenew).toBe(true);
      expect(db.subs[0].expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY);
    });

    it("продление добавляет период к сроку и сохраняет данные подписки", async () => {
      db.payments.push(premiumPayment());
      await service.apply("upgate", event("paid", "t1", withSub));
      const first = db.subs[0].expiresAt.getTime();
      await service.apply("upgate", event("renewal", "t2", { externalPaymentId: undefined, externalSubscriptionId: "s1" }));
      expect(db.subs[0].expiresAt.getTime()).toBeGreaterThanOrEqual(first + 30 * DAY);
      expect(db.subs[0].externalSubscriptionId).toBe("s1");
      expect(db.subs[0].autoRenew).toBe(true);
      expect(db.subs[0].lastEventVersion).toBe(1);
    });

    it("обновление подписки меняет автопродление, но не срок", async () => {
      db.payments.push(premiumPayment());
      await service.apply("upgate", event("paid", "t1", withSub));
      const expiresAt = db.subs[0].expiresAt;
      await service.apply("upgate", event("subscription_update", undefined, { subscription: { autoRenew: false, version: 2 } }));
      expect(db.subs[0].autoRenew).toBe(false);
      expect(db.subs[0].expiresAt).toBe(expiresAt);
    });

    it("устаревшая версия подписки игнорируется", async () => {
      db.payments.push(premiumPayment());
      await service.apply("upgate", event("paid", "t1", { ...withSub, subscription: { autoRenew: true, version: 5 } }));
      await service.apply("upgate", event("subscription_update", undefined, { subscription: { autoRenew: false, version: 4 } }));
      expect(db.subs[0].autoRenew).toBe(true);
    });

    it("обновление раньше оплаты повторяется позже", async () => {
      db.payments.push(premiumPayment());
      await expect(service.apply("upgate", event("subscription_update"))).rejects.toBeInstanceOf(PaymentEventNotReadyError);
    });

    it("продление отключённой подписки не выдаёт доступ", async () => {
      db.payments.push(premiumPayment());
      await service.apply("upgate", event("paid", "t1", withSub));
      await service.apply("upgate", event("chargeback", "c1"));
      await service.apply("upgate", event("renewal", "t2"));
      expect(db.subs[0].status).toBe("revoked");
      expect(db.users[0].subscription).toBe("free");
      expect(db.payments[0].reviewReason).toContain("отключённой");
    });

    it("разовая крипто-покупка подписки без автопродления", async () => {
      db.payments.push(premiumPayment());
      await service.apply("upgate", event("paid", "t1"));
      expect(db.subs[0].autoRenew).toBe(false);
    });
  });

  describe("возвраты", () => {
    beforeEach(async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1"));
    });

    it("полный возврат списывает кредиты", async () => {
      await service.apply("upgate", event("refund", "r1"));
      expect(balance).toBe(0);
      expect(db.payments[0].status).toBe("refunded");
      expect(db.payments[0].refundedMinor).toBe(1000);
      expect(db.users[0].paymentsBlockedAt).toBeNull();
    });

    it("частичный возврат списывает пропорционально и идёт на проверку", async () => {
      await service.apply("upgate", event("refund", "r1", { amountMinor: 250, currency: "USD" }));
      expect(balance).toBe(75);
      expect(db.payments[0].status).toBe("partially_refunded");
      expect(db.payments[0].needsReview).toBe(true);
    });

    it("сумма возвратов не превышает платёж", async () => {
      await service.apply("upgate", event("refund", "r1", { amountMinor: 700, currency: "USD" }));
      await service.apply("upgate", event("refund", "r2", { amountMinor: 700, currency: "USD" }));
      expect(balance).toBe(0);
      expect(db.payments[0].refundedMinor).toBe(1000);
      expect(db.payments[0].status).toBe("refunded");
    });

    it("возврат в другой валюте не применяется автоматически", async () => {
      await service.apply("upgate", event("refund", "r1", { amountMinor: 100, currency: "EUR" }));
      expect(balance).toBe(100);
      expect(db.payments[0].status).toBe("paid");
      expect(db.payments[0].needsReview).toBe(true);
    });

    it("возврат раньше оплаты повторяется позже", async () => {
      db.payments.length = 0;
      db.transactions.length = 0;
      db.payments.push(creditPayment());
      await expect(service.apply("upgate", event("refund", "r1"))).rejects.toBeInstanceOf(PaymentEventNotReadyError);
    });
  });

  describe("возврат Premium", () => {
    it("полный возврат последней оплаты отключает Premium без блокировки", async () => {
      db.payments.push(premiumPayment());
      await service.apply("upgate", event("paid", "t1", { externalSubscriptionId: "s1" }));
      await service.apply("upgate", event("refund", "r1"));
      expect(db.subs[0].status).toBe("revoked");
      expect(db.users[0].subscription).toBe("free");
      expect(db.users[0].paymentsBlockedAt).toBeNull();
      expect(provider.cancelSubscription).toHaveBeenCalledTimes(1);
    });

    it("возврат прошлого периода не отключает Premium, а идёт на проверку", async () => {
      db.payments.push(premiumPayment());
      await service.apply("upgate", event("paid", "t1", { externalSubscriptionId: "s1" }));
      await service.apply("upgate", event("renewal", "t2"));
      await service.apply("upgate", event("refund", "r1", { relatedExternalTransactionId: "t1" }));
      expect(db.subs[0].status).toBe("active");
      expect(db.payments[0].needsReview).toBe(true);
      expect(db.payments[0].status).toBe("partially_refunded");
    });
  });

  describe("чарджбэк", () => {
    it("уводит баланс в минус, отключает Premium и блокирует покупки", async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1"));
      balance -= 80; // кредиты уже потрачены
      db.users[0].subscription = "paid";
      await service.apply("upgate", event("chargeback", "c1"));
      expect(balance).toBe(-80);
      expect(db.payments[0].status).toBe("charged_back");
      expect(db.payments[0].needsReview).toBe(true);
      expect(db.users[0].subscription).toBe("free");
      expect(db.users[0].paymentsBlockedAt).toBeInstanceOf(Date);
    });

    it("сбой отмены автопродления повторяется без повторного списания", async () => {
      db.payments.push(premiumPayment());
      await service.apply("upgate", event("paid", "t1", { externalSubscriptionId: "s1" }));
      provider.cancelSubscription.mockRejectedValueOnce(new Error("api down"));
      await expect(service.apply("upgate", event("chargeback", "c1"))).rejects.toThrow("api down");
      expect(db.subs[0].providerCancelPending).toBe(true);
      expect(db.transactions.filter((t) => t.type === "chargeback")).toHaveLength(1);

      await service.apply("upgate", event("chargeback", "c1"));
      expect(provider.cancelSubscription).toHaveBeenCalledTimes(2);
      expect(db.subs[0].providerCancelPending).toBe(false);
      expect(db.transactions.filter((t) => t.type === "chargeback")).toHaveLength(1);
    });

    it("отмена чарджбэка возвращает кредиты, но не снимает блокировку", async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1"));
      await service.apply("upgate", event("chargeback", "c1"));
      await service.apply("upgate", event("chargeback_reversal", "c2"));
      expect(balance).toBe(100);
      expect(db.payments[0].status).toBe("paid");
      expect(db.payments[0].refundedMinor).toBe(0);
      expect(db.users[0].paymentsBlockedAt).toBeInstanceOf(Date);
    });

    it("после отмены чарджбэка возврат снова доступен на всю сумму", async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1"));
      await service.apply("upgate", event("chargeback", "c1"));
      await service.apply("upgate", event("chargeback_reversal", "c2"));
      await service.apply("upgate", event("refund", "r1"));
      expect(balance).toBe(0);
      expect(db.payments[0].status).toBe("refunded");
    });

    it("отмена без чарджбэка повторяется позже", async () => {
      db.payments.push(creditPayment());
      await service.apply("upgate", event("paid", "t1"));
      await expect(service.apply("upgate", event("chargeback_reversal", "c2"))).rejects.toBeInstanceOf(PaymentEventNotReadyError);
    });
  });

  it("fraud alert только ставит платёж на проверку", async () => {
    db.payments.push(creditPayment());
    await service.apply("upgate", event("paid", "t1"));
    await service.apply("upgate", event("fraud_alert"));
    expect(balance).toBe(100);
    expect(db.payments[0].status).toBe("paid");
    expect(db.payments[0].needsReview).toBe(true);
  });

  it("платёж удалённого пользователя не выдаётся", async () => {
    db.payments.push(creditPayment({ userId: null }));
    await service.apply("upgate", event("paid", "t1"));
    expect(balance).toBe(0);
    expect(db.payments[0].needsReview).toBe(true);
  });
});
