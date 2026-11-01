/**
 * @file payment-reconciliation.service.ts
 * @description Сверка с провайдерами и истечение сроков.
 *
 * Webhook может потеряться (у UpGate всего 6 повторов), поэтому раз в час:
 * - незавершённые платежи сверяются через fetchState;
 * - подписки, которым пора продлеваться, сверяются через fetchSubscription;
 * - брошенные оплаты и истёкший Premium закрываются.
 * Раз в сутки сверяются все активные подписки. Результат идёт в ту же очередь, что
 * и webhook, с теми же ключами событий, поэтому уже обработанное не применится дважды.
 *
 * Порядок важен: сначала сверка, затем истечение, чтобы не снять Premium,
 * оплата которого просто не дошла.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Payment, SiteSubscription } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { SchedulerService } from "../common/scheduler.service";
import { PaymentEventsService } from "./payment-events.service";
import { PaymentRegistryService } from "./payment-registry.service";
import type { NormalizedEvent, PaymentProvider, PaymentProviderId } from "./payment-provider";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const BATCH_SIZE = 200;
const DAILY_SYNC_HOUR_UTC = 5;

/** Webhook обычно приходит сам: раньше этого срока платёж не трогаем. */
const PAYMENT_MIN_AGE_MS = 10 * 60_000;
/** Оплата, не завершённая за сутки, считается брошенной. Поздняя оплата всё равно будет выдана. */
const CHECKOUT_TTL_MS = DAY_MS;
/** Сверка идёт чуть дольше TTL, чтобы перед закрытием платёж был проверен. */
const PAYMENT_MAX_AGE_MS = CHECKOUT_TTL_MS + 2 * HOUR_MS;
/** Отказ тоже сверяем: после него покупатель мог оплатить той же сессией. */
const RECONCILED_STATUSES = ["created", "pending", "failed"];

/** Провайдер повторяет неудачное продление: пока идут попытки, доступ сохраняется. */
const RENEWAL_GRACE_MS = 3 * DAY_MS;
const RENEWAL_DUE_MS = 2 * DAY_MS;
/** Как долго после окончания срока ещё ждём продление. */
const RENEWAL_LOOKBACK_MS = 14 * DAY_MS;

@Injectable()
export class PaymentReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
    private readonly registry: PaymentRegistryService,
    private readonly events: PaymentEventsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.scheduleInterval("payment-reconcile", HOUR_MS, () => this.runHourly());
    this.scheduler.scheduleDaily("payment-reconcile-subscriptions", DAILY_SYNC_HOUR_UTC, () =>
      this.syncAllSubscriptions().then(() => undefined),
    );
  }

  async runHourly(): Promise<void> {
    await this.reconcilePayments();
    await this.syncDueSubscriptions();
    await this.expireCheckouts();
    await this.expireSubscriptions();
  }

  /** Сверяет незавершённые платежи. */
  async reconcilePayments(): Promise<number> {
    const now = Date.now();
    const payments = await this.prisma.payment.findMany({
      where: {
        status: { in: RECONCILED_STATUSES },
        externalId: { not: null },
        createdAt: { gt: new Date(now - PAYMENT_MAX_AGE_MS), lt: new Date(now - PAYMENT_MIN_AGE_MS) },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
    });
    return this.syncEach(payments, async (provider, payment: Payment) => provider.fetchState(payment));
  }

  /** Подписки с автопродлением, срок которых подходит или недавно вышел. */
  async syncDueSubscriptions(): Promise<number> {
    const now = Date.now();
    const subscriptions = await this.prisma.siteSubscription.findMany({
      where: {
        status: { in: ["active", "expired"] },
        autoRenew: true,
        externalSubscriptionId: { not: null },
        expiresAt: { gt: new Date(now - RENEWAL_LOOKBACK_MS), lt: new Date(now + RENEWAL_DUE_MS) },
      },
      orderBy: { expiresAt: "asc" },
      take: BATCH_SIZE,
    });
    return this.syncSubscriptions(subscriptions);
  }

  /** Все активные подписки: автопродление могли отключить без доставленного постбэка. */
  async syncAllSubscriptions(): Promise<number> {
    let synced = 0;
    let cursor: string | undefined;
    for (;;) {
      const page: SiteSubscription[] = await this.prisma.siteSubscription.findMany({
        where: { status: "active", externalSubscriptionId: { not: null } },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      synced += await this.syncSubscriptions(page);
      if (page.length < BATCH_SIZE) return synced;
      cursor = page[page.length - 1].id;
    }
  }

  private syncSubscriptions(subscriptions: SiteSubscription[]): Promise<number> {
    return this.syncEach(subscriptions, async (provider, subscription: SiteSubscription) =>
      provider.fetchSubscription ? provider.fetchSubscription(subscription) : [],
    );
  }

  /** Сбой одной записи или выключенный провайдер не мешают остальным. */
  private async syncEach<T extends { id: string; provider: string }>(
    items: T[],
    fetch: (provider: PaymentProvider, item: T) => Promise<NormalizedEvent[]>,
  ): Promise<number> {
    const enabled = new Map<string, boolean>();
    let synced = 0;
    for (const item of items) {
      const provider = this.registry.get(item.provider);
      if (!provider) continue;
      if (!enabled.has(provider.id)) enabled.set(provider.id, await this.registry.isEnabled(provider.id as PaymentProviderId));
      if (!enabled.get(provider.id)) continue;
      try {
        await this.events.enqueue(provider.id, await fetch(provider, item));
        synced++;
      } catch (err: any) {
        this.logger.warn(`reconcile ${provider.id} ${item.id} failed: ${err?.message}`);
      }
    }
    return synced;
  }

  /** Закрывает брошенные оплаты: провайдер не сообщает о незавершённой сессии. */
  async expireCheckouts(): Promise<number> {
    const { count } = await this.prisma.payment.updateMany({
      where: { status: { in: ["created", "pending"] }, createdAt: { lt: new Date(Date.now() - CHECKOUT_TTL_MS) } },
      data: { status: "expired" },
    });
    return count;
  }

  /**
   * Снимает истёкший Premium. Запись подписки есть только у купленного Premium,
   * поэтому выданный админом вручную не затрагивается.
   */
  async expireSubscriptions(): Promise<number> {
    const now = Date.now();
    const subscriptions = await this.prisma.siteSubscription.findMany({
      where: {
        status: "active",
        OR: [
          { autoRenew: false, expiresAt: { lt: new Date(now) } },
          { autoRenew: true, expiresAt: { lt: new Date(now - RENEWAL_GRACE_MS) } },
        ],
      },
      take: BATCH_SIZE,
    });
    let expired = 0;
    for (const subscription of subscriptions) {
      expired += await this.prisma.$transaction(async (db) => {
        // Условие на срок: продление могло успеть между выборкой и этой транзакцией.
        const { count } = await db.siteSubscription.updateMany({
          where: { id: subscription.id, status: "active", expiresAt: subscription.expiresAt },
          data: { status: "expired" },
        });
        if (count > 0) await db.user.update({ where: { id: subscription.userId }, data: { subscription: "free" } });
        return count;
      });
    }
    return expired;
  }
}
