/**
 * @file wallet.service.ts
 * @description Кошелёк кредитов: резерв перед AI-операцией, списание по факту,
 * возврат при ошибке, начисления админом, журнал и сверка.
 *
 * Жизненный цикл резерва (CreditReservation):
 *   reserve → held ──capture──→ captured ──refund──→ refunded
 *                  └─release──→ released ──capture (поздний успех)──→ captured
 *
 * Гарантии:
 * - Резерв атомарен: UPDATE … WHERE balance - reserved >= amount (при включённом
 *   BILLING_ENFORCED), без гонок между параллельными запросами.
 * - Идемпотентность: каждая операция имеет operationKey; повтор не меняет баланс
 *   (уникальные ключи резерва и записей журнала).
 * - Каждое изменение баланса/резерва пишется в журнал (LedgerEntry); сверка
 *   проверяет, что сумма журнала совпадает с кошельком.
 */

import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { SchedulerService } from "../common/scheduler.service";
import { BillingConfigService } from "./billing-config.service";
import { PricingService } from "./pricing.service";
import type { BillableOperation } from "./pricing";
import { currentBillingContext } from "./billing-context";

/** TTL резерва: после него незавершённый резерв возвращается автоматически. */
const RESERVATION_TTL_MS: Record<string, number> = {
  image: 2 * 60 * 60_000,
  video: 3 * 60 * 60_000,
  default: 15 * 60_000,
};
const EXPIRED_SWEEP_INTERVAL_MS = 5 * 60_000;

/** Клиент Prisma: обычный или транзакционный. */
type Db = Prisma.TransactionClient;

/**
 * Ключ резерва задания генерации: по нему воркер (через internal API) списывает
 * или возвращает кредиты, зная только id AiJob.
 */
export function generationReservationKey(aiJobId: string): string {
  return `gen:${aiJobId}`;
}

