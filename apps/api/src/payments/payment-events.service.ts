/**
 * @file payment-events.service.ts
 * @description Очередь событий провайдеров (по образцу telegram-updates.service.ts).
 *
 * Webhook записывает событие и сразу отвечает 200, чтобы уложиться в таймаут
 * провайдера. dispatchBatch() забирает события через FOR UPDATE SKIP LOCKED.
 * Сбой — повтор с задержкой; исчерпанное событие помечает платёж на проверку.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { SchedulerService } from "../common/scheduler.service";
import { FulfillmentService } from "./fulfillment.service";
import type { NormalizedEvent, PaymentProviderId } from "./payment-provider";

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 20;
const CLAIM_TIMEOUT_MS = 5 * 60_000;
const MAX_ATTEMPTS = 12;
const MAX_DELAY_MS = 60 * 60_000;
const RETENTION_DAYS = 30;

interface ClaimedEvent {
  id: string;
  provider: PaymentProviderId;
  payload: NormalizedEvent;
  attempts: number;
}

@Injectable()
export class PaymentEventsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
    private readonly fulfillment: FulfillmentService,
  ) {}

  onModuleInit(): void {
    // Не exclusive: параллельную обработку разруливает SKIP LOCKED.
    this.scheduler.scheduleInterval("payment-events", POLL_INTERVAL_MS, async () => {
      await this.dispatchBatch();
    }, false);
    this.scheduler.scheduleDaily("payment-events-retention", 4, () => this.purgeProcessed());
  }

  /** Сохраняет события; повторная доставка отбрасывается по (provider, event_key). */
  async enqueue(provider: PaymentProviderId, events: NormalizedEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const res = await this.prisma.paymentWebhookEvent.createMany({
      data: events.map((event) => ({
        provider,
        eventKey: event.eventKey,
        payload: event as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    if (res.count > 0) {
      void this.dispatchBatch().catch((err) => this.logger.warn(`dispatch failed: ${err?.message}`));
    }
    return res.count;
  }

  /** Забирает и обрабатывает пачку событий. */
  async dispatchBatch(): Promise<number> {
    const now = new Date();
    const claimUntil = new Date(now.getTime() + CLAIM_TIMEOUT_MS);
    const events = await this.prisma.$queryRaw<ClaimedEvent[]>`
      UPDATE "payment_webhook_events"
      SET "status" = 'processing', "attempts" = "attempts" + 1, "available_at" = ${claimUntil}
      WHERE "id" IN (
        SELECT "id" FROM "payment_webhook_events"
        WHERE "status" IN ('pending', 'processing') AND "available_at" <= ${now}
        ORDER BY "created_at"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "provider", "payload", "attempts"`;

    for (const event of events) {
      await this.process(event);
    }
    return events.length;
  }

  private async process(event: ClaimedEvent): Promise<void> {
    try {
      await this.fulfillment.apply(event.provider, event.payload);
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { status: "done", processedAt: new Date(), lastError: null },
      });
    } catch (err: any) {
      const exhausted = event.attempts >= MAX_ATTEMPTS;
      const delayMs = Math.min(MAX_DELAY_MS, 5_000 * 2 ** (event.attempts - 1));
      const message = String(err?.message ?? err).slice(0, 1000);
      this.logger[exhausted ? "error" : "warn"](`payment event ${event.id} attempt ${event.attempts} failed: ${message}`);
      await this.prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: exhausted ? "failed" : "pending",
          lastError: message,
          availableAt: new Date(Date.now() + delayMs),
        },
      });
      if (exhausted && event.payload.paymentId) await this.flagExhausted(event);
    }
  }

  private async flagExhausted(event: ClaimedEvent): Promise<void> {
    await this.prisma.payment
      .updateMany({
        where: { id: event.payload.paymentId, provider: event.provider },
        data: { needsReview: true, reviewReason: `Событие ${event.payload.kind} не обработано` },
      })
      .catch((err) => this.logger.error(`payment event ${event.id}: cannot flag payment: ${err?.message}`));
  }

  /** Удаляет обработанные события. Необработанные остаются для разбора. */
  private async purgeProcessed(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
    await this.prisma.paymentWebhookEvent.deleteMany({ where: { status: "done", createdAt: { lt: cutoff } } });
  }
}
