import { createHash } from "node:crypto";
import { WebhookRejectedError } from "../payment-provider";
import { CoinGateProvider, orderToEvents } from "./coingate.provider";

const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "callback-token";
const tokenHash = createHash("sha256").update(TOKEN).digest("hex");

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

const callback = (extra: Record<string, unknown> = {}) =>
  ({ rawBody: Buffer.from(JSON.stringify({ id: 42, order_id: PAYMENT_ID, status: "paid", token: TOKEN, ...extra })), headers: {} });

const paidOrder = { id: 42, status: "paid", price_amount: "10.0", price_currency: "USD", underpaid_amount: "0" };

describe("CoinGateProvider", () => {
  let fetchMock: jest.Mock;
  let payment: any;
  let provider: CoinGateProvider;
  let config: any;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    payment = { id: PAYMENT_ID, provider: "coingate", amountMinor: 1050, currency: "USD", externalId: "42", callbackTokenHash: tokenHash };
    config = { mode: "sandbox", secrets: { COINGATE_API_TOKEN: "api-token" }, settings: {} };
    const prisma: any = {
      payment: { findFirst: jest.fn(async ({ where }: any) => (where.id === payment.id && where.provider === "coingate" ? payment : null)) },
    };
    provider = new CoinGateProvider(prisma, { load: async () => config } as any);
  });

  describe("createCheckout", () => {
    const input = () => ({
      payment,
      customer: { userId: "u", email: "a@b.c", lang: "en" },
      returnUrl: "https://site.test/return",
      webhookUrl: "https://site.test/webhook",
    });

    it("создаёт заказ и хранит только хеш токена", async () => {
      fetchMock.mockResolvedValue(json({ id: 42, payment_url: "https://pay.test/42" }));
      const result = await provider.createCheckout(input());

      const [url, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(url).toBe("https://api-sandbox.coingate.com/v2/orders");
      expect(init.headers.Authorization).toBe("Token api-token");
      expect(body).toMatchObject({
        order_id: PAYMENT_ID,
        price_amount: "10.50",
        price_currency: "USD",
        callback_url: "https://site.test/webhook",
        success_url: "https://site.test/return",
        cancel_url: "https://site.test/return",
      });
      expect(body.receive_currency).toBeUndefined();
      expect(result).toEqual({
        externalId: "42",
        redirectUrl: "https://pay.test/42",
        callbackTokenHash: createHash("sha256").update(body.token).digest("hex"),
      });
      expect(body.token).toHaveLength(64);
    });

    it("в режиме live использует боевой адрес и валюту зачисления", async () => {
      config.mode = "live";
      config.settings.COINGATE_RECEIVE_CURRENCY = "USDT";
      fetchMock.mockResolvedValue(json({ id: 42, payment_url: "https://pay.test/42" }));
      await provider.createCheckout(input());
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.coingate.com/v2/orders");
      expect(JSON.parse(init.body).receive_currency).toBe("USDT");
    });

    it("ошибка API не раскрывает токен", async () => {
      fetchMock.mockResolvedValue(json({ reason: "OrderIsNotValid" }, 422));
      const err: Error = await provider.createCheckout(input()).catch((e) => e);
      expect(err.message).toContain("OrderIsNotValid");
      expect(err.message).not.toContain("api-token");
    });

    it("без ключа заказ не создаётся", async () => {
      config.secrets = {};
      await expect(provider.createCheckout(input())).rejects.toThrow("not configured");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("parseWebhook", () => {
    it("берёт оплату из API, а не из тела callback", async () => {
      fetchMock.mockResolvedValue(json(paidOrder));
      const events = await provider.parseWebhook(callback({ price_amount: "0.01", price_currency: "EUR" }));
      expect(fetchMock.mock.calls[0][0]).toBe("https://api-sandbox.coingate.com/v2/orders/42");
      expect(events).toEqual([
        expect.objectContaining({ kind: "paid", amountMinor: 1000, currency: "USD", paymentId: PAYMENT_ID, externalTransactionId: "42:paid" }),
      ]);
    });

    it("промежуточный статус не обращается к API", async () => {
      const events = await provider.parseWebhook(callback({ status: "confirming" }));
      expect(fetchMock).not.toHaveBeenCalled();
      expect(events).toEqual([expect.objectContaining({ kind: "pending", eventKey: "42:pending" })]);
    });

    it.each([
      ["неверный токен", { token: "forged" }],
      ["чужой id заказа", { id: 43 }],
      ["нет токена", { token: undefined }],
      ["id платежа не UUID", { order_id: "../../etc" }],
      ["неизвестный платёж", { order_id: "22222222-2222-4222-8222-222222222222" }],
    ])("отклоняет: %s", async (_name, extra) => {
      await expect(provider.parseWebhook(callback(extra))).rejects.toBeInstanceOf(WebhookRejectedError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("отклоняет тело не в JSON", async () => {
      await expect(provider.parseWebhook({ rawBody: Buffer.from("id=42&status=paid"), headers: {} })).rejects.toBeInstanceOf(WebhookRejectedError);
    });

    it("платёж с ещё не сохранённым токеном повторяется, а не отклоняется", async () => {
      payment.callbackTokenHash = null;
      const err = await provider.parseWebhook(callback()).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(WebhookRejectedError);
    });

    it("если API ещё не подтвердил статус, callback повторится", async () => {
      fetchMock.mockResolvedValue(json({ id: 42, status: "confirming" }));
      const err = await provider.parseWebhook(callback()).catch((e) => e);
      expect(err).not.toBeInstanceOf(WebhookRejectedError);
      expect(err.message).toContain("confirming");
    });

    it("сбой API приводит к повтору", async () => {
      fetchMock.mockResolvedValue(json({}, 500));
      const err = await provider.parseWebhook(callback()).catch((e) => e);
      expect(err).not.toBeInstanceOf(WebhookRejectedError);
    });
  });

  describe("testConnection", () => {
    it("ответ не в JSON считается успехом", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error("not json"); } });
      await expect(provider.testConnection()).resolves.toBeUndefined();
      expect(fetchMock.mock.calls[0][0]).toBe("https://api-sandbox.coingate.com/v2/auth/test");
    });

    it("неверный ключ приводит к ошибке", async () => {
      fetchMock.mockResolvedValue(json({ reason: "BadCredentials" }, 401));
      await expect(provider.testConnection()).rejects.toThrow("401");
    });
  });

  describe("fetchState", () => {
    it("возвращает состояние заказа", async () => {
      fetchMock.mockResolvedValue(json(paidOrder));
      await expect(provider.fetchState(payment)).resolves.toEqual([expect.objectContaining({ kind: "paid" })]);
    });

    it("без внешнего id ничего не запрашивает", async () => {
      await expect(provider.fetchState({ ...payment, externalId: null })).resolves.toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

describe("orderToEvents", () => {
  const kinds = (order: any) => orderToEvents(order, PAYMENT_ID).map((event) => event.kind);

  it.each([
    ["new", []],
    ["pending", ["pending"]],
    ["confirming", ["pending"]],
    ["invalid", ["failed"]],
    ["expired", ["expired"]],
    ["canceled", ["canceled"]],
    ["unknown", []],
  ])("статус %s", (status, expected) => {
    expect(kinds({ id: 42, status })).toEqual(expected);
  });

  it("недоплата идёт на проверку", () => {
    const [event] = orderToEvents({ ...paidOrder, underpaid_amount: "0.003" }, PAYMENT_ID);
    expect(event.reviewReason).toContain("0.003");
  });

  it("неразбираемая цена не даёт суммы, и товар не выдаётся", () => {
    expect(orderToEvents({ ...paidOrder, price_amount: "abc" }, PAYMENT_ID)[0].amountMinor).toBeUndefined();
  });

  it("у частичного возврата каждая завершённая часть — отдельное событие", () => {
    const events = orderToEvents(
      {
        ...paidOrder,
        status: "partially_refunded",
        refunds: [
          { id: 1, status: "completed", request_amount: "2.5" },
          { id: 2, status: "completed", request_amount: "1.0" },
          { id: 3, status: "pending", request_amount: "1.0" },
          { id: 4, status: "rejected", request_amount: "1.0" },
        ],
      },
      PAYMENT_ID,
    );
    expect(events.map((event) => [event.kind, event.externalTransactionId, event.amountMinor])).toEqual([
      ["paid", "42:paid", 1000],
      ["refund", "refund:1", 250],
      ["refund", "refund:2", 100],
    ]);
  });

  it("возврат с неверной суммой не превращается в полный", () => {
    const events = orderToEvents(
      { ...paidOrder, status: "partially_refunded", refunds: [{ id: 1, status: "completed", request_amount: "abc" }] },
      PAYMENT_ID,
    );
    expect(events[1]).toMatchObject({ kind: "fraud_alert" });
    expect(events[1].externalTransactionId).toBeUndefined();
  });

  it("полный возврат добавляет событие на весь остаток", () => {
    const events = orderToEvents({ ...paidOrder, status: "refunded", refunds: [] }, PAYMENT_ID);
    expect(events.map((event) => event.kind)).toEqual(["paid", "refund"]);
    expect(events[1].amountMinor).toBeUndefined();
  });
});
