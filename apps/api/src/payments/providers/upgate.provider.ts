/**
 * @file upgate.provider.ts
 * @description Адаптер UpGate: карты и APM через hosted checkout, автопродление Premium.
 *
 * В кабинете UpGate нужно указать webhook URL и включить постбэки SUBSCRIPTION:
 * только из них мы узнаём id подписки, по которому находятся продления.
 *
 * Особенности API:
 * - Продление приходит с новым payment_id и без merchant_payment_id; связь с
 *   исходным платежом — через initial_subscription_id.
 * - Чарджбэк и его отмена в примерах документации имеют один transaction_id,
 *   поэтому в ключах транзакций есть её тип.
 * - version не описан и в примерах всегда равен 1, поэтому порядок по нему не определяем.
 */

import { Injectable } from "@nestjs/common";
import type { Payment, SiteSubscription } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
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
  live: "https://api.upgate.com/v1",
  sandbox: "https://api.sandbox.upgate.com/v1",
};

const REQUEST_TIMEOUT_MS = 10_000;
/** Сессия checkout живёт 15 минут: транзакции платежа ищем в этом окне с запасом. */
const STATE_WINDOW_MS = 2 * 60 * 60_000;
const STATE_PAGE_SIZE = 100;
const STATE_MAX_PAGES = 5;
/** Окно продления шире и за него транзакций всего мерчанта больше. */
const RENEWAL_MAX_PAGES = 20;
const RENEWAL_LOOKBACK_MS = 3 * 24 * 60 * 60_000;
/** Транзакции ищем только у подписок, которым пора продлеваться. */
const RENEWAL_DUE_MS = 2 * 24 * 60 * 60_000;
const LANGUAGES: Record<string, string> = { en: "en-us", ru: "ru-ru" };

interface UpGatePayment {
  payment_id?: string;
  payment_type?: string;
  merchant_payment_id?: string;
  initial_subscription_id?: string;
  amount?: string;
  currency_code?: string;
  transaction_amount?: string;
  transaction_currency_code?: string;
}

interface UpGateTransaction {
  transaction_id?: string;
  /** Опечатка в примере продления в документации; принимаем на случай, если она есть и в API */
  transaction_i?: string;
  transaction_type?: string;
  transaction_status?: string;
  transaction_details?: { reference_transaction_id?: string };
  payment?: UpGatePayment;
}

interface UpGateSubscription {
  subscription_id?: string;
  subscription_status?: string;
  payment_id?: string;
  merchant_payment_id?: string;
  expires_at?: string;
  is_rebill_enabled?: boolean;
  retry_count?: number;
  version?: number;
}

interface CheckoutResponse {
  id?: string;
  session?: { redirect_url?: string };
}

/** Какой суммой описан возврат; null — по постбэку это определить нельзя. */
function refundAmount(payment: UpGatePayment): { amountMinor?: number; currency?: string } | null {
  const paid = toMinor(payment.amount ?? "");
  const refunded = toMinor(payment.transaction_amount ?? "");
  // transaction_amount может быть в другой валюте (в примерах GBP при цене в USD).
  if (paid === null || refunded === null || payment.transaction_currency_code !== payment.currency_code) return null;
  // Больше цены бывает из-за комиссий и налогов сверху: это полный возврат.
  return refunded >= paid ? {} : { amountMinor: refunded, currency: payment.currency_code };
}

