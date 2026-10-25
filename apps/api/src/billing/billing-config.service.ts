/**
 * @file billing-config.service.ts
 * @description Настройки биллинга из AppSetting (редактируются в админке → Настройки):
 *
 * - BILLING_ENFORCED       — "true": без достаточного баланса AI-операция не стартует
 *                            (402 INSUFFICIENT_CREDITS). Иначе (по умолчанию) резервы и
 *                            списания ведутся, но баланс может уйти в минус.
 * - WELCOME_BONUS_CREDITS  — стартовый бонус при создании кошелька (по умолчанию 100).
 * - MEDIA_CONFIRM_ABOVE_CREDITS — медиа в чате дороже этой суммы требует подтверждения
 *                            цены (по умолчанию 10: фото — без подтверждения, видео — с ним).
 *
 * Значения кэшируются на CACHE_TTL_MS, чтобы не читать БД на каждое сообщение.
 */

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export const BILLING_SETTINGS = {
  ENFORCED: "BILLING_ENFORCED",
  WELCOME_BONUS: "WELCOME_BONUS_CREDITS",
  MEDIA_CONFIRM_ABOVE: "MEDIA_CONFIRM_ABOVE_CREDITS",
} as const;

const DEFAULT_WELCOME_BONUS = 100;
const DEFAULT_MEDIA_CONFIRM_ABOVE = 10;
const CACHE_TTL_MS = 30_000;

@Injectable()
export class BillingConfigService {
  private cache: { at: number; enforced: boolean; welcomeBonus: number; mediaConfirmAbove: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Блокировать ли операции при недостаточном балансе. */
  async isEnforced(): Promise<boolean> {
    return (await this.load()).enforced;
  }

  /** Стартовый бонус нового кошелька. */
  async welcomeBonus(): Promise<number> {
    return (await this.load()).welcomeBonus;
  }

  /** Порог цены медиа в чате, выше которого нужно подтверждение пользователя. */
  async mediaConfirmAbove(): Promise<number> {
    return (await this.load()).mediaConfirmAbove;
  }

  /** Сбросить кэш (после изменения настроек в админке). */
  invalidate(): void {
    this.cache = null;
  }

  private async load() {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache;
    const rows = await this.prisma.appSetting.findMany({
      where: { key: { in: Object.values(BILLING_SETTINGS) } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const nonNegative = (key: string, fallback: number) => {
      const raw = map.get(key);
      const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
    };
    this.cache = {
      at: Date.now(),
      enforced: (map.get(BILLING_SETTINGS.ENFORCED) || "").trim().toLowerCase() === "true",
      welcomeBonus: nonNegative(BILLING_SETTINGS.WELCOME_BONUS, DEFAULT_WELCOME_BONUS),
      mediaConfirmAbove: nonNegative(BILLING_SETTINGS.MEDIA_CONFIRM_ABOVE, DEFAULT_MEDIA_CONFIRM_ABOVE),
    };
    return this.cache;
  }
}
