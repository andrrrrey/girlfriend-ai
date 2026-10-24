/**
 * @file outbox.service.ts
 * @description Outbox гарантированной доставки: постановка событий и реестр подписчиков.
 *
 * Событие пишется в таблицу outbox_events в ТОЙ ЖЕ транзакции, что и изменение
 * данных (например, сохранение сообщения), поэтому не теряется при падении
 * процесса. Доставку выполняет OutboxDispatcher.
 *
 * Подписчики регистрируются в onModuleInit своих модулей:
 *   outbox.registerHandler("message.created", (e) => telegram.deliver(e.payload))
 */

import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

/** Событие, извлечённое диспетчером для доставки. */
export interface OutboxEventRecord {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  /** Номер текущей попытки (1 — первая). */
  attempts: number;
}

/** Обработчик события; исключение — сигнал повторить доставку позже. */
export type OutboxHandler = (event: OutboxEventRecord) => Promise<void>;

/** Клиент Prisma: обычный или транзакционный. */
type OutboxDb = Pick<Prisma.TransactionClient, "outboxEvent">;

/** Типы событий outbox. */
export const OUTBOX_EVENTS = {
  /** Сохранено новое сообщение в чате. payload: { messageId, chatSessionId, role, type, source } */
  MESSAGE_CREATED: "message.created",
} as const;

@Injectable()
export class OutboxService {
  private readonly handlers = new Map<string, OutboxHandler[]>();

  /**
   * Ставит событие в outbox.
   *
   * @param db        — транзакционный клиент (tx) — чтобы событие записалось атомарно с данными
   * @param type      — тип события (см. OUTBOX_EVENTS)
   * @param payload   — данные события (JSON)
   * @param dedupeKey — ключ дедупликации: повторная постановка с тем же ключом игнорируется
   */
  async enqueue(
    db: OutboxDb,
    type: string,
    payload: Record<string, unknown>,
    dedupeKey?: string,
  ): Promise<void> {
    // createMany + skipDuplicates = ON CONFLICT DO NOTHING: дубль dedupeKey не
    // обрывает внешнюю транзакцию (в отличие от create с уникальным нарушением).
    await db.outboxEvent.createMany({
      data: [{ type, payload: payload as Prisma.InputJsonValue, dedupeKey, availableAt: new Date() }],
      skipDuplicates: true,
    });
  }

  /** Регистрирует подписчика на тип события. */
  registerHandler(type: string, handler: OutboxHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  /** Подписчики типа события (пустой массив — событие просто помечается доставленным). */
  getHandlers(type: string): OutboxHandler[] {
    return this.handlers.get(type) ?? [];
  }
}