function transactionToEvents(tx: UpGateTransaction): NormalizedEvent[] {
  const id = tx.transaction_id ?? tx.transaction_i;
  const type = tx.transaction_type;
  const status = tx.transaction_status;
  if (!id || !type || !status) throw new WebhookRejectedError("transaction postback without id, type or status");

  const payment = tx.payment ?? {};
  const base = {
    paymentId: payment.merchant_payment_id,
    externalPaymentId: payment.payment_id,
    externalSubscriptionId: payment.initial_subscription_id,
  };
  const eventKey = `${type}:${id}:${status}`;
  const externalTransactionId = `${type}:${id}`;
  const reference = tx.transaction_details?.reference_transaction_id;
  const related = reference ? { relatedExternalTransactionId: `SALE:${reference}` } : {};
  const review = (reviewReason: string): NormalizedEvent[] => [{ ...base, eventKey, kind: "fraud_alert", reviewReason }];

  if (type === "SALE") {
    const rebill =
      payment.payment_type === "RECURRING_REBILL" || Boolean(payment.initial_subscription_id && !payment.merchant_payment_id);
    if (status === "SUCCESS") {
      return [
        {
          ...base,
          eventKey,
          kind: rebill ? "renewal" : "paid",
          externalTransactionId,
          amountMinor: toMinor(payment.amount ?? "") ?? undefined,
          currency: payment.currency_code,
        },
      ];
    }
    // Неудачное продление UpGate повторит сам; срок просто не продлевается.
    if (rebill) return [];
    return [{ ...base, eventKey, kind: status === "PENDING" ? "pending" : "failed" }];
  }

  if (status !== "SUCCESS") return [];

  switch (type) {
    case "REFUND":
    case "VOID": {
      const amount = refundAmount(payment);
      if (!amount) return review(`Возврат ${id}: сумма неизвестна, кредиты и Premium обработать вручную`);
      return [{ ...base, ...related, ...amount, eventKey, kind: "refund", externalTransactionId }];
    }
    case "RDR":
      return [{ ...base, ...related, eventKey, kind: "refund", externalTransactionId }];
    case "RDR_REVERSAL":
      return review(`Отмена RDR ${id}: вернуть кредиты и Premium вручную`);
    case "CHARGEBACK":
      return [{ ...base, ...related, eventKey, kind: "chargeback", externalTransactionId }];
    case "CHARGEBACK_REVERSAL":
      // reference указывает на продажу, а FulfillmentService ищет отменяемый чарджбэк сам.
      return [{ ...base, eventKey, kind: "chargeback_reversal", externalTransactionId }];
    case "FRAUD_ALERT":
      return review(`Fraud alert ${id}: проверить платёж и возможный возврат`);
    default:
      return [];
  }
}

function subscriptionToEvents(sub: UpGateSubscription): NormalizedEvent[] {
  if (!sub.subscription_id) throw new WebhookRejectedError("subscription postback without id");
  const autoRenew = sub.is_rebill_enabled === true && (sub.subscription_status ?? "ACTIVE") === "ACTIVE";
  return [
    {
      // version одинаков у разных состояний, поэтому ключ строится из самого состояния.
      eventKey: `SUBSCRIPTION:${sub.subscription_id}:${sub.version}:${sub.is_rebill_enabled}:${sub.expires_at}:${sub.retry_count}`,
      kind: "subscription_update",
      paymentId: sub.merchant_payment_id,
      externalPaymentId: sub.payment_id,
      externalSubscriptionId: sub.subscription_id,
      subscription: { autoRenew },
    },
  ];
}

/** Разбирает постбэк в события. Экспортирована для тестов. */
export function postbackToEvents(body: { type?: string; data?: unknown }): NormalizedEvent[] {
  if (body?.type === "TRANSACTION") return transactionToEvents((body.data ?? {}) as UpGateTransaction);
  if (body?.type === "SUBSCRIPTION") return subscriptionToEvents((body.data ?? {}) as UpGateSubscription);
  return [];
}

function headerValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

@Injectable()
export class UpGateProvider implements PaymentProvider {
  readonly id = "upgate" as const;
  readonly requiredSecrets = ["UPGATE_API_KEY", "UPGATE_WEBHOOK_SECRETS"];

  constructor(private readonly configs: ProviderConfigService) {}

  async createCheckout({ payment, customer, returnUrl }: CheckoutInput): Promise<CheckoutResult> {
    const price = fromMinor(payment.amountMinor);
    const premium = payment.productKind === "premium";
    if (premium && !payment.periodDays) throw new Error(`payment ${payment.id}: premium without period`);
    const language = LANGUAGES[customer.lang];

    const response = await this.request<CheckoutResponse>(
      "POST",
      "/checkout",
      {
        payment_data: {
          merchant_payment_id: payment.id,
          type: premium ? "RECURRING" : "SALE",
          // Подписки UpGate поддерживают только карты.
          ...(premium ? { methods: ["CARD"] } : {}),
          amount: Number(price),
          currency_code: payment.currency,
        },
        customer: {
          merchant_customer_id: customer.userId,
          email: customer.email,
          ...(language ? { language } : {}),
        },
        callback: { success_url: returnUrl, failure_url: returnUrl, back_url: returnUrl },
        products: [
          {
            ...(payment.productId ? { merchant_product_id: payment.productId } : {}),
            type: premium ? "SUBSCRIPTION" : "SALE",
            price,
            // Нейтральные описания: их видит покупатель в форме оплаты.
            name: "Digital services",
            description: `Order ${payment.id}`,
            ...(premium ? { charge: { value: payment.periodDays, interval: "DAY" } } : {}),
          },
        ],
      },
      { "X-Idempotency-Key": payment.id },
    );
    if (!response.id || !response.session?.redirect_url) throw new Error("UpGate returned a checkout without id or redirect_url");
    return { externalId: response.id, redirectUrl: response.session.redirect_url };
  }