/** Недостаточно кредитов для операции (HTTP 402). */
export class InsufficientCreditsException extends HttpException {
  constructor(required: number, available: number) {
    super(
      {
        error: "INSUFFICIENT_CREDITS",
        required,
        available,
        message: `Недостаточно кредитов: нужно ${required}, доступно ${available}.`,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/** Взятый резерв. */
export interface ReservationHandle {
  operationKey: string;
  amount: number;
  priceVersion?: number;
}

/** Параметры резерва. */
export interface ReserveParams {
  userId: string;
  operationKey: string;
  /** Имя операции: chat_message | stt | tts | image | video … */
  operation: string;
  amount: number;
  aiJobId?: string;
  priceVersion?: number;
  ttlMs?: number;
}

/** Параметры начисления/корректировки баланса. */
export interface CreditParams {
  userId: string;
  /** Положительное — начисление, отрицательное — списание (корректировка). */
  amount: number;
  type: "bonus" | "topup" | "adjust";
  operationKey: string;
  reason?: string;
  actorUserId?: string;
}

/** Строка резерва из SELECT … FOR UPDATE. */
interface ReservationRow {
  id: string;
  walletId: string;
  amount: number;
  capturedAmount: number | null;
  status: string;
  aiJobId: string | null;
  actorUserId: string | null;
  endUserId: string | null;
}

/** Нарушение уникальности Prisma (идемпотентный повтор). */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

@Injectable()
export class WalletService implements OnModuleInit {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: BillingConfigService,
    private readonly pricing: PricingService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.scheduleInterval("billing-release-expired", EXPIRED_SWEEP_INTERVAL_MS, () =>
      this.releaseExpired().then(() => undefined),
    );
  }

  // ─── Кошелёк ────────────────────────────────────────────────────────────────

  /**
   * Возвращает кошелёк пользователя, создавая его при первом обращении
   * (со стартовым бонусом). Так кошелёк получают и новые, и существующие пользователи.
   */
  async ensureWallet(userId: string) {
    const existing = await this.prisma.wallet.findUnique({ where: { ownerUserId: userId } });
    if (existing) return existing;

    try {
      await this.prisma.wallet.create({ data: { ownerUserId: userId } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err; // параллельный запрос уже создал
    }

    const bonus = await this.config.welcomeBonus();
    if (bonus > 0) {
      await this.applyCredit({
        userId,
        amount: bonus,
        type: "bonus",
        operationKey: `bonus:welcome:${userId}`,
        reason: "Стартовый бонус",
      });
    }
    return this.prisma.wallet.findUniqueOrThrow({ where: { ownerUserId: userId } });
  }

  /** Баланс для интерфейса. */
  async getSummary(userId: string) {
    const wallet = await this.ensureWallet(userId);
    return {
      balance: wallet.balance,
      reserved: wallet.reserved,
      available: wallet.balance - wallet.reserved,
      enforced: await this.config.isEnforced(),
    };
  }

  /** Журнал операций пользователя (новые первыми, cursor-пагинация по id). */
  async listLedger(userId: string, cursor?: string, limit = 50) {
    const wallet = await this.ensureWallet(userId);
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        balanceDelta: true,
        reservedDelta: true,
        balanceAfter: true,
        reservedAfter: true,
        reason: true,
        aiJobId: true,
        actorUserId: true,
        reservationKey: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
  }

  // ─── Резервы ────────────────────────────────────────────────────────────────

  /**
   * Резервирует кредиты под операцию по действующим ценам.
   *
   * @returns резерв или null, если операция бесплатна (цена 0)
   * @throws InsufficientCreditsException — если BILLING_ENFORCED и не хватает баланса
   */
  async reserveOperation(
    userId: string,
    op: BillableOperation,
    operationKey: string,
    aiJobId?: string,
  ): Promise<ReservationHandle | null> {
    const { amount, priceVersion } = await this.pricing.quote(op);
    return this.reserve({ userId, operationKey, operation: op.kind, amount, priceVersion, aiJobId });
  }

  /**
   * Резервирует сумму. Повтор с тем же operationKey возвращает существующий резерв.
   *
   * @returns резерв или null при amount <= 0
   * @throws InsufficientCreditsException
   */
  async reserve(params: ReserveParams): Promise<ReservationHandle | null> {
    const amount = Math.round(params.amount);
    if (!(amount > 0)) return null;

    await this.ensureWallet(params.userId);
    const enforced = await this.config.isEnforced();
    // Бот для клиентов: неприкосновенный остаток владельца и атрибуция (billing-context.ts).
    const ctx = currentBillingContext();
    const keep = Math.max(0, Math.round(ctx?.keepBalance ?? 0));
    const ttlMs = params.ttlMs ?? RESERVATION_TTL_MS[params.operation] ?? RESERVATION_TTL_MS.default;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.creditReservation.findUnique({ where: { operationKey: params.operationKey } });
        if (existing) return { operationKey: existing.operationKey, amount: existing.amount, priceVersion: existing.priceVersion ?? undefined };

        const now = new Date();
        const rows = await tx.$queryRaw<{ id: string; balance: number; reserved: number }[]>`
          UPDATE "wallets"
          SET "reserved" = "reserved" + ${amount}, "version" = "version" + 1, "updated_at" = ${now}
          WHERE "owner_user_id" = ${params.userId}::uuid
            AND (${!enforced} OR "balance" - "reserved" - ${keep} >= ${amount})
          RETURNING "id", "balance", "reserved"`;

        if (rows.length === 0) {
          const wallet = await tx.wallet.findUniqueOrThrow({ where: { ownerUserId: params.userId } });
          throw new InsufficientCreditsException(amount, Math.max(0, wallet.balance - wallet.reserved - keep));
        }
        const wallet = rows[0];

        await tx.creditReservation.create({
          data: {
            walletId: wallet.id,
            operationKey: params.operationKey,
            operation: params.operation,
            amount,
            aiJobId: params.aiJobId,
            priceVersion: params.priceVersion,
            expiresAt: new Date(now.getTime() + ttlMs),
            actorUserId: ctx?.actorUserId,
            endUserId: ctx?.endUserId,
          },
        });
        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            type: "reserve",
            reservedDelta: amount,
            balanceAfter: wallet.balance,
            reservedAfter: wallet.reserved,
            operationKey: `reserve:${params.operationKey}`,
            reservationKey: params.operationKey,
            aiJobId: params.aiJobId,
            actorUserId: ctx?.actorUserId,
            endUserId: ctx?.endUserId,
            meta: { operation: params.operation, priceVersion: params.priceVersion ?? null },
          },
        });
        return { operationKey: params.operationKey, amount, priceVersion: params.priceVersion };
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Параллельный запрос с тем же ключом успел первым — отдаём его резерв.
      const existing = await this.prisma.creditReservation.findUniqueOrThrow({
        where: { operationKey: params.operationKey },
      });
      return { operationKey: existing.operationKey, amount: existing.amount, priceVersion: existing.priceVersion ?? undefined };
    }
  }

  /** Привязывает резерв к AiJob (если резерв взят до создания задания). */
  async attachJob(operationKey: string, aiJobId: string): Promise<void> {
    await this.prisma.creditReservation.updateMany({ where: { operationKey }, data: { aiJobId } });
  }

  /**
   * Списывает резерв по факту. Идемпотентно: уже списанный резерв не трогается.
   * Если резерв успели вернуть (ошибка, истечение), а операция всё же завершилась
   * успешно — сумма списывается без резерва (баланс может уйти в минус).
   *
   * @param actualAmount — фактическая стоимость (по умолчанию = сумме резерва)
   * @param tx           — транзакция, если списание — часть внешней транзакции
   * @returns true, если списание выполнено этим вызовом
   */
  async capture(operationKey: string, actualAmount?: number, tx?: Db): Promise<boolean> {
    return this.withTx(tx, async (db) => {
      const res = await this.lockReservation(db, operationKey);
      if (!res || res.status === "captured" || res.status === "refunded") return false;

      const amount = Math.max(0, Math.round(actualAmount ?? res.amount));
      const reservedRelease = res.status === "held" ? res.amount : 0;
      const wallet = await this.applyWalletDelta(db, res.walletId, -amount, -reservedRelease);

      await db.creditReservation.update({
        where: { id: res.id },
        data: { status: "captured", capturedAmount: amount, settledAt: new Date() },
      });
      await db.ledgerEntry.create({
        data: {
          walletId: res.walletId,
          type: "capture",
          balanceDelta: -amount,
          reservedDelta: -reservedRelease,
          balanceAfter: wallet.balance,
          reservedAfter: wallet.reserved,
          operationKey: `capture:${operationKey}`,
          reservationKey: operationKey,
          aiJobId: res.aiJobId,
          actorUserId: res.actorUserId,
          endUserId: res.endUserId,
          meta: res.status === "released" ? { lateCapture: true } : undefined,
        },
      });
      return true;
    });
  }

  /**
   * Возвращает удержанный резерв (операция не состоялась). Идемпотентно.
   * @returns true, если резерв возвращён этим вызовом
   */
  async release(operationKey: string, reason: string, tx?: Db): Promise<boolean> {
    return this.withTx(tx, async (db) => {
      const res = await this.lockReservation(db, operationKey);
      if (!res || res.status !== "held") return false;

      const wallet = await this.applyWalletDelta(db, res.walletId, 0, -res.amount);
      await db.creditReservation.update({
        where: { id: res.id },
        data: { status: "released", settledAt: new Date() },
      });
      await db.ledgerEntry.create({
        data: {
          walletId: res.walletId,
          type: "release",
          reservedDelta: -res.amount,
          balanceAfter: wallet.balance,
          reservedAfter: wallet.reserved,
          operationKey: `release:${operationKey}`,
          reservationKey: operationKey,
          aiJobId: res.aiJobId,
          actorUserId: res.actorUserId,
          endUserId: res.endUserId,
          reason,
        },
      });
      return true;
    });
  }

  /**
   * Компенсация: возвращает списанные кредиты (жалоба на результат, ошибка провайдера
   * после списания). Идемпотентно.
   */
  async refund(operationKey: string, reason: string, actorUserId?: string): Promise<boolean> {
    return this.withTx(undefined, async (db) => {
      const res = await this.lockReservation(db, operationKey);
      if (!res || res.status !== "captured") return false;

      const amount = res.capturedAmount ?? res.amount;
      const wallet = await this.applyWalletDelta(db, res.walletId, amount, 0);
      await db.creditReservation.update({ where: { id: res.id }, data: { status: "refunded" } });
      await db.ledgerEntry.create({
        data: {
          walletId: res.walletId,
          type: "refund",
          balanceDelta: amount,
          balanceAfter: wallet.balance,
          reservedAfter: wallet.reserved,
          operationKey: `refund:${operationKey}`,
          reservationKey: operationKey,
          aiJobId: res.aiJobId,
          actorUserId: actorUserId ?? res.actorUserId,
          endUserId: res.endUserId,
          reason,
        },
      });
      return true;
    });
  }

  /** Возвращает резервы с истёкшим сроком (операция зависла). */
  async releaseExpired(limit = 200): Promise<number> {
    const expired = await this.prisma.creditReservation.findMany({
      where: { status: "held", expiresAt: { lt: new Date() } },
      select: { operationKey: true },
      take: limit,
    });
    let released = 0;
    for (const { operationKey } of expired) {
      if (await this.release(operationKey, "expired").catch(() => false)) released++;
    }
    if (released) this.logger.log(`released ${released} expired credit reservations`);
    return released;
  }

  // ─── Начисления ─────────────────────────────────────────────────────────────

  /**
   * Начисление или корректировка баланса (админ, бонус). Идемпотентно по operationKey.
   * @returns запись журнала (новая или уже существующая)
   */
  async credit(params: CreditParams) {
    await this.ensureWallet(params.userId);
    return this.applyCredit(params);
  }

  /** Начисление без ensureWallet (используется внутри ensureWallet). */
  private async applyCredit(params: CreditParams) {
    const amount = Math.round(params.amount);
    try {
      return await this.prisma.$transaction(async (db) => {
        const existing = await db.ledgerEntry.findUnique({ where: { operationKey: params.operationKey } });
        if (existing) return existing;

        const wallet = await db.wallet.findUniqueOrThrow({ where: { ownerUserId: params.userId } });
        const after = await this.applyWalletDelta(db, wallet.id, amount, 0);
        return db.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            type: params.type,
            balanceDelta: amount,
            balanceAfter: after.balance,
            reservedAfter: after.reserved,
            operationKey: params.operationKey,
            actorUserId: params.actorUserId,
            reason: params.reason,
          },
        });
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return this.prisma.ledgerEntry.findUniqueOrThrow({ where: { operationKey: params.operationKey } });
    }
  }

