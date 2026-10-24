/**
 * @file outbox.dispatcher.ts
 * @description Диспетчер outbox: забирает созревшие события и доставляет подписчикам.
 *
 * - Работает на каждом инстансе API; конкуренцию разруливает SELECT … FOR UPDATE
 *   SKIP LOCKED — одно событие забирает ровно один инстанс.
 * - Забранное событие получает статус processing и «тайм-аут видимости»
 *   (availableAt = now + CLAIM_TIMEOUT): если инстанс упал посреди доставки,
 *   событие снова станет доступным.
 * - Ошибка подписчика → повтор с экспоненциальной задержкой; после MAX_ATTEMPTS — failed.
 * - Доставленные события старше RETENTION_DAYS удаляются раз в сутки.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { SchedulerService } from "../common/scheduler.service";
import { OutboxEventRecord, OutboxService } from "./outbox.service";

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;
const CLAIM_TIMEOUT_MS = 5 * 60_000;
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 30 * 60_000;
const RETENTION_DAYS = 7;

/** Задержка перед повтором: 5с, 10с, 20с … но не более 30 минут. */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}

@Injectable()
export class OutboxDispatcher implements OnModuleInit {
  private readonly logger = new Logger(OutboxDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    // Не exclusive: безопасность параллельной работы обеспечивает SKIP LOCKED.
    this.scheduler.scheduleInterval(
      "outbox-dispatch",
      POLL_INTERVAL_MS,
      async () => {
        await this.dispatchBatch();
      },
      false,
    );
    this.scheduler.scheduleDaily("outbox-retention", 4, () => this.purgeDelivered());
  }

  /**
   * Забирает и обрабатывает одну пачку событий.
   * @returns количество обработанных событий
   */
  async dispatchBatch(): Promise<number> {
    const now = new Date();
    const claimUntil = new Date(now.getTime() + CLAIM_TIMEOUT_MS);
    const events = await this.prisma.$queryRaw<OutboxEventRecord[]>`
      UPDATE "outbox_events"
      SET "status" = 'processing', "attempts" = "attempts" + 1, "available_at" = ${claimUntil}
      WHERE "id" IN (
        SELECT "id" FROM "outbox_events"
        WHERE "status" IN ('pending', 'processing') AND "available_at" <= ${now}
        ORDER BY "available_at"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "type", "payload", "attempts"`;

    for (const event of events) {
      await this.deliver(event);
    }
    return events.length;
  }

  /** Доставляет событие всем подписчикам и фиксирует результат. */
  private async deliver(event: OutboxEventRecord): Promise<void> {
    try {
      for (const handler of this.outbox.getHandlers(event.type)) {
        await handler(event);
      }
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "done", processedAt: new Date(), lastError: null },
      });
    } catch (err: any) {
      const message = String(err?.message ?? err).slice(0, 1000);
      const exhausted = event.attempts >= MAX_ATTEMPTS;
      this.logger.warn(`outbox ${event.type} ${event.id} attempt ${event.attempts} failed: ${message}`);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: exhausted ? "failed" : "pending",
          lastError: message,
          availableAt: new Date(Date.now() + backoffMs(event.attempts)),
        },
      });
    }
  }

  /** Удаляет доставленные события старше RETENTION_DAYS. */
  async purgeDelivered(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const res = await this.prisma.outboxEvent.deleteMany({
      where: { status: "done", processedAt: { lt: cutoff } },
    });
    if (res.count) this.logger.log(`outbox retention: deleted ${res.count} delivered events`);
  }
}