  async parseWebhook({ rawBody, headers }: RawWebhook): Promise<NormalizedEvent[]> {
    await this.verifySignature(rawBody, headers);
    let body: { type?: string; data?: unknown };
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new WebhookRejectedError("body is not JSON");
    }
    return postbackToEvents(body);
  }

  /**
   * HMAC-SHA256 от "<timestamp>.<body>". Заголовки в спецификации необязательны,
   * но без подписи постбэк не принимаем. Окно по времени не проверяем: документация
   * его не задаёт, а от повторов защищает уникальность события.
   */
  private async verifySignature(rawBody: Buffer, headers: RawWebhook["headers"]): Promise<void> {
    const signature = headerValue(headers["x-signature"]);
    const timestamp = headerValue(headers["x-signature-timestamp"]);
    if (!signature || !timestamp) throw new WebhookRejectedError("missing signature headers");

    const { secrets } = await this.configs.load(this.id);
    // Несколько значений через запятую: старый и новый секрет на время ротации.
    const candidates = (secrets.UPGATE_WEBHOOK_SECRETS ?? "").split(",").map((secret) => secret.trim()).filter(Boolean);
    const actual = Buffer.from(signature, "base64");
    const valid = candidates.some((secret) => {
      const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest();
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    });
    if (!valid) throw new WebhookRejectedError("invalid signature");
  }

  /** Транзакции платежа за окно checkout. */
  async fetchState(payment: Payment): Promise<NormalizedEvent[]> {
    const transactions = await this.listTransactions(
      payment.createdAt,
      new Date(payment.createdAt.getTime() + STATE_WINDOW_MS),
      STATE_MAX_PAGES,
    );
    return transactions.filter((tx) => tx.payment?.merchant_payment_id === payment.id).flatMap(transactionToEvents);
  }

  /** Постбэков всего 6: подписку и продления сверяем с API. */
  async fetchSubscription(subscription: SiteSubscription): Promise<NormalizedEvent[]> {
    const externalId = subscription.externalSubscriptionId;
    if (!externalId) return [];
    const response = await this.request<{ data?: unknown }>("GET", `/subscription/${encodeURIComponent(externalId)}`);
    const events = postbackToEvents({ type: "SUBSCRIPTION", data: response.data });

    const now = Date.now();
    if (subscription.expiresAt.getTime() > now + RENEWAL_DUE_MS) return events;
    const transactions = await this.listTransactions(
      new Date(subscription.expiresAt.getTime() - RENEWAL_LOOKBACK_MS),
      new Date(now),
      RENEWAL_MAX_PAGES,
    );
    const own = transactions.filter(
      ({ payment }) =>
        payment?.initial_subscription_id === externalId || payment?.merchant_payment_id === subscription.originPaymentId,
    );
    return [...events, ...own.flatMap(transactionToEvents)];
  }

  /** Транзакции за период: фильтра по платежу в API нет, только по датам. */
  private async listTransactions(from: Date, to: Date, maxPages: number): Promise<UpGateTransaction[]> {
    const transactions: UpGateTransaction[] = [];
    let prevId: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const query = new URLSearchParams({
        created_at_from: from.toISOString(),
        created_at_to: to.toISOString(),
        limit: String(STATE_PAGE_SIZE),
        ...(prevId ? { prev_id: prevId } : {}),
      });
      const list = await this.request<{ data?: UpGateTransaction[]; meta?: { next_prev_id?: string } }>(
        "GET",
        `/transaction?${query}`,
      );
      transactions.push(...(list.data ?? []));
      prevId = list.meta?.next_prev_id;
      if (!prevId) break;
    }
    return transactions;
  }

  async cancelSubscription(subscription: SiteSubscription): Promise<void> {
    if (!subscription.externalSubscriptionId) return;
    await this.request("PATCH", `/subscription/${encodeURIComponent(subscription.externalSubscriptionId)}`, {
      is_rebill_enabled: false,
    });
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const { mode, secrets } = await this.configs.load(this.id);
    const apiKey = secrets.UPGATE_API_KEY;
    if (!apiKey) throw new Error("UpGate API key is not configured");
    const res = await fetch(`${API_BASE[mode]}${path}`, {
      method,
      headers: {
        "X-Api-Key": apiKey,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`UpGate ${method} ${path.split("?")[0]}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
