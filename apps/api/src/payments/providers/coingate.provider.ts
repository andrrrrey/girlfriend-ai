/**
 * @file coingate.provider.ts
 * @description Адаптер CoinGate: разовые крипто-платежи (рекуррентов у провайдера нет).
 *
 * Подписи у callback нет, только токен заказа. Поэтому токен лишь отсеивает чужие
 * запросы, а финальный статус берётся из GET /orders/{id}: подделанный или
 * устаревший callback не может выдать товар.
 *
 * В API App в кабинете CoinGate нужно выбрать формат callback JSON.
 * Возвраты выполняются в кабинете CoinGate; здесь обрабатывается только их результат.
 */

import { Injectable } from "@nestjs/common";
import type { Payment } from "@prisma/client";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../prisma.service";
import { fromMinor, toMinor } from "../money";
import {
  WebhookRejectedError,
  type CheckoutInput,
  type CheckoutResult,
  type NormalizedEvent,
  type PaymentProvider,
  type RawWebhook,
} from "../payment-provider";
import { ProviderConfigService, type ProviderMode } from "../provider-config.service";

const API_BASE: Record<ProviderMode, string> = {
  live: "https://api.coingate.com/v2",
  sandbox: "https://api-sandbox.coingate.com/v2",
};

/** CoinGate ждёт ответ на callback 20 секунд, а в обработчике есть запрос к API. */
const REQUEST_TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Покупатель платит: статус ещё может измениться. */
const IN_PROGRESS_STATUSES = ["new", "pending", "confirming"];

interface CoinGateRefund {
  id: number;
  status: string;
  /** В валюте цены заказа */
  request_amount?: string;
}

interface CoinGateOrder {
  id: number;
  status: string;
  order_id?: string;
  price_amount?: string;
  price_currency?: string;
  underpaid_amount?: string;
  payment_url?: string;
  refunds?: CoinGateRefund[];
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** Разбирает ответ заказа в события. Экспортирована для тестов. */
export function orderToEvents(order: CoinGateOrder, paymentId: string): NormalizedEvent[] {
  const base = { paymentId, externalPaymentId: String(order.id) };
  const key = (suffix: string) => `${order.id}:${suffix}`;
  const paid = (): NormalizedEvent => {
    const underpaid = Number(order.underpaid_amount ?? 0);
    return {
      ...base,
      eventKey: key("paid"),
      kind: "paid",
      externalTransactionId: key("paid"),
      amountMinor: order.price_amount === undefined ? undefined : toMinor(order.price_amount) ?? undefined,
      currency: order.price_currency,
      // Поведение CoinGate при недоплате не описано: деньги решает админ.
      ...(underpaid > 0 ? { reviewReason: `Недоплата CoinGate: ${order.underpaid_amount}` } : {}),
    };
  };

  switch (order.status) {
    case "pending":
    case "confirming":
      return [{ ...base, eventKey: key("pending"), kind: "pending" }];
    case "paid":
      return [paid()];
    case "invalid":
      return [{ ...base, eventKey: key("invalid"), kind: "failed" }];
    case "expired":
    case "canceled":
      return [{ ...base, eventKey: key(order.status), kind: order.status as "expired" | "canceled" }];
    case "partially_refunded":
      return [paid(), ...refundEvents(order, base)];
    case "refunded":
      // Без суммы: FulfillmentService вернёт весь остаток, сколько бы частей ни пришло до этого.
      return [
        paid(),
        ...refundEvents(order, base),
        { ...base, eventKey: key("refunded"), kind: "refund", externalTransactionId: key("refunded") },
      ];
    default:
      return [];
  }
}

function refundEvents(order: CoinGateOrder, base: { paymentId: string; externalPaymentId: string }): NormalizedEvent[] {
  return (order.refunds ?? [])
    .filter((refund) => refund.status === "completed")
    .map((refund) => {
      const amountMinor = toMinor(refund.request_amount ?? "");
      const id = `refund:${refund.id}`;
      // Событие возврата без суммы вернуло бы весь платёж.
      if (amountMinor === null) {
        return {
          ...base,
          eventKey: `${id}:review`,
          kind: "fraud_alert" as const,
          reviewReason: `Возврат CoinGate ${refund.id} с неверной суммой: обработать вручную`,
        };
      }
      return {
        ...base,
        eventKey: id,
        kind: "refund" as const,
        externalTransactionId: id,
        amountMinor,
        currency: order.price_currency,
      };
    });
}

@Injectable()
export class CoinGateProvider implements PaymentProvider {
  readonly id = "coingate" as const;
  readonly requiredSecrets = ["COINGATE_API_TOKEN"];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configs: ProviderConfigService,
  ) {}

