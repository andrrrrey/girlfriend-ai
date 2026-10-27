/**
 * @file telegram-updates.service.ts
 * @description Очередь входящих обновлений Telegram.
 *
 * - accept(): webhook (или polling) записывает обновление в telegram_updates —
 *   уникальность (botId, update_id) защищает от повторной доставки Telegram'ом;
 *   webhook сразу отвечает 200, обработка идёт асинхронно.
 * - dispatchBatch(): забирает созревшие обновления (FOR UPDATE SKIP LOCKED — одно
 *   обновление обрабатывает один инстанс), передаёт TelegramHandlerService,
 *   при ошибке — повтор с задержкой. Занятый диалог (CHAT_BUSY) — тоже повтор.
 * - Polling-режим (TELEGRAM_POLLING=true): getUpdates для всех активных ботов.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { SchedulerService } from "../common/scheduler.service";
import { TelegramBotsService, isPollingMode } from "./telegram-bots.service";
import { TelegramHandlerService, RetryLaterError } from "./telegram-handler.service";
import type { TgUpdate } from "./telegram-api";

const POLL_INTERVAL_MS = 2_000;
const TG_POLLING_INTERVAL_MS = 3_000;
const BATCH_SIZE = 20;
const CLAIM_TIMEOUT_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const RETENTION_DAYS = 7;

interface ClaimedUpdate {
  id: string;
  botId: string;
  payload: TgUpdate;
  attempts: number;
}

@Injectable()
export class TelegramUpdatesService implements OnModuleInit {
  private readonly logger = new Logger(TelegramUpdatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
    private readonly bots: TelegramBotsService,
    private readonly handler: TelegramHandlerService,
  ) {}

  onModuleInit(): void {
    // Не exclusive: параллельную обработку разруливает SKIP LOCKED.
    this.scheduler.scheduleInterval("telegram-updates", POLL_INTERVAL_MS, async () => {
      await this.dispatchBatch();
    }, false);
    this.scheduler.scheduleDaily("telegram-updates-retention", 4, () => this.purgeProcessed());
    if (isPollingMode()) {
      this.scheduler.scheduleInterval("telegram-polling", TG_POLLING_INTERVAL_MS, () => this.pollAll());
      this.logger.log("Telegram polling mode enabled (TELEGRAM_POLLING=true)");
    }
  }

  /**
   * Принимает обновление (из webhook или polling).
   * @returns false — такое обновление уже было (повтор Telegram'а)
   */
  async accept(botId: string, update: TgUpdate): Promise<boolean> {
    if (typeof update?.update_id !== "number") return false;
    const res = await this.prisma.telegramUpdate.createMany({
      data: [{ botId, updateId: BigInt(update.update_id), payload: update as unknown as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    if (res.count > 0) {
      // Не ждём: webhook отвечает Telegram'у сразу.
      void this.dispatchBatch().catch((err) => this.logger.warn(`dispatch failed: ${err?.message}`));
    }
    return res.count > 0;
  }

  /** Забирает и обрабатывает пачку обновлений. */
  async dispatchBatch(): Promise<number> {
    const now = new Date();
    const claimUntil = new Date(now.getTime() + CLAIM_TIMEOUT_MS);
    const updates = await this.prisma.$queryRaw<ClaimedUpdate[]>`
      UPDATE "telegram_updates"
      SET "status" = 'processing', "attempts" = "attempts" + 1, "available_at" = ${claimUntil}
      WHERE "id" IN (
        SELECT "id" FROM "telegram_updates"
        WHERE "status" IN ('pending', 'processing') AND "available_at" <= ${now}
        ORDER BY "update_id"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "bot_id" AS "botId", "payload", "attempts"`;

    for (const update of updates) {
      await this.process(update);
    }
    return updates.length;
  }

  private async process(update: ClaimedUpdate): Promise<void> {
    try {
      await this.handler.handle(update.botId, update.payload);
      await this.prisma.telegramUpdate.update({
        where: { id: update.id },
        data: { status: "done", processedAt: new Date(), lastError: null },
      });
    } catch (err: any) {
      const retryLater = err instanceof RetryLaterError;
      const exhausted = !retryLater && update.attempts >= MAX_ATTEMPTS;
      const delayMs = retryLater ? err.delayMs : Math.min(60_000, 2_000 * 2 ** (update.attempts - 1));
      if (!retryLater) this.logger.warn(`telegram update ${update.id} attempt ${update.attempts} failed: ${err?.message}`);
      await this.prisma.telegramUpdate.update({
        where: { id: update.id },
        data: {
          status: exhausted ? "failed" : "pending",
          lastError: String(err?.message ?? err).slice(0, 1000),
          availableAt: new Date(Date.now() + delayMs),
          // Ожидание занятого диалога не тратит попытки.
          ...(retryLater ? { attempts: { decrement: 1 } } : {}),
        },
      });
    }
  }

  /** Polling: забирает новые обновления всех активных ботов (локальная разработка). */
  private async pollAll(): Promise<void> {
    const bots = await this.prisma.telegramBot.findMany({
      where: { deletedAt: null, status: { in: ["active", "error"] } },
      select: { id: true, tokenEnc: true },
    });
    for (const bot of bots) {
      try {
        const last = await this.prisma.telegramUpdate.findFirst({
          where: { botId: bot.id },
          orderBy: { updateId: "desc" },
          select: { updateId: true },
        });
        const offset = last ? Number(last.updateId) + 1 : undefined;
        const updates = await this.bots.apiFor(bot).getUpdates(offset, 0);
        for (const update of updates) await this.accept(bot.id, update);
      } catch (err: any) {
        this.logger.warn(`polling bot ${bot.id} failed: ${err?.message}`);
      }
    }
  }

  /** Удаляет обработанные обновления старше RETENTION_DAYS. */
  private async purgeProcessed(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
    await this.prisma.telegramUpdate.deleteMany({ where: { status: { in: ["done", "failed"] }, createdAt: { lt: cutoff } } });
  }
}
