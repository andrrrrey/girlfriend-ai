/**
 * @file fulfillment.service.ts
 * @description Единый state machine платежей: выдача, продление, возврат, чарджбэк.
 *
 * Статус платежа, журнал транзакций, баланс и Premium меняются в одной транзакции
 * под блокировкой строки платежа. Уникальный внешний id транзакции не даёт
 * начислить дважды. События могут приходить в любом порядке: если нужных данных
 * ещё нет, бросается PaymentEventNotReadyError и очередь повторит событие.
 */

import { Injectable } from "@nestjs/common";
import { Prisma, type Payment, type PaymentTransaction } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { WalletService } from "../billing/wallet.service";
import { PaymentRegistryService } from "./payment-registry.service";
import type { NormalizedEvent, PaymentProviderId } from "./payment-provider";

type Db = Prisma.TransactionClient;

const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Из каких статусов возможен неденежный переход. */
const OPEN_STATUSES = ["created", "pending", "failed", "expired", "canceled"];
const PURCHASE_TYPES = ["sale", "rebill"];

/** Событие пришло раньше данных, от которых зависит (например, возврат раньше оплаты). */
export class PaymentEventNotReadyError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly registry: PaymentRegistryService,
  ) {}

  /** Применяет событие. Повтор безопасен. */
  async apply(provider: PaymentProviderId, event: NormalizedEvent): Promise<void> {
    const found = await this.findPayment(provider, event);
    if (!found) throw new PaymentEventNotReadyError(`payment not found for event ${event.eventKey}`);
    // Кошелёк создаём заранее: он начисляет стартовый бонус в своих транзакциях.
    if (found.userId) await this.wallet.ensureWallet(found.userId);

    try {
      await this.prisma.$transaction(async (db) => {
        await db.$queryRaw`SELECT "id" FROM "payments" WHERE "id" = ${found.id}::uuid FOR UPDATE`;
        const payment = await db.payment.findUniqueOrThrow({ where: { id: found.id } });
        await this.applyLocked(db, provider, payment, event);
      });
    } catch (err) {
      // Параллельная обработка той же транзакции уже всё применила.
      if (!isUniqueViolation(err)) throw err;
    }

    if (found.userId) await this.flushProviderCancel(found.userId);
  }

  private async findPayment(provider: PaymentProviderId, event: NormalizedEvent): Promise<Payment | null> {
    if (event.paymentId && UUID.test(event.paymentId)) {
      const byId = await this.prisma.payment.findFirst({ where: { id: event.paymentId, provider } });
      if (byId) return byId;
    }
    if (event.externalPaymentId) {
      const byExternal = await this.prisma.payment.findUnique({
        where: { provider_externalId: { provider, externalId: event.externalPaymentId } },
      });
      if (byExternal) return byExternal;
    }
    if (event.externalSubscriptionId) {
      const sub = await this.prisma.siteSubscription.findUnique({
        where: { provider_externalSubscriptionId: { provider, externalSubscriptionId: event.externalSubscriptionId } },
      });
      if (sub) return this.prisma.payment.findUnique({ where: { id: sub.originPaymentId } });
    }
    return null;
  }

  private async applyLocked(db: Db, provider: PaymentProviderId, payment: Payment, event: NormalizedEvent) {
    if (event.externalTransactionId) {
      const applied = await db.paymentTransaction.findUnique({
        where: {
          provider_externalTransactionId: { provider, externalTransactionId: event.externalTransactionId },
        },
      });
      if (applied) return;
    }

    switch (event.kind) {
      case "pending":
        await db.payment.updateMany({ where: { id: payment.id, status: "created" }, data: { status: "pending" } });
        return;
      case "failed":
      case "expired":
      case "canceled":
        await db.payment.updateMany({
          where: { id: payment.id, status: { in: OPEN_STATUSES } },
          data: { status: event.kind },
        });
        return;
      case "paid":
        return this.onPaid(db, provider, payment, event);
      case "renewal":
        return this.onRenewal(db, provider, payment, event);
      case "refund":
        return this.onRefund(db, provider, payment, event);
      case "chargeback":
        return this.onChargeback(db, provider, payment, event);
      case "chargeback_reversal":
        return this.onChargebackReversal(db, provider, payment, event);
      case "fraud_alert":
        return this.flag(db, payment.id, event.reviewReason ?? "Fraud alert от провайдера");
      case "subscription_update":
        return this.onSubscriptionUpdate(db, payment, event);
    }
  }

  // ─── Покупка и продление ────────────────────────────────────────────────────

  private async onPaid(db: Db, provider: PaymentProviderId, payment: Payment, event: NormalizedEvent) {
    if (!OPEN_STATUSES.includes(payment.status)) {
      return this.flag(db, payment.id, `Повторная оплата уже обработанного платежа (${payment.status})`);
    }
    const problem = this.purchaseProblem(payment, event);
    if (problem) return this.flag(db, payment.id, problem);

    await this.grantPurchase(db, provider, payment, event, "sale");
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "paid",
        paidAt: new Date(),
        ...(event.externalPaymentId ? { externalId: event.externalPaymentId } : {}),
      },
    });
  }

  private async onRenewal(db: Db, provider: PaymentProviderId, payment: Payment, event: NormalizedEvent) {
    const sub = payment.userId ? await db.siteSubscription.findUnique({ where: { userId: payment.userId } }) : null;
    if (!sub) throw new PaymentEventNotReadyError(`subscription not found for renewal ${event.eventKey}`);
    if (sub.status === "revoked" || sub.originPaymentId !== payment.id) {
      return this.flag(db, payment.id, "Продление по отключённой подписке: проверить и вернуть деньги");
    }
    const problem = this.purchaseProblem(payment, event);
    if (problem) return this.flag(db, payment.id, problem);
    await this.grantPurchase(db, provider, payment, event, "rebill");
  }

  /** Почему оплату нельзя выдать; null, если всё сходится. */
  private purchaseProblem(payment: Payment, event: NormalizedEvent): string | null {
    if (event.reviewReason) return event.reviewReason;
    if (!payment.userId) return "Пользователь удалён, выдавать некому";
    if (event.amountMinor !== payment.amountMinor || event.currency !== payment.currency) {
      return `Сумма не совпала: ожидалось ${payment.amountMinor} ${payment.currency}, пришло ${event.amountMinor} ${event.currency}`;
    }
    return null;
  }

  private async grantPurchase(
    db: Db,
    provider: PaymentProviderId,
    payment: Payment,
    event: NormalizedEvent,
    type: "sale" | "rebill",
  ) {
    const userId = payment.userId as string;
    const tx = await this.recordTransaction(db, provider, payment, event, {
      type,
      amountMinor: payment.amountMinor,
      creditsDelta: payment.credits,
    });
    if (payment.credits > 0) {
      await this.wallet.creditTx(db, {
        userId,
        amount: payment.credits,
        type: "topup",
        operationKey: `payment:${tx.id}:grant`,
        reason: payment.productTitle,
      });
    }
    if (payment.productKind === "premium") await this.extendPremium(db, provider, payment, event);
  }

  private async extendPremium(db: Db, provider: PaymentProviderId, payment: Payment, event: NormalizedEvent) {
    const userId = payment.userId as string;
    const existing = await db.siteSubscription.findUnique({ where: { userId } });
    const now = Date.now();
    const base = existing?.status === "active" ? Math.max(now, existing.expiresAt.getTime()) : now;
    const expiresAt = new Date(base + (payment.periodDays ?? 0) * DAY_MS);
    // Продление может прийти без данных подписки: тогда сохраняем уже известные.
    const same = existing?.originPaymentId === payment.id ? existing : null;
    const externalSubscriptionId = event.externalSubscriptionId ?? same?.externalSubscriptionId ?? null;
    const data = {
      productId: payment.productId,
      originPaymentId: payment.id,
      provider,
      status: "active",
      expiresAt,
      autoRenew: event.subscription?.autoRenew ?? same?.autoRenew ?? Boolean(externalSubscriptionId),
      externalSubscriptionId,
      providerCancelPending: false,
      lastEventVersion: event.subscription?.version ?? same?.lastEventVersion ?? null,
    };
    await db.siteSubscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    await db.user.update({ where: { id: userId }, data: { subscription: "paid" } });
  }

  /**
   * Срок Premium считаем только по оплатам: постбэк подписки и постбэк продления
   * приходят в любом порядке, и срок от провайдера мог бы продлить период дважды.
   */
  private async onSubscriptionUpdate(db: Db, payment: Payment, event: NormalizedEvent) {
    const sub = await db.siteSubscription.findFirst({ where: { originPaymentId: payment.id } });
    if (!sub) throw new PaymentEventNotReadyError(`subscription not found for update ${event.eventKey}`);
    const version = event.subscription?.version;
    const stale = version !== undefined && sub.lastEventVersion !== null && version <= sub.lastEventVersion;
    if (sub.status !== "active" || stale) return;
    await db.siteSubscription.update({
      where: { id: sub.id },
      data: {
        ...(event.externalSubscriptionId ? { externalSubscriptionId: event.externalSubscriptionId } : {}),
        ...(event.subscription?.autoRenew !== undefined ? { autoRenew: event.subscription.autoRenew } : {}),
        ...(version !== undefined ? { lastEventVersion: version } : {}),
      },
    });
  }

  // ─── Возвраты и чарджбэки ───────────────────────────────────────────────────

  private async onRefund(db: Db, provider: PaymentProviderId, payment: Payment, event: NormalizedEvent) {
    const history = await this.history(db, payment.id);
    const target = this.findPurchase(history, event);
    if (!target) throw new PaymentEventNotReadyError(`nothing to refund for event ${event.eventKey}`);

    if (event.currency && event.currency !== payment.currency) {
      return this.flag(db, payment.id, `Возврат в другой валюте (${event.currency}): обработать вручную`);
    }
    const left = this.remaining(history, target);
    const amountMinor = Math.min(event.amountMinor ?? left.amountMinor, left.amountMinor);
    const full = amountMinor >= left.amountMinor;
    const credits = full
      ? left.credits
      : Math.min(left.credits, Math.round((target.creditsDelta * amountMinor) / target.amountMinor));

    await this.reverse(db, provider, payment, event, target, "refund", amountMinor, credits);
    const refundedMinor = payment.refundedMinor + amountMinor;
    await db.payment.update({
      where: { id: payment.id },
      data: { refundedMinor, status: this.refundStatus(history, refundedMinor) },
    });

    if (!full) return this.flag(db, payment.id, "Частичный возврат: Premium и остаток кредитов проверить вручную");
    if (payment.productKind !== "premium" || !payment.userId) return;
    const latest = history.filter((tx) => PURCHASE_TYPES.includes(tx.type)).at(-1);
    if (latest?.id === target.id) {
      await this.revokePremium(db, payment.userId, false);
    } else {
      await this.flag(db, payment.id, "Возврат за прошлый период: срок Premium проверить вручную");
    }
  }

  private async onChargeback(db: Db, provider: PaymentProviderId, payment: Payment, event: NormalizedEvent) {
    const history = await this.history(db, payment.id);
    const target = this.findPurchase(history, event);
    if (!target) throw new PaymentEventNotReadyError(`nothing to charge back for event ${event.eventKey}`);

    const left = this.remaining(history, target);
    await this.reverse(db, provider, payment, event, target, "chargeback", left.amountMinor, left.credits);
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "charged_back",
        refundedMinor: payment.refundedMinor + left.amountMinor,
        needsReview: true,
        reviewReason: "Чарджбэк: покупки заблокированы до проверки",
      },
    });
    if (!payment.userId) return;
    await this.revokePremium(db, payment.userId, true);
    await db.user.update({
      where: { id: payment.userId },
      data: { paymentsBlockedAt: new Date(), paymentsBlockReason: `Чарджбэк по платежу ${payment.id}` },
    });
  }

  private async onChargebackReversal(db: Db, provider: PaymentProviderId, payment: Payment, event: NormalizedEvent) {
    const history = await this.history(db, payment.id);
    const undone = new Set(history.filter((tx) => tx.type === "chargeback_reversal").map((tx) => tx.relatedId));
    const related = event.relatedExternalTransactionId;
    const chargeback = history
      .filter((tx) => tx.type === "chargeback" && !undone.has(tx.id))
      .filter((tx) => !related || tx.externalTransactionId === related)
      .at(-1);
    if (!chargeback) throw new PaymentEventNotReadyError(`no chargeback to reverse for event ${event.eventKey}`);

    const tx = await this.recordTransaction(db, provider, payment, event, {
      type: "chargeback_reversal",
      amountMinor: chargeback.amountMinor,
      creditsDelta: -chargeback.creditsDelta,
      relatedId: chargeback.id,
    });
    if (payment.userId && chargeback.creditsDelta !== 0) {
      await this.wallet.creditTx(db, {
        userId: payment.userId,
        amount: -chargeback.creditsDelta,
        type: "adjust",
        operationKey: `payment:${tx.id}:reversal`,
        reason: "Отмена чарджбэка",
      });
    }
    const refundedMinor = payment.refundedMinor - chargeback.amountMinor;
    await db.payment.update({
      where: { id: payment.id },
      data: {
        refundedMinor,
        status: refundedMinor > 0 ? "partially_refunded" : "paid",
        needsReview: true,
        reviewReason: "Чарджбэк отменён: Premium и блокировку снимает админ",
      },
    });
  }

  private async reverse(
    db: Db,
    provider: PaymentProviderId,
    payment: Payment,
    event: NormalizedEvent,
    target: PaymentTransaction,
    type: "refund" | "chargeback",
    amountMinor: number,
    credits: number,
  ) {
    const tx = await this.recordTransaction(db, provider, payment, event, {
      type,
      amountMinor,
      creditsDelta: -credits,
      relatedId: target.id,
    });
    if (payment.userId && credits > 0) {
      // Кредиты могли быть потрачены: баланс намеренно может уйти в минус.
      await this.wallet.creditTx(db, {
        userId: payment.userId,
        amount: -credits,
        type: "adjust",
        operationKey: `payment:${tx.id}:reversal`,
        reason: type === "refund" ? "Возврат платежа" : "Чарджбэк",
      });
    }
  }

  /** Отключает Premium сразу. forced: чарджбэк снимает и Premium, выданный вручную. */
  private async revokePremium(db: Db, userId: string, forced: boolean) {
    const sub = await db.siteSubscription.findUnique({ where: { userId } });
    if (sub) {
      await db.siteSubscription.update({
        where: { id: sub.id },
        data: {
          status: "revoked",
          autoRenew: false,
          providerCancelPending: Boolean(sub.autoRenew && sub.externalSubscriptionId),
        },
      });
    }
    if (sub || forced) await db.user.update({ where: { id: userId }, data: { subscription: "free" } });
  }

  /** Отменяет автопродление у провайдера после коммита; сбой повторит очередь. */
  private async flushProviderCancel(userId: string) {
    const sub = await this.prisma.siteSubscription.findUnique({ where: { userId } });
    if (!sub?.providerCancelPending) return;
    await this.registry.get(sub.provider)?.cancelSubscription?.(sub);
    await this.prisma.siteSubscription.update({ where: { id: sub.id }, data: { providerCancelPending: false } });
  }

  // ─── Журнал транзакций ──────────────────────────────────────────────────────

  private history(db: Db, paymentId: string) {
    return db.paymentTransaction.findMany({ where: { paymentId }, orderBy: { createdAt: "asc" } });
  }

  /** Покупка, которую отменяет событие: указанная провайдером или последняя. */
  private findPurchase(history: PaymentTransaction[], event: NormalizedEvent) {
    const purchases = history.filter((tx) => PURCHASE_TYPES.includes(tx.type));
    const related = event.relatedExternalTransactionId;
    if (related) return purchases.find((tx) => tx.externalTransactionId === related);
    return purchases.at(-1);
  }

  /** Сколько денег и кредитов покупки ещё не отменено (с учётом отменённых чарджбэков). */
  private remaining(history: PaymentTransaction[], target: PaymentTransaction) {
    const undone = new Set(history.filter((tx) => tx.type === "chargeback_reversal").map((tx) => tx.relatedId));
    const reversals = history.filter((tx) => tx.relatedId === target.id && !undone.has(tx.id));
    return {
      amountMinor: Math.max(0, target.amountMinor - reversals.reduce((sum, tx) => sum + tx.amountMinor, 0)),
      credits: Math.max(0, target.creditsDelta + reversals.reduce((sum, tx) => sum + tx.creditsDelta, 0)),
    };
  }

  private refundStatus(history: PaymentTransaction[], refundedMinor: number) {
    const paid = history.filter((tx) => PURCHASE_TYPES.includes(tx.type)).reduce((sum, tx) => sum + tx.amountMinor, 0);
    return refundedMinor >= paid ? "refunded" : "partially_refunded";
  }

  private recordTransaction(
    db: Db,
    provider: PaymentProviderId,
    payment: Payment,
    event: NormalizedEvent,
    data: { type: string; amountMinor: number; creditsDelta: number; relatedId?: string },
  ) {
    if (!event.externalTransactionId) throw new Error(`event ${event.eventKey} has no transaction id`);
    return db.paymentTransaction.create({
      data: {
        paymentId: payment.id,
        provider,
        externalTransactionId: event.externalTransactionId,
        currency: payment.currency,
        ...data,
      },
    });
  }

  private async flag(db: Db, paymentId: string, reason: string) {
    await db.payment.update({ where: { id: paymentId }, data: { needsReview: true, reviewReason: reason.slice(0, 500) } });
  }
}