  // ─── Сверка ─────────────────────────────────────────────────────────────────

  /**
   * Сверка: для каждого кошелька сумма журнала должна совпадать с балансом,
   * сумма резервов в журнале — с reserved и с суммой удержанных резервов.
   * @returns число проверенных кошельков и список расхождений
   */
  async reconcile() {
    const rows = await this.prisma.$queryRaw<
      {
        walletId: string;
        ownerUserId: string;
        balance: number;
        reserved: number;
        ledgerBalance: bigint;
        ledgerReserved: bigint;
        heldReserved: bigint;
      }[]
    >`
      SELECT w."id" AS "walletId", w."owner_user_id" AS "ownerUserId", w."balance", w."reserved",
             COALESCE(l."balance_sum", 0) AS "ledgerBalance",
             COALESCE(l."reserved_sum", 0) AS "ledgerReserved",
             COALESCE(r."held_sum", 0) AS "heldReserved"
      FROM "wallets" w
      LEFT JOIN (
        SELECT "wallet_id", SUM("balance_delta") AS "balance_sum", SUM("reserved_delta") AS "reserved_sum"
        FROM "ledger_entries" GROUP BY "wallet_id"
      ) l ON l."wallet_id" = w."id"
      LEFT JOIN (
        SELECT "wallet_id", SUM("amount") AS "held_sum"
        FROM "credit_reservations" WHERE "status" = 'held' GROUP BY "wallet_id"
      ) r ON r."wallet_id" = w."id"`;

    const mismatches = rows
      .map((r) => ({
        walletId: r.walletId,
        ownerUserId: r.ownerUserId,
        balance: r.balance,
        reserved: r.reserved,
        ledgerBalance: Number(r.ledgerBalance),
        ledgerReserved: Number(r.ledgerReserved),
        heldReserved: Number(r.heldReserved),
      }))
      .filter((r) => r.balance !== r.ledgerBalance || r.reserved !== r.ledgerReserved || r.reserved !== r.heldReserved);

    return { checked: rows.length, mismatches };
  }

