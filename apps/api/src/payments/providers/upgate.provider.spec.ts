import { createHmac } from "node:crypto";
import { WebhookRejectedError } from "../payment-provider";
import { UpGateProvider, postbackToEvents } from "./upgate.provider";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "signing-secret";

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

const signed = (body: string, secret = SECRET, timestamp = "1700000000") => ({
  rawBody: Buffer.from(body),
  headers: {
    "x-signature": createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("base64"),
    "x-signature-timestamp": timestamp,
  } as Record<string, string | string[] | undefined>,
});

/** Постбэк транзакции по образцу примеров документации. */
const tx = (type: string, status = "SUCCESS", payment: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  type: "TRANSACTION",
  data: {
    transaction_id: "T1",
    transaction_type: type,
    transaction_status: status,
    payment: {
      payment_id: "UP1",
      payment_type: "SALE",
      merchant_payment_id: PAYMENT_ID,
      amount: "9.99",
      currency_code: "USD",
      transaction_amount: "9.99",
      transaction_currency_code: "USD",
      ...payment,
    },
    ...extra,
  },
});

describe("UpGateProvider", () => {
  let fetchMock: jest.Mock;
  let config: any;
  let provider: UpGateProvider;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    config = { mode: "sandbox", secrets: { UPGATE_API_KEY: "api-key", UPGATE_WEBHOOK_SECRETS: SECRET }, settings: {} };
    provider = new UpGateProvider({ load: async () => config } as any);
  });

  describe("createCheckout", () => {
    const input = (payment: Record<string, unknown> = {}): any => ({
      payment: { id: PAYMENT_ID, productId: "prod-1", productKind: "credits", amountMinor: 999, currency: "USD", periodDays: null, ...payment },
      customer: { userId: "user-1", email: "a@b.c", lang: "ru" },
      returnUrl: "https://site.test/return",
      webhookUrl: "https://site.test/webhook",
    });
    const ok = () => json({ id: "UP1", session: { redirect_url: "https://hub.test/1" } });

    it("создаёт разовую оплату кредитов", async () => {
      fetchMock.mockResolvedValue(ok());
      await expect(provider.createCheckout(input())).resolves.toEqual({ externalId: "UP1", redirectUrl: "https://hub.test/1" });

      const [url, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(url).toBe("https://api.sandbox.upgate.com/v1/checkout");
      expect(init.headers["X-Api-Key"]).toBe("api-key");
      expect(init.headers["X-Idempotency-Key"]).toBe(PAYMENT_ID);
      expect(body.payment_data).toEqual({ merchant_payment_id: PAYMENT_ID, type: "SALE", amount: 9.99, currency_code: "USD" });
      expect(body.customer).toEqual({ merchant_customer_id: "user-1", email: "a@b.c", language: "ru-ru" });
      expect(body.callback).toEqual({
        success_url: "https://site.test/return",
        failure_url: "https://site.test/return",
        back_url: "https://site.test/return",
      });
      expect(body.products[0]).toMatchObject({ type: "SALE", price: "9.99", merchant_product_id: "prod-1" });
      expect(body.products[0].charge).toBeUndefined();
    });

    it("создаёт подписку для Premium", async () => {
      fetchMock.mockResolvedValue(ok());
      await provider.createCheckout(input({ productKind: "premium", periodDays: 30 }));
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.payment_data).toMatchObject({ type: "RECURRING", methods: ["CARD"] });
      expect(body.products[0]).toMatchObject({ type: "SUBSCRIPTION", charge: { value: 30, interval: "DAY" } });
    });

    it("Premium без срока не создаётся", async () => {
      await expect(provider.createCheckout(input({ productKind: "premium" }))).rejects.toThrow("without period");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("в режиме live использует боевой адрес", async () => {
      config.mode = "live";
      fetchMock.mockResolvedValue(ok());
      await provider.createCheckout(input());
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.upgate.com/v1/checkout");
    });

    it("ошибка API не раскрывает ключ", async () => {
      fetchMock.mockResolvedValue(json({}, 401));
      const err: Error = await provider.createCheckout(input()).catch((e) => e);
      expect(err.message).toContain("401");
      expect(err.message).not.toContain("api-key");
    });
  });

  describe("проверка подписи", () => {
    const body = JSON.stringify(tx("SALE"));

    it("принимает верную подпись", async () => {
      await expect(provider.parseWebhook(signed(body))).resolves.toEqual([expect.objectContaining({ kind: "paid" })]);
    });

    it("принимает оба секрета во время ротации", async () => {
      config.secrets.UPGATE_WEBHOOK_SECRETS = `old-secret, ${SECRET}`;
      await expect(provider.parseWebhook(signed(body, "old-secret"))).resolves.toHaveLength(1);
      await expect(provider.parseWebhook(signed(body, SECRET))).resolves.toHaveLength(1);
    });

    it("подпись покрывает сырые байты, а не разобранный JSON", async () => {
      const spaced = JSON.stringify(tx("SALE"), null, 2);
      await expect(provider.parseWebhook(signed(spaced))).resolves.toHaveLength(1);
    });

    it.each([
      ["неверный секрет", () => signed(body, "wrong")],
      ["изменённое тело", () => ({ ...signed(body), rawBody: Buffer.from(body.replace("9.99", "0.01")) })],
      ["другой timestamp", () => {
        const webhook = signed(body);
        webhook.headers["x-signature-timestamp"] = "1700000001";
        return webhook;
      }],
      ["нет подписи", () => ({ rawBody: Buffer.from(body), headers: {} })],
      ["нет timestamp", () => {
        const webhook = signed(body);
        delete webhook.headers["x-signature-timestamp"];
        return webhook;
      }],
      ["повторяющийся заголовок", () => {
        const webhook = signed(body);
        webhook.headers["x-signature"] = ["a", "b"];
        return webhook;
      }],
    ])("отклоняет: %s", async (_name, make) => {
      await expect(provider.parseWebhook(make())).rejects.toBeInstanceOf(WebhookRejectedError);
    });

    it("без настроенного секрета ничего не принимает", async () => {
      config.secrets.UPGATE_WEBHOOK_SECRETS = "";
      await expect(provider.parseWebhook(signed(body, ""))).rejects.toBeInstanceOf(WebhookRejectedError);
    });

    it("подписанное тело не в JSON отклоняется", async () => {
      await expect(provider.parseWebhook(signed("not-json"))).rejects.toBeInstanceOf(WebhookRejectedError);
    });
  });

  describe("cancelSubscription", () => {
    it("отключает автопродление", async () => {
      fetchMock.mockResolvedValue(json({}));
      await provider.cancelSubscription({ externalSubscriptionId: "S1" } as any);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.sandbox.upgate.com/v1/subscription/S1");
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body)).toEqual({ is_rebill_enabled: false });
    });

    it("сбой API пробрасывается, чтобы очередь повторила", async () => {
      fetchMock.mockResolvedValue(json({}, 500));
      await expect(provider.cancelSubscription({ externalSubscriptionId: "S1" } as any)).rejects.toThrow("500");
    });

    it("без id подписки ничего не делает", async () => {
      await provider.cancelSubscription({ externalSubscriptionId: null } as any);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("fetchState", () => {
    const payment: any = { id: PAYMENT_ID, createdAt: new Date("2026-01-01T00:00:00.000Z") };

    it("оставляет только транзакции этого платежа и проходит страницы", async () => {
      fetchMock
        .mockResolvedValueOnce(json({ data: [tx("SALE").data, tx("SALE", "SUCCESS", { merchant_payment_id: "other" }).data], meta: { next_prev_id: "P2" } }))
        .mockResolvedValueOnce(json({ data: [], meta: {} }));
      const events = await provider.fetchState(payment);
      expect(events).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const first = new URL(fetchMock.mock.calls[0][0]);
      expect(first.pathname).toBe("/v1/transaction");
      expect(first.searchParams.get("created_at_from")).toBe("2026-01-01T00:00:00.000Z");
      expect(first.searchParams.get("created_at_to")).toBe("2026-01-01T02:00:00.000Z");
      expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("prev_id")).toBe("P2");
    });

    it("ограничивает число страниц", async () => {
      fetchMock.mockImplementation(async () => json({ data: [], meta: { next_prev_id: "P" } }));
      await provider.fetchState(payment);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });
  });
});

describe("postbackToEvents", () => {
  it("успешная продажа — оплата с суммой в цене товара", () => {
    const body = tx("SALE", "SUCCESS", { transaction_amount: "11.99", transaction_currency_code: "GBP" });
    expect(postbackToEvents(body)).toEqual([
      {
        eventKey: "SALE:T1:SUCCESS",
        kind: "paid",
        paymentId: PAYMENT_ID,
        externalPaymentId: "UP1",
        externalSubscriptionId: undefined,
        externalTransactionId: "SALE:T1",
        amountMinor: 999,
        currency: "USD",
      },
    ]);
  });

  it.each([
    ["DECLINE", "failed"],
    ["ERROR", "failed"],
    ["PENDING", "pending"],
  ])("продажа со статусом %s — %s", (status, kind) => {
    const [event] = postbackToEvents(tx("SALE", status));
    expect(event.kind).toBe(kind);
    expect(event.externalTransactionId).toBeUndefined();
  });

  describe("продление", () => {
    const rebill = { payment_id: "UP2", merchant_payment_id: undefined, initial_subscription_id: "S1" };

    it("по типу RECURRING_REBILL", () => {
      const [event] = postbackToEvents(tx("SALE", "SUCCESS", { ...rebill, payment_type: "RECURRING_REBILL" }));
      expect(event).toMatchObject({ kind: "renewal", externalSubscriptionId: "S1", externalTransactionId: "SALE:T1" });
    });

    it("по старому формату: RECURRING с подпиской и без нашего id", () => {
      expect(postbackToEvents(tx("SALE", "SUCCESS", { ...rebill, payment_type: "RECURRING" }))[0].kind).toBe("renewal");
    });

    it("первая оплата подписки — не продление", () => {
      const body = tx("SALE", "SUCCESS", { payment_type: "RECURRING", initial_subscription_id: "S1" });
      expect(postbackToEvents(body)[0].kind).toBe("paid");
    });

    it("неудачное продление не делает платёж failed", () => {
      expect(postbackToEvents(tx("SALE", "DECLINE", { ...rebill, payment_type: "RECURRING_REBILL" }))).toEqual([]);
    });

    it("принимает transaction_i из примера документации", () => {
      const body = tx("SALE", "SUCCESS", rebill, { transaction_id: undefined, transaction_i: "T9" });
      expect(postbackToEvents(body)[0].externalTransactionId).toBe("SALE:T9");
    });
  });

  describe("возврат", () => {
    const reference = { transaction_details: { reference_transaction_id: "T0" } };

    it("полный: сумма не передаётся, FulfillmentService вернёт остаток", () => {
      const [event] = postbackToEvents(tx("REFUND", "SUCCESS", {}, reference));
      expect(event).toMatchObject({ kind: "refund", externalTransactionId: "REFUND:T1", relatedExternalTransactionId: "SALE:T0" });
      expect(event.amountMinor).toBeUndefined();
    });

    it("частичный: сумма из transaction_amount", () => {
      const [event] = postbackToEvents(tx("REFUND", "SUCCESS", { transaction_amount: "4.00" }));
      expect(event).toMatchObject({ kind: "refund", amountMinor: 400, currency: "USD" });
    });

    it("сумма больше цены из-за налога считается полным возвратом", () => {
      expect(postbackToEvents(tx("REFUND", "SUCCESS", { transaction_amount: "11.99" }))[0].amountMinor).toBeUndefined();
    });

    it.each([
      ["другая валюта", { transaction_amount: "7.87", transaction_currency_code: "GBP" }],
      ["нет суммы", { transaction_amount: undefined, transaction_currency_code: undefined }],
    ])("%s: не списывает, а идёт на проверку", (_name, payment) => {
      const [event] = postbackToEvents(tx("REFUND", "SUCCESS", payment));
      expect(event.kind).toBe("fraud_alert");
      expect(event.externalTransactionId).toBeUndefined();
    });

    it("отклонённый возврат ничего не меняет", () => {
      expect(postbackToEvents(tx("REFUND", "DECLINE"))).toEqual([]);
    });

    it("VOID обрабатывается как возврат", () => {
      expect(postbackToEvents(tx("VOID"))[0]).toMatchObject({ kind: "refund", externalTransactionId: "VOID:T1" });
    });

    it("RDR — полный возврат без суммы", () => {
      const [event] = postbackToEvents(tx("RDR", "SUCCESS", { transaction_amount: "1.00" }));
      expect(event.kind).toBe("refund");
      expect(event.amountMinor).toBeUndefined();
    });
  });

  describe("чарджбэк", () => {
    const reference = { transaction_details: { reference_transaction_id: "T0" } };

    it("ссылается на исходную продажу", () => {
      expect(postbackToEvents(tx("CHARGEBACK", "SUCCESS", {}, reference))[0]).toMatchObject({
        kind: "chargeback",
        externalTransactionId: "CHARGEBACK:T1",
        relatedExternalTransactionId: "SALE:T0",
      });
    });

    it("отмена с тем же transaction_id даёт другой ключ и не ссылается на продажу", () => {
      const chargeback = postbackToEvents(tx("CHARGEBACK", "SUCCESS", {}, reference))[0];
      const reversal = postbackToEvents(tx("CHARGEBACK_REVERSAL", "SUCCESS", {}, reference))[0];
      expect(reversal.kind).toBe("chargeback_reversal");
      expect(reversal.externalTransactionId).not.toBe(chargeback.externalTransactionId);
      expect(reversal.eventKey).not.toBe(chargeback.eventKey);
      expect(reversal.relatedExternalTransactionId).toBeUndefined();
    });
  });

  it.each(["FRAUD_ALERT", "RDR_REVERSAL"])("%s только ставит на проверку", (type) => {
    const [event] = postbackToEvents(tx(type));
    expect(event.kind).toBe("fraud_alert");
    expect(event.reviewReason).toBeTruthy();
  });

  it.each(["THREE_DS", "TOKEN", "AUTHORIZE", "PAYOUT"])("%s игнорируется", (type) => {
    expect(postbackToEvents(tx(type))).toEqual([]);
  });

  it("транзакция без id отклоняется", () => {
    expect(() => postbackToEvents(tx("SALE", "SUCCESS", {}, { transaction_id: undefined }))).toThrow(WebhookRejectedError);
  });

  describe("подписка", () => {
    const sub = (extra: Record<string, unknown> = {}) => ({
      type: "SUBSCRIPTION",
      data: {
        subscription_id: "S1",
        subscription_status: "ACTIVE",
        payment_id: "UP1",
        merchant_payment_id: PAYMENT_ID,
        expires_at: "2026-02-01T00:00:00.000Z",
        is_rebill_enabled: true,
        retry_count: 0,
        version: 1,
        ...extra,
      },
    });

    it("передаёт id подписки и автопродление, но не version и срок", () => {
      const [event] = postbackToEvents(sub());
      expect(event).toMatchObject({
        kind: "subscription_update",
        paymentId: PAYMENT_ID,
        externalSubscriptionId: "S1",
        subscription: { autoRenew: true },
      });
      expect(event.subscription).toEqual({ autoRenew: true });
    });

    it("отключение с той же version — новое событие", () => {
      const enabled = postbackToEvents(sub())[0];
      const disabled = postbackToEvents(sub({ is_rebill_enabled: false }))[0];
      expect(disabled.eventKey).not.toBe(enabled.eventKey);
      expect(disabled.subscription?.autoRenew).toBe(false);
    });

    it("продление с той же version — новое событие", () => {
      const first = postbackToEvents(sub())[0];
      const next = postbackToEvents(sub({ expires_at: "2026-03-01T00:00:00.000Z" }))[0];
      expect(next.eventKey).not.toBe(first.eventKey);
    });

    it("неактивная подписка не продлевается", () => {
      expect(postbackToEvents(sub({ subscription_status: "CANCELLED" }))[0].subscription?.autoRenew).toBe(false);
    });

    it("подписка без id отклоняется", () => {
      expect(() => postbackToEvents(sub({ subscription_id: undefined }))).toThrow(WebhookRejectedError);
    });
  });

  it("неизвестный тип постбэка игнорируется", () => {
    expect(postbackToEvents({ type: "PAYOUT" })).toEqual([]);
  });
});
