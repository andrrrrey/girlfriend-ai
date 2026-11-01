import { PaymentReconciliationService } from "./payment-reconciliation.service";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

/** Минимальный разбор where: только условия, которые использует сервис. */
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, condition]: [string, any]) => {
    if (key === "OR") return condition.some((branch: any) => matches(row, branch));
    if (condition instanceof Date) return row[key]?.getTime() === condition.getTime();
    if (condition && typeof condition === "object") {
      if (condition.in && !condition.in.includes(row[key])) return false;
      if ("not" in condition && row[key] === condition.not) return false;
      if (condition.gt && !(row[key] > condition.gt)) return false;
      if (condition.lt && !(row[key] < condition.lt)) return false;
      return true;
    }
    return row[key] === condition;
  });
}

function setup() {
  const payments: any[] = [];
  const subs: any[] = [];
  const users: any[] = [{ id: "user-1", subscription: "paid" }];
  const page = (rows: any[], { where, take, cursor }: any) => {
    const found = rows.filter((row) => matches(row, where));
    const start = cursor ? found.findIndex((row) => row.id === cursor.id) + 1 : 0;
    return found.slice(start, start + take);
  };
  const prisma: any = {
    payment: {
      findMany: async (args: any) => page(payments, args),
      updateMany: async ({ where, data }: any) => {
        const rows = payments.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    siteSubscription: {
      findMany: async (args: any) => page(subs, args),
      updateMany: async ({ where, data }: any) => {
        const rows = subs.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      },
    },
    user: { update: async ({ where, data }: any) => Object.assign(users.find((u) => u.id === where.id), data) },
  };
  prisma.$transaction = async (fn: (tx: unknown) => unknown) => fn(prisma);

  const provider: any = {
    id: "upgate",
    fetchState: jest.fn(async (p: any) => [{ eventKey: `state:${p.id}`, kind: "paid" }]),
    fetchSubscription: jest.fn(async (s: any) => [{ eventKey: `sub:${s.id}`, kind: "renewal" }]),
  };
  const registry: any = {
    get: (id: string) => (id === "upgate" ? provider : undefined),
    isEnabled: jest.fn(async () => true),
  };
  const events: any = { enqueue: jest.fn() };
  const scheduler: any = { scheduleInterval: jest.fn(), scheduleDaily: jest.fn() };
  const service = new PaymentReconciliationService(prisma, scheduler, registry, events);
  return { payments, subs, users, provider, registry, events, scheduler, service };
}

const payment = (extra: Record<string, unknown> = {}) => ({
  id: "pay-1",
  provider: "upgate",
  status: "pending",
  externalId: "ext-1",
  createdAt: ago(HOUR),
  ...extra,
});

const subscription = (extra: Record<string, unknown> = {}) => ({
  id: "sub-1",
  userId: "user-1",
  provider: "upgate",
  status: "active",
  autoRenew: true,
  externalSubscriptionId: "S1",
  expiresAt: ago(HOUR),
  ...extra,
});

describe("PaymentReconciliationService", () => {
  it("планирует почасовую и суточную задачу", () => {
    const { service, scheduler } = setup();
    service.onModuleInit();
    expect(scheduler.scheduleInterval).toHaveBeenCalledWith("payment-reconcile", HOUR, expect.any(Function));
    expect(scheduler.scheduleDaily).toHaveBeenCalledWith("payment-reconcile-subscriptions", 5, expect.any(Function));
  });

  describe("reconcilePayments", () => {
    it("отправляет состояние незавершённого платежа в очередь", async () => {
      const { service, payments, events } = setup();
      payments.push(payment());
      await expect(service.reconcilePayments()).resolves.toBe(1);
      expect(events.enqueue).toHaveBeenCalledWith("upgate", [{ eventKey: "state:pay-1", kind: "paid" }]);
    });

    it.each<[string, Record<string, unknown>]>([
      ["слишком свежий", { createdAt: ago(MINUTE) }],
      ["слишком старый", { createdAt: ago(2 * DAY) }],
      ["уже оплачен", { status: "paid" }],
      ["провайдер не создал заказ", { externalId: null }],
    ])("пропускает: %s", async (_name, extra) => {
      const { service, payments, provider } = setup();
      payments.push(payment(extra));
      await service.reconcilePayments();
      expect(provider.fetchState).not.toHaveBeenCalled();
    });

    it("сверяет платёж с отказом: покупатель мог оплатить той же сессией", async () => {
      const { service, payments, provider } = setup();
      payments.push(payment({ status: "failed" }));
      await service.reconcilePayments();
      expect(provider.fetchState).toHaveBeenCalledTimes(1);
    });

    it("сбой одного платежа не мешает остальным", async () => {
      const { service, payments, provider, events } = setup();
      payments.push(payment({ id: "a" }), payment({ id: "b" }));
      provider.fetchState.mockRejectedValueOnce(new Error("api down"));
      await expect(service.reconcilePayments()).resolves.toBe(1);
      expect(events.enqueue).toHaveBeenCalledTimes(1);
    });

    it("выключенный провайдер не опрашивается и проверяется один раз", async () => {
      const { service, payments, provider, registry } = setup();
      registry.isEnabled.mockResolvedValue(false);
      payments.push(payment({ id: "a" }), payment({ id: "b" }));
      await service.reconcilePayments();
      expect(provider.fetchState).not.toHaveBeenCalled();
      expect(registry.isEnabled).toHaveBeenCalledTimes(1);
    });

    it("платёж провайдера без адаптера пропускается", async () => {
      const { service, payments, events } = setup();
      payments.push(payment({ provider: "stripe" }));
      await expect(service.reconcilePayments()).resolves.toBe(0);
      expect(events.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("syncDueSubscriptions", () => {
    it.each<[string, Record<string, unknown>, number]>([
      ["срок подходит", {}, 1],
      ["срок истекает через день", { expiresAt: ahead(DAY) }, 1],
      ["уже истекла, но ещё можно продлить", { status: "expired", expiresAt: ago(5 * DAY) }, 1],
      ["срок ещё далеко", { expiresAt: ahead(10 * DAY) }, 0],
      ["истекла давно", { status: "expired", expiresAt: ago(30 * DAY) }, 0],
      ["без автопродления", { autoRenew: false }, 0],
      ["отключена после чарджбэка", { status: "revoked" }, 0],
      ["нет id подписки", { externalSubscriptionId: null }, 0],
    ])("%s", async (_name, extra, calls) => {
      const { service, subs, provider } = setup();
      subs.push(subscription(extra));
      await service.syncDueSubscriptions();
      expect(provider.fetchSubscription).toHaveBeenCalledTimes(calls);
    });

    it("адаптер без fetchSubscription ничего не ломает", async () => {
      const { service, subs, provider, events } = setup();
      provider.fetchSubscription = undefined;
      subs.push(subscription());
      await expect(service.syncDueSubscriptions()).resolves.toBe(1);
      expect(events.enqueue).toHaveBeenCalledWith("upgate", []);
    });
  });

  describe("syncAllSubscriptions", () => {
    it("проходит все страницы и только активные подписки", async () => {
      const { service, subs, provider } = setup();
      for (let i = 0; i < 201; i++) subs.push(subscription({ id: `sub-${i}`, expiresAt: ahead(10 * DAY) }));
      subs.push(subscription({ id: "revoked", status: "revoked" }));
      await expect(service.syncAllSubscriptions()).resolves.toBe(201);
      expect(provider.fetchSubscription).toHaveBeenCalledTimes(201);
    });
  });

  describe("expireCheckouts", () => {
    it("закрывает только незавершённые старше суток", async () => {
      const { service, payments } = setup();
      payments.push(
        payment({ id: "old", createdAt: ago(2 * DAY) }),
        payment({ id: "created", status: "created", externalId: null, createdAt: ago(2 * DAY) }),
        payment({ id: "fresh" }),
        payment({ id: "paid", status: "paid", createdAt: ago(2 * DAY) }),
      );
      await expect(service.expireCheckouts()).resolves.toBe(2);
      expect(payments.map((p) => p.status)).toEqual(["expired", "expired", "pending", "paid"]);
    });
  });

  describe("expireSubscriptions", () => {
    it("снимает истёкший Premium без автопродления", async () => {
      const { service, subs, users } = setup();
      subs.push(subscription({ autoRenew: false }));
      await expect(service.expireSubscriptions()).resolves.toBe(1);
      expect(subs[0].status).toBe("expired");
      expect(users[0].subscription).toBe("free");
    });

    it("автопродление получает три дня на повторы списания", async () => {
      const { service, subs, users } = setup();
      subs.push(subscription({ expiresAt: ago(2 * DAY) }));
      await expect(service.expireSubscriptions()).resolves.toBe(0);
      expect(users[0].subscription).toBe("paid");
    });

    it("после этих трёх дней снимает и автопродление", async () => {
      const { service, subs, users } = setup();
      subs.push(subscription({ expiresAt: ago(4 * DAY) }));
      await expect(service.expireSubscriptions()).resolves.toBe(1);
      expect(users[0].subscription).toBe("free");
    });

    it("не трогает действующий Premium", async () => {
      const { service, subs, users } = setup();
      subs.push(subscription({ autoRenew: false, expiresAt: ahead(DAY) }));
      await expect(service.expireSubscriptions()).resolves.toBe(0);
      expect(users[0].subscription).toBe("paid");
    });

    it("продление между выборкой и транзакцией не снимает Premium", async () => {
      const { service, subs, users } = setup();
      const row = subscription({ autoRenew: false });
      subs.push(row);
      const prismaFindMany = (service as any).prisma.siteSubscription.findMany;
      (service as any).prisma.siteSubscription.findMany = async (args: any) => {
        const rows = (await prismaFindMany(args)).map((r: any) => ({ ...r }));
        row.expiresAt = ahead(30 * DAY);
        return rows;
      };
      await expect(service.expireSubscriptions()).resolves.toBe(0);
      expect(row.status).toBe("active");
      expect(users[0].subscription).toBe("paid");
    });
  });

  it("сверяет раньше, чем снимает Premium", async () => {
    const { service, subs, provider } = setup();
    subs.push(subscription({ expiresAt: ago(4 * DAY) }));
    provider.fetchSubscription.mockImplementation(async () => {
      expect(subs[0].status).toBe("active");
      return [];
    });
    await service.runHourly();
    expect(provider.fetchSubscription).toHaveBeenCalledTimes(1);
    expect(subs[0].status).toBe("expired");
  });
});