  // ─── Внутреннее ─────────────────────────────────────────────────────────────

  private withTx<T>(tx: Db | undefined, fn: (db: Db) => Promise<T>): Promise<T> {
    return tx ? fn(tx) : this.prisma.$transaction(fn);
  }

  /** Блокирует строку резерва до конца транзакции (защита от параллельного capture/release). */
  private async lockReservation(db: Db, operationKey: string): Promise<ReservationRow | null> {
    const rows = await db.$queryRaw<ReservationRow[]>`
      SELECT "id", "wallet_id" AS "walletId", "amount", "captured_amount" AS "capturedAmount",
             "status", "ai_job_id" AS "aiJobId",
             "actor_user_id" AS "actorUserId", "end_user_id" AS "endUserId"
      FROM "credit_reservations"
      WHERE "operation_key" = ${operationKey}
      FOR UPDATE`;
    return rows[0] ?? null;
  }

  /** Атомарно меняет баланс и резерв кошелька; возвращает значения после изменения. */
  private async applyWalletDelta(db: Db, walletId: string, balanceDelta: number, reservedDelta: number) {
    const rows = await db.$queryRaw<{ balance: number; reserved: number }[]>`
      UPDATE "wallets"
      SET "balance" = "balance" + ${balanceDelta},
          "reserved" = "reserved" + ${reservedDelta},
          "version" = "version" + 1,
          "updated_at" = ${new Date()}
      WHERE "id" = ${walletId}::uuid
      RETURNING "balance", "reserved"`;
    if (!rows[0]) throw new Error(`Wallet ${walletId} not found`);
    return rows[0];
  }
}
