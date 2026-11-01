/**
 * @file payment-provider.ts
 * @description Контракт платёжного провайдера и нормализованные события.
 *
 * Адаптер переводит API провайдера в эти типы, а вся логика начислений и
 * возвратов живёт в FulfillmentService и от провайдера не зависит.
 */

import type { Payment, SiteSubscription } from "@prisma/client";

export const PAYMENT_PROVIDER_IDS = ["coingate", "upgate"] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];

/** DI-токен списка адаптеров. */
export const PAYMENT_PROVIDERS = Symbol("PAYMENT_PROVIDERS");

export interface CheckoutInput {
  payment: Payment;
  customer: { userId: string; email: string; lang: string };
  /** Куда вернуть покупателя: страница опрашивает статус, query-параметрам не доверяет. */
  returnUrl: string;
  webhookUrl: string;
}

export interface CheckoutResult {
  externalId: string;
  redirectUrl: string;
  /** Хеш секрета для проверки webhook этого платежа (CoinGate). */
  callbackTokenHash?: string;
}

export interface RawWebhook {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export type PaymentEventKind =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "canceled"
  | "renewal"
  | "refund"
  | "chargeback"
  | "chargeback_reversal"
  | "fraud_alert"
  | "subscription_update";

/** Событие в едином формате. Сохраняется в очередь как JSON. */
export interface NormalizedEvent {
  /** Ключ идемпотентности доставки */
  eventKey: string;
  kind: PaymentEventKind;
  /** Наш id платежа, если провайдер его вернул */
  paymentId?: string;
  externalPaymentId?: string;
  /** Ключ идемпотентности денежного события; обязателен для денежных событий */
  externalTransactionId?: string;
  /** Внешний id транзакции, которую отменяет это событие */
  relatedExternalTransactionId?: string;
  amountMinor?: number;
  currency?: string;
  externalSubscriptionId?: string;
  subscription?: { autoRenew?: boolean; version?: number };
  /** Адаптер считает событие спорным: деньги не выдаём, платёж идёт на проверку */
  reviewReason?: string;
}

export interface RefundInput {
  externalTransactionId: string;
  /** Без суммы — полный возврат */
  amountMinor?: number;
  currency: string;
  reason: string;
  initiatedBy: string;
}

export interface PaymentProvider {
  id: PaymentProviderId;
  /** Без этих секретов провайдер считается выключенным. */
  requiredSecrets: readonly string[];
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Проверяет подлинность; при подделке бросает WebhookRejectedError. */
  parseWebhook(webhook: RawWebhook): Promise<NormalizedEvent[]>;
  /** Текущее состояние платежа у провайдера (сверка). */
  fetchState(payment: Payment): Promise<NormalizedEvent[]>;
  /** Состояние подписки и её транзакции у провайдера: догоняет потерянные продления. */
  fetchSubscription?(subscription: SiteSubscription): Promise<NormalizedEvent[]>;
  cancelSubscription?(subscription: SiteSubscription): Promise<void>;
  /** Проверка ключа из админки; при неверном ключе бросает ошибку. */
  testConnection(): Promise<void>;
  /** Запрашивает возврат; результат придёт отдельным событием. У CoinGate возвраты в кабинете. */
  refund?(input: RefundInput): Promise<void>;
}

/**
 * Webhook не прошёл проверку. Контроллер отвечает 400: CoinGate навсегда
 * отключает callback заказа после 401 и 403.
 */
export class WebhookRejectedError extends Error {}
