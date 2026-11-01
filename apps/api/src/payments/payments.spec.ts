jest.mock("@repo/config", () => ({
  loadEnv: () => ({ WEB_URL: "https://site.test/", PAYMENTS_PUBLIC_BASE_URL: undefined }),
}));

import { BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { fromMinor, toMinor } from "./money";
import { PaymentRegistryService } from "./payment-registry.service";
import { WebhookRejectedError } from "./payment-provider";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { ProviderConfigService, maskSecret } from "./provider-config.service";

const USER = "user-1";
const PRODUCT = { id: "prod-1", kind: "credits", title: "100", priceMinor: 1000, currency: "USD", credits: 100, periodDays: null };

describe("money", () => {
  it.each([
    ["10", 1000],
    ["10.5", 1050],
    ["10.50", 1050],
    ["0.01", 1],
    ["10.5000", 1050],
    [19.99, 1999],
  ])("toMinor(%s) = %s", (value, minor) => {
    expect(toMinor(value)).toBe(minor);
  });

  it.each(["", "abc", "-1", "1.005", "1,5", "1e3"])("toMinor(%s) отклоняет", (value) => {
    expect(toMinor(value)).toBeNull();
  });

  it.each([
    [1050, "10.50"],
    [1, "0.01"],
    [100000, "1000.00"],
  ])("fromMinor(%s) = %s", (minor, value) => {
    expect(fromMinor(minor)).toBe(value);
  });
});

describe("ProviderConfigService", () => {
  function setup(row: any = null) {
    const store = { row };
    const prisma: any = {
      paymentProviderConfig: {
        findUnique: async () => store.row,
        upsert: jest.fn(async ({ create, update }: any) => {
          store.row = { ...(store.row ?? create), ...update };
          return store.row;
        }),
      },
    };
    const crypto: any = {
      encrypt: (plain: string) => `enc:${plain}`,
      decrypt: (payload: string) => {
        if (!payload.startsWith("enc:")) throw new Error("bad key");
        return payload.slice(4);
      },
    };
    return { store, service: new ProviderConfigService(prisma, crypto) };
  }

  it("новый ключ дополняет сохранённые, пустой не затирает", async () => {
    const { store, service } = setup({ provider: "upgate", enabled: true, mode: "live", secretsEnc: 'enc:{"A":"old-a","B":"old-b"}' });
    await service.save("upgate", { secrets: { A: "  ", B: "new-b" } });
    expect(JSON.parse(store.row.secretsEnc.slice(4))).toEqual({ A: "old-a", B: "new-b" });
  });

  it("без новых секретов шифротекст не меняется", async () => {
    const { store, service } = setup({ provider: "upgate", secretsEnc: 'enc:{"A":"old"}' });
    await service.save("upgate", { enabled: true });
    expect(store.row.secretsEnc).toBe('enc:{"A":"old"}');
    expect(store.row.enabled).toBe(true);
  });

  it("describe не раскрывает секреты", async () => {
    const { service } = setup({ provider: "upgate", enabled: true, mode: "live", secretsEnc: 'enc:{"KEY":"super-secret-value-1234"}' });
    const view = await service.describe("upgate");
    expect(JSON.stringify(view)).not.toContain("super-secret-value");
    expect(view.secrets.KEY).toEqual({ configured: true, hint: "…1234" });
  });

  it("короткий секрет маскируется полностью", () => {
    expect(maskSecret("short")).toBe("…");
  });

  it("нечитаемые секреты помечаются, а не роняют сервис", async () => {
    const { service } = setup({ provider: "upgate", enabled: true, secretsEnc: "other-key-cipher" });
    await expect(service.load("upgate")).resolves.toMatchObject({ secretsUnreadable: true, secrets: {} });
  });

  it("без записи провайдер выключен и в режиме sandbox", async () => {
    const { service } = setup();
    await expect(service.load("coingate")).resolves.toMatchObject({ enabled: false, mode: "sandbox" });
  });
});

describe("PaymentRegistryService", () => {
  const adapter: any = { id: "upgate", requiredSecrets: ["KEY", "WEBHOOK"] };
  const registry = (config: any) => new PaymentRegistryService([adapter], { load: async () => config } as any);
  const ok = { enabled: true, secretsUnreadable: false, secrets: { KEY: "k", WEBHOOK: "w" } };

  it("включён, когда есть все секреты", async () => {
    await expect(registry(ok).isEnabled("upgate")).resolves.toBe(true);
    await expect(registry(ok).enabledIds()).resolves.toEqual(["upgate"]);
  });

  it.each([
    ["выключен в админке", { ...ok, enabled: false }],
    ["не хватает секрета", { ...ok, secrets: { KEY: "k" } }],
    ["секреты нечитаемы", { ...ok, secretsUnreadable: true }],
  ])("недоступен: %s", async (_name, config) => {
    await expect(registry(config).isEnabled("upgate")).resolves.toBe(false);
  });

  it("без адаптера недоступен", async () => {
    await expect(registry(ok).isEnabled("coingate")).resolves.toBe(false);
  });
});

describe("PaymentsService.createCheckout", () => {
  function setup(user: any = {}, sub: any = null) {
    const payments: any[] = [];
    const prisma: any = {
      user: { findFirst: async () => ({ id: USER, email: "a@b.c", lang: "en", isDemo: false, isAdult: true, paymentsBlockedAt: null, ...user }) },
      billingProduct: { findFirst: async ({ where }: any) => (where.id === PRODUCT.id ? { ...PRODUCT, kind: sub ? "premium" : "credits" } : null) },
      siteSubscription: { findUnique: async () => sub },
      payment: {
        count: jest.fn(async () => 0),
        create: async ({ data }: any) => {
          const row = { id: "pay-1", status: "created", ...data };
          payments.push(row);
          return row;
        },
        update: async ({ data }: any) => Object.assign(payments[0], data),
      },
    };
    const provider = {
      createCheckout: jest.fn(async () => ({ externalId: "ext-1", redirectUrl: "https://pay.test/1", callbackTokenHash: "hash" })),
    };
    const registry: any = { get: () => provider, isEnabled: jest.fn(async () => true) };
    return { prisma, payments, provider, registry, service: new PaymentsService(prisma, registry) };
  }

  it("берёт цену из каталога и возвращает ссылку на оплату", async () => {
    const { service, payments, provider } = setup();
    await expect(service.createCheckout(USER, PRODUCT.id, "upgate")).resolves.toEqual({ paymentId: "pay-1", redirectUrl: "https://pay.test/1" });
    expect(payments[0]).toMatchObject({ amountMinor: 1000, currency: "USD", credits: 100, externalId: "ext-1", callbackTokenHash: "hash" });
    expect(provider.createCheckout.mock.calls[0]).toEqual([
      expect.objectContaining({
        returnUrl: "https://site.test/payment/return?paymentId=pay-1",
        webhookUrl: "https://site.test/api-proxy/payments/webhook/upgate",
      }),
    ]);
  });

  it.each([
    ["демо", { isDemo: true }, "PAYMENTS_DEMO_USER"],
    ["младше 18", { isAdult: false }, "PAYMENTS_ADULT_ONLY"],
    ["блокировка", { paymentsBlockedAt: new Date() }, "PAYMENTS_BLOCKED"],
  ])("отклоняет: %s", async (_name, user, code) => {
    const { service, payments } = setup(user);
    await expect(service.createCheckout(USER, PRODUCT.id, "upgate")).rejects.toMatchObject({ response: { error: code } });
    expect(payments).toHaveLength(0);
  });

  it("неактивный продукт — 404", async () => {
    const { service } = setup();
    await expect(service.createCheckout(USER, "other", "upgate")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("выключенный провайдер не принимает оплату", async () => {
    const { service, registry } = setup();
    registry.isEnabled.mockResolvedValue(false);
    await expect(service.createCheckout(USER, PRODUCT.id, "upgate")).rejects.toMatchObject({
      response: { error: "PAYMENT_METHOD_UNAVAILABLE" },
    });
  });

  it("Premium нельзя купить поверх активного автопродления", async () => {
    const { service } = setup({}, { status: "active", autoRenew: true, expiresAt: new Date(Date.now() + 1000) });
    await expect(service.createCheckout(USER, PRODUCT.id, "coingate")).rejects.toMatchObject({ response: { error: "SUBSCRIPTION_ACTIVE" } });
  });

  it("Premium можно продлить без автопродления", async () => {
    const { service } = setup({}, { status: "active", autoRenew: false, expiresAt: new Date(Date.now() + 1000) });
    await expect(service.createCheckout(USER, PRODUCT.id, "coingate")).resolves.toMatchObject({ paymentId: "pay-1" });
  });

  it("ограничивает число попыток в час", async () => {
    const { service, prisma } = setup();
    prisma.payment.count.mockResolvedValue(10);
    await expect(service.createCheckout(USER, PRODUCT.id, "upgate")).rejects.toMatchObject({ status: 429 });
  });

  it("сбой провайдера помечает платёж failed и не раскрывает причину", async () => {
    const { service, provider, payments } = setup();
    provider.createCheckout.mockRejectedValue(new Error("secret upstream detail"));
    await expect(service.createCheckout(USER, PRODUCT.id, "upgate")).rejects.toMatchObject({
      status: 502,
      response: { error: "PAYMENT_PROVIDER_ERROR" },
    });
    expect(payments[0].status).toBe("failed");
  });
});

describe("POST /payments/webhook/:provider", () => {
  function setup(enabled = true) {
    const provider: any = { id: "upgate", parseWebhook: jest.fn(async () => [{ eventKey: "k", kind: "paid" }]) };
    const registry: any = { get: (id: string) => (id === "upgate" ? provider : undefined), isEnabled: async () => enabled };
    const events: any = { enqueue: jest.fn() };
    return { provider, events, controller: new PaymentsController({} as any, registry, events) };
  }
  const req: any = { rawBody: Buffer.from("{}") };

  it("сохраняет событие и отвечает успехом", async () => {
    const { controller, events, provider } = setup();
    await expect(controller.webhook("upgate", req, { "x-signature": "s" })).resolves.toEqual({ ok: true });
    expect(provider.parseWebhook).toHaveBeenCalledWith({ rawBody: req.rawBody, headers: { "x-signature": "s" } });
    expect(events.enqueue).toHaveBeenCalledWith("upgate", [{ eventKey: "k", kind: "paid" }]);
  });

  it("неизвестный провайдер — 404", async () => {
    await expect(setup().controller.webhook("stripe", req, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it("выключенный провайдер — 503, чтобы событие пришло повторно", async () => {
    await expect(setup(false).controller.webhook("upgate", req, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("подделка — 400 и ничего не сохраняется", async () => {
    const { controller, provider, events } = setup();
    provider.parseWebhook.mockRejectedValue(new WebhookRejectedError("bad signature"));
    await expect(controller.webhook("upgate", req, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(events.enqueue).not.toHaveBeenCalled();
  });

  it("внутренний сбой — 503, чтобы провайдер повторил", async () => {
    const { controller, events } = setup();
    events.enqueue.mockRejectedValue(new Error("db down"));
    await expect(controller.webhook("upgate", req, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
