/**
 * @file pricing.service.ts
 * @description Действующая таблица цен (последняя версия PriceTable) и расчёт стоимости.
 *
 * Пока в БД нет ни одной версии, действуют DEFAULT_PRICES (version 0).
 * Изменение цен создаёт новую версию — старые остаются для аудита: в резерве
 * хранится priceVersion, по которой посчитана операция.
 */

import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { BillableOperation, DEFAULT_PRICES, PriceItems, normalizePrices, quote } from "./pricing";

const CACHE_TTL_MS = 30_000;

/** Действующие цены с номером версии. */
export interface ActivePrices {
  version: number;
  items: PriceItems;
  effectiveFrom: Date | null;
}

@Injectable()
export class PricingService {
  private cache: { at: number; prices: ActivePrices } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Действующая таблица цен. */
  async getActive(): Promise<ActivePrices> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.prices;
    const row = await this.prisma.priceTable.findFirst({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { version: "desc" },
    });
    const prices: ActivePrices = row
      ? { version: row.version, items: normalizePrices(row.items), effectiveFrom: row.effectiveFrom }
      : { version: 0, items: DEFAULT_PRICES, effectiveFrom: null };
    this.cache = { at: Date.now(), prices };
    return prices;
  }

  /** Стоимость операции и версия цен, по которой она посчитана. */
  async quote(op: BillableOperation): Promise<{ amount: number; priceVersion: number }> {
    const prices = await this.getActive();
    return { amount: quote(prices.items, op), priceVersion: prices.version };
  }

  /** История версий цен (новые первыми). */
  async listVersions(limit = 20) {
    return this.prisma.priceTable.findMany({ orderBy: { version: "desc" }, take: limit });
  }

  /**
   * Сохраняет новую версию цен (действует сразу).
   *
   * @param items     — цены (нормализуются: недостающие поля берутся по умолчанию)
   * @param adminId   — кто изменил
   */
  async setPrices(items: unknown, adminId: string): Promise<ActivePrices> {
    const normalized = normalizePrices(items);
    const last = await this.prisma.priceTable.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
    const row = await this.prisma.priceTable.create({
      data: {
        version: (last?.version ?? 0) + 1,
        items: normalized as unknown as Prisma.InputJsonValue,
        createdBy: adminId,
      },
    });
    this.cache = null;
    return { version: row.version, items: normalized, effectiveFrom: row.effectiveFrom };
  }
}