  async createCheckout({ payment, returnUrl, webhookUrl }: CheckoutInput): Promise<CheckoutResult> {
    const { settings } = await this.configs.load(this.id);
    const token = randomBytes(32).toString("hex");
    const receiveCurrency = settings.COINGATE_RECEIVE_CURRENCY;
    const order = await this.request<CoinGateOrder>("POST", "/orders", {
      order_id: payment.id,
      price_amount: fromMinor(payment.amountMinor),
      price_currency: payment.currency,
      ...(typeof receiveCurrency === "string" && receiveCurrency ? { receive_currency: receiveCurrency } : {}),
      // Нейтральные описания: их видит покупатель и комплаенс провайдера.
      title: "Digital services",
      description: `Order ${payment.id}`,
      callback_url: webhookUrl,
      success_url: returnUrl,
      cancel_url: returnUrl,
      token,
    });
    if (!order.id || !order.payment_url) throw new Error("CoinGate returned an order without id or payment_url");
    return {
      externalId: String(order.id),
      redirectUrl: order.payment_url,
      callbackTokenHash: sha256(token).toString("hex"),
    };
  }

  async parseWebhook({ rawBody }: RawWebhook): Promise<NormalizedEvent[]> {
    let body: { id?: unknown; order_id?: unknown; status?: unknown; token?: unknown };
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new WebhookRejectedError("body is not JSON: set the callback format to JSON in the CoinGate API App");
    }
    const { id, order_id: orderId, status, token } = body ?? {};
    if (typeof orderId !== "string" || !UUID.test(orderId) || typeof token !== "string" || typeof status !== "string") {
      throw new WebhookRejectedError("missing or malformed fields");
    }

    const payment = await this.prisma.payment.findFirst({ where: { id: orderId, provider: this.id } });
    if (!payment) throw new WebhookRejectedError("unknown order");
    // Ошибка, а не отказ: заказ создан, но checkout ещё не сохранил данные. Ответ 503 вызовет повтор.
    if (!payment.callbackTokenHash || !payment.externalId) throw new Error(`payment ${payment.id} is not saved yet`);
    const expected = Buffer.from(payment.callbackTokenHash, "hex");
    if (!timingSafeEqual(sha256(token), expected) || String(id) !== payment.externalId) {
      throw new WebhookRejectedError("token or order id mismatch");
    }

    if (IN_PROGRESS_STATUSES.includes(status)) return orderToEvents({ id: Number(id), status }, payment.id);

    const order = await this.fetchOrder(payment.externalId);
    // API ещё не догнал callback: без ответа 200 CoinGate доставит его повторно.
    if (IN_PROGRESS_STATUSES.includes(order.status)) {
      throw new Error(`order ${order.id}: callback says ${status}, API says ${order.status}`);
    }
    return orderToEvents(order, payment.id);
  }

  async fetchState(payment: Payment): Promise<NormalizedEvent[]> {
    if (!payment.externalId) return [];
    return orderToEvents(await this.fetchOrder(payment.externalId), payment.id);
  }

  /** GET /auth/test отвечает не JSON, поэтому проверяем только статус. */
  async testConnection(): Promise<void> {
    await this.send("GET", "/auth/test");
  }

  private fetchOrder(externalId: string): Promise<CoinGateOrder> {
    return this.request<CoinGateOrder>("GET", `/orders/${encodeURIComponent(externalId)}`);
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    return (await (await this.send(method, path, body)).json()) as T;
  }

  private async send(method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
    const { mode, secrets } = await this.configs.load(this.id);
    const token = secrets.COINGATE_API_TOKEN;
    if (!token) throw new Error("CoinGate API token is not configured");
    const res = await fetch(`${API_BASE[mode]}${path}`, {
      method,
      headers: {
        Authorization: `Token ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const error = (await res.json().catch(() => null)) as { reason?: string } | null;
      throw new Error(`CoinGate ${method} ${path}: HTTP ${res.status} ${error?.reason ?? ""}`.trim());
    }
    return res;
  }
}
