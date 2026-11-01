jest.mock("@repo/config", () => ({ loadEnv: () => ({ WEB_URL: "https://site.test" }) }));

import { BadGatewayException, BadRequestException, NotFoundException } from "@nestjs/common";
import type { PaymentProvider } from "./payment-provider";
import { PaymentsAdminService } from "./payments-admin.service";
import { PaymentsService } from "./payments.service";

const ACTOR = "admin-1";
const providerDto = (extra: Record<string, unknown> = {}): any => ({ enabled: true, mode: "sandbox", secrets: {}, settings: {}, ...extra });
const productDto = (extra: Record<string, unknown> = {}): any => ({
  kind: "credits",
  title: "100",
  priceMinor: 1000,
  currency: "USD",
  credits: 100,
  periodDays: null,
  active: true,
  sortOrder: 0,
  ...extra,
});

function setup() {
  const upgate: Partial<PaymentProvider> & { refund: jest.Mock; testConnection: jest.Mock } = {
    id: "upgate",
    requiredSecrets: ["UPGATE_API_KEY"],
    refund: jest.fn(),
    testConnection: jest.fn(),
  };
  const coingate: any = { id: "coingate", requiredSecrets: ["COINGATE_API_TOKEN"], testConnection: jest.fn() };
  const registry: any = {
    get: (id: string) => (id === "upgate" ? upgate : id === "coingate" ? coingate : undefined),
    isEnabled: jest.fn(async () => true),
  };
  const configs: any = {
    save: jest.fn(),
    describe: jest.fn(async (provider: string) => ({ provider, secrets: { KEY: { configured: true, hint: "…1234" } } })),
  };
  const prisma: any = {
    billingProduct: {
      create: jest.fn(async ({ data }: any) => data),
      update: jest.fn(async ({ data }: any) => data),
      findUnique: jest.fn(async () => ({ id: "p1" })),
    },
    payment: {
      findUnique: jest.fn(async () => ({ id: "pay-1", provider: "upgate" })),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    paymentTransaction: {
      findFirst: jest.fn(async () => ({ id: "tx-1", externalTransactionId: "SALE:T1", amountMinor: 1000, currency: "USD" })),
      groupBy: jest.fn(async () => [{ provider: "upgate", currency: "USD", type: "sale", _sum: { amountMinor: 1000 }, _count: { _all: 2 } }]),
    },
    user: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  const payments = new PaymentsService(prisma, registry);
  const service = new PaymentsAdminService(prisma, registry, configs, payments);
  return { service, prisma, configs, registry, upgate, coingate };
}

describe("PaymentsAdminService", () => {
  describe("провайдеры", () => {
    it("отдаёт маскированные секреты и адрес webhook", async () => {
      const { service } = setup();
      const [coingate, upgate] = await service.listProviders();
      expect(coingate.webhookUrl).toBe("https://site.test/api-proxy/payments/webhook/coingate");
      expect(upgate.requiredSecrets).toEqual(["UPGATE_API_KEY"]);
      expect(upgate.available).toBe(true);
    });

    it("сохраняет ключ и пишет автора", async () => {
      const { service, configs } = setup();
      await service.updateProvider("upgate", providerDto({ secrets: { UPGATE_API_KEY: "k" } }), ACTOR);
      expect(configs.save).toHaveBeenCalledWith("upgate", expect.objectContaining({ secrets: { UPGATE_API_KEY: "k" }, updatedBy: ACTOR }));
    });

    it("секрет не попадает в лог", async () => {
      const { service } = setup();
      const log = jest.spyOn((service as any).logger, "log").mockImplementation(() => undefined);
      await service.updateProvider("upgate", providerDto({ secrets: { UPGATE_API_KEY: "very-secret" } }), ACTOR);
      expect(JSON.stringify(log.mock.calls)).not.toContain("very-secret");
    });

    it("отклоняет чужое имя секрета", async () => {
      const { service, configs } = setup();
      await expect(service.updateProvider("upgate", providerDto({ secrets: { OTHER: "k" } }), ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(configs.save).not.toHaveBeenCalled();
    });

    it("отклоняет неверный тип значения секрета", async () => {
      const { service } = setup();
      await expect(service.updateProvider("upgate", providerDto({ secrets: { UPGATE_API_KEY: 1 } }), ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("неизвестный провайдер — 404", async () => {
      const { service } = setup();
      await expect(service.updateProvider("stripe", providerDto(), ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each<[string, Record<string, unknown>]>([
      ["неизвестная настройка", { OTHER: "x" }],
      ["неверная валюта", { COINGATE_RECEIVE_CURRENCY: "usd;drop" }],
    ])("отклоняет: %s", async (_name, settings) => {
      const { service } = setup();
      await expect(service.updateProvider("coingate", providerDto({ settings }), ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("пустая настройка убирается", async () => {
      const { service, configs } = setup();
      await service.updateProvider("coingate", providerDto({ settings: { COINGATE_RECEIVE_CURRENCY: "" } }), ACTOR);
      expect(configs.save).toHaveBeenCalledWith("coingate", expect.objectContaining({ settings: {} }));
    });

    it("без SECRETS_ENC_KEY объясняет причину", async () => {
      const { service, configs } = setup();
      configs.save.mockRejectedValue(new Error("SECRETS_ENC_KEY is not configured"));
      await expect(service.updateProvider("upgate", providerDto(), ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("проверка ключа возвращает ошибку как результат", async () => {
      const { service, upgate } = setup();
      await expect(service.testProvider("upgate")).resolves.toEqual({ ok: true });
      upgate.testConnection.mockRejectedValue(new Error("HTTP 401"));
      await expect(service.testProvider("upgate")).resolves.toEqual({ ok: false, error: "HTTP 401" });
    });
  });

  describe("каталог", () => {
    it("у пакета кредитов срок всегда пуст", async () => {
      const { service, prisma } = setup();
      await service.createProduct(productDto({ periodDays: 30 }));
      expect(prisma.billingProduct.create.mock.calls[0][0].data.periodDays).toBeNull();
    });

    it("Premium без срока отклоняется", () => {
      const { service } = setup();
      expect(() => service.createProduct(productDto({ kind: "premium", periodDays: null }))).toThrow(BadRequestException);
    });

    it("пакет без кредитов отклоняется", () => {
      const { service } = setup();
      expect(() => service.createProduct(productDto({ credits: 0 }))).toThrow(BadRequestException);
    });

    it("несуществующий продукт — 404", async () => {
      const { service, prisma } = setup();
      prisma.billingProduct.findUnique.mockResolvedValue(null);
      await expect(service.updateProduct("x", productDto())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("платежи", () => {
    it("список не выбирает хеш токена и применяет фильтры", async () => {
      const { service, prisma } = setup();
      await service.listPayments({ status: "paid", provider: "upgate", needsReview: true });
      const args = prisma.payment.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ status: "paid", provider: "upgate", needsReview: true });
      expect(args.select.callbackTokenHash).toBeUndefined();
    });

    it("считает следующую страницу", async () => {
      const { service, prisma } = setup();
      prisma.payment.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => ({ id: `p${i}` })));
      const page = await service.listPayments({});
      expect(page.items).toHaveLength(50);
      expect(page.nextCursor).toBe("p49");
    });

    it("статистика разворачивает суммы", async () => {
      const { service } = setup();
      await expect(service.stats()).resolves.toEqual([{ provider: "upgate", currency: "USD", type: "sale", amountMinor: 1000, count: 2 }]);
    });
  });

  describe("возврат", () => {
    const dto = (extra: Record<string, unknown> = {}): any => ({ transactionId: "tx-1", reason: "причина", ...extra });

    it("только просит провайдера: статус не меняет", async () => {
      const { service, upgate, prisma } = setup();
      await expect(service.refund("pay-1", dto({ amountMinor: 500 }), ACTOR)).resolves.toEqual({ ok: true });
      expect(upgate.refund).toHaveBeenCalledWith({
        externalTransactionId: "SALE:T1",
        amountMinor: 500,
        currency: "USD",
        reason: "причина",
        initiatedBy: ACTOR,
      });
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it("сумма не больше транзакции", async () => {
      const { service, upgate } = setup();
      await expect(service.refund("pay-1", dto({ amountMinor: 1001 }), ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(upgate.refund).not.toHaveBeenCalled();
    });

    it("провайдер без API возвратов — понятная ошибка", async () => {
      const { service, prisma } = setup();
      prisma.payment.findUnique.mockResolvedValue({ id: "pay-1", provider: "coingate" });
      await expect(service.refund("pay-1", dto(), ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("транзакция чужого платежа или не покупка — 404", async () => {
      const { service, prisma } = setup();
      prisma.paymentTransaction.findFirst.mockResolvedValue(null);
      await expect(service.refund("pay-1", dto(), ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.paymentTransaction.findFirst.mock.calls[0][0].where).toEqual({
        id: "tx-1",
        paymentId: "pay-1",
        type: { in: ["sale", "rebill"] },
      });
    });

    it("отказ провайдера — 502", async () => {
      const { service, upgate } = setup();
      upgate.refund.mockRejectedValue(new Error("HTTP 400"));
      await expect(service.refund("pay-1", dto(), ACTOR)).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe("блокировка и проверка", () => {
    it("блокирует и снимает блокировку", async () => {
      const { service, prisma } = setup();
      await service.blockUser("u1", "мошенничество", ACTOR);
      expect(prisma.user.updateMany.mock.calls[0][0].data).toMatchObject({ paymentsBlockReason: "мошенничество" });
      await service.unblockUser("u1", ACTOR);
      expect(prisma.user.updateMany.mock.calls[1][0].data).toEqual({ paymentsBlockedAt: null, paymentsBlockReason: null });
    });

    it("несуществующий пользователь — 404", async () => {
      const { service, prisma } = setup();
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.blockUser("x", "r", ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("снимает отметку о проверке", async () => {
      const { service, prisma } = setup();
      await service.resolveReview("pay-1", ACTOR);
      expect(prisma.payment.updateMany.mock.calls[0][0].data).toEqual({ needsReview: false, reviewReason: null });
    });
  });
});

describe("PaymentsService: автопродление", () => {
  function setupCancel(subscription: any) {
    const cancelSubscription = jest.fn();
    const prisma: any = {
      siteSubscription: {
        findUnique: async () => subscription,
        update: jest.fn(async ({ data }: any) => ({ ...subscription, ...data })),
      },
      user: { findUnique: async () => ({ paymentsBlockedAt: null }) },
    };
    const registry: any = { get: () => ({ cancelSubscription }) };
    return { prisma, cancelSubscription, service: new PaymentsService(prisma, registry) };
  }
  const active = { id: "s1", provider: "upgate", status: "active", autoRenew: true, expiresAt: new Date(), externalSubscriptionId: "S1", originPaymentId: "pay-1" };

  it("отменяет у провайдера и сохраняет срок", async () => {
    const { service, cancelSubscription, prisma } = setupCancel(active);
    await expect(service.cancelAutoRenew("u1")).resolves.toEqual({ autoRenew: false });
    expect(cancelSubscription).toHaveBeenCalledWith(active);
    expect(prisma.siteSubscription.update.mock.calls[0][0].data).toEqual({ autoRenew: false });
  });

  it("сбой провайдера оставляет автопродление включённым", async () => {
    const { service, cancelSubscription, prisma } = setupCancel(active);
    cancelSubscription.mockRejectedValue(new Error("api down"));
    await expect(service.cancelAutoRenew("u1")).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.siteSubscription.update).not.toHaveBeenCalled();
  });

  it.each<[string, any]>([
    ["нет подписки", null],
    ["автопродление уже выключено", { ...active, autoRenew: false }],
    ["подписка отключена", { ...active, status: "revoked" }],
  ])("конфликт: %s", async (_name, subscription) => {
    const { service } = setupCancel(subscription);
    await expect(service.cancelAutoRenew("u1")).rejects.toMatchObject({ status: 409 });
  });

  it("статус не раскрывает внешние идентификаторы", async () => {
    const { service } = setupCancel(active);
    const own = await service.getOwnSubscription("u1");
    expect(own.subscription).toEqual({ status: "active", expiresAt: active.expiresAt, autoRenew: true, provider: "upgate" });
    expect(own.paymentsBlocked).toBe(false);
  });
});
