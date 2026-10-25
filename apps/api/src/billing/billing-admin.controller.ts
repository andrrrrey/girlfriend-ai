/**
 * @file billing-admin.controller.ts
 * @description Управление кредитами в админке (роль admin).
 *
 *   GET  /admin/users/:id/wallet   — баланс и последние операции пользователя
 *   POST /admin/users/:id/credits  — начисление (+) или корректировка (−) с причиной
 *   GET  /admin/billing/prices     — действующие цены и история версий
 *   PUT  /admin/billing/prices     — сохранить новую версию цен
 *   GET  /admin/billing/reconcile  — сверка кошельков с журналом
 *   POST /admin/billing/refund     — вернуть списание по ключу резерва
 *
 * Флаги BILLING_ENFORCED и WELCOME_BONUS_CREDITS — в общих настройках (PUT /admin/settings).
 */

import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "crypto";
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, MinLength, NotEquals } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../auth/guards/roles.guard";
import { PrismaService } from "../prisma.service";
import { WalletService } from "./wallet.service";
import { PricingService } from "./pricing.service";
import { BillingConfigService } from "./billing-config.service";

/** Тело POST /admin/users/:id/credits. */
export class AdminCreditDto {
  /** Сумма в кредитах: > 0 начисление, < 0 списание. */
  @IsInt()
  @NotEquals(0)
  amount!: number;

  /** topup — пополнение, adjust — корректировка (по умолчанию: знак суммы). */
  @IsOptional()
  @IsIn(["topup", "adjust"])
  type?: "topup" | "adjust";

  /** Причина — попадает в журнал. */
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/** Тело PUT /admin/billing/prices. */
export class AdminPricesDto {
  @IsObject()
  items!: Record<string, unknown>;
}

/** Тело POST /admin/billing/refund. */
export class AdminRefundDto {
  @IsString()
  @MinLength(1)
  operationKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

@ApiTags("admin-billing")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class BillingAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly pricing: PricingService,
    private readonly config: BillingConfigService,
  ) {}

  @ApiOperation({ summary: "User wallet and recent ledger" })
  @Get("users/:id/wallet")
  async getUserWallet(@Param("id") userId: string) {
    await this.assertUser(userId);
    const [summary, ledger] = await Promise.all([
      this.wallet.getSummary(userId),
      this.wallet.listLedger(userId, undefined, 50),
    ]);
    return { ...summary, ledger: ledger.items };
  }

  /**
   * Начисление/корректировка. Заголовок Idempotency-Key защищает от двойного
   * начисления при повторной отправке формы.
   */
  @ApiOperation({ summary: "Credit or debit a user's wallet" })
  @Post("users/:id/credits")
  async creditUser(
    @Req() req: any,
    @Param("id") userId: string,
    @Body() dto: AdminCreditDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    await this.assertUser(userId);
    const entry = await this.wallet.credit({
      userId,
      amount: dto.amount,
      type: dto.type ?? (dto.amount > 0 ? "topup" : "adjust"),
      operationKey: `admin:${idempotencyKey?.slice(0, 100) || randomUUID()}`,
      reason: dto.reason,
      actorUserId: req.user.id,
    });
    return { entry, wallet: await this.wallet.getSummary(userId) };
  }

  @ApiOperation({ summary: "Active prices, version history and billing flags" })
  @Get("billing/prices")
  async getPrices() {
    const [active, versions, enforced, welcomeBonus] = await Promise.all([
      this.pricing.getActive(),
      this.pricing.listVersions(),
      this.config.isEnforced(),
      this.config.welcomeBonus(),
    ]);
    return { active, versions, enforced, welcomeBonus };
  }

  @ApiOperation({ summary: "Save a new price table version" })
  @Put("billing/prices")
  async setPrices(@Req() req: any, @Body() dto: AdminPricesDto) {
    return this.pricing.setPrices(dto.items, req.user.id);
  }

  @ApiOperation({ summary: "Reconcile wallets against the ledger" })
  @Get("billing/reconcile")
  async reconcile() {
    return this.wallet.reconcile();
  }

  private async assertUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("User not found");
  }

  @ApiOperation({ summary: "Refund a captured charge by reservation key" })
  @Post("billing/refund")
  async refund(@Req() req: any, @Body() dto: AdminRefundDto) {
    const refunded = await this.wallet.refund(dto.operationKey, dto.reason, req.user.id);
    return { refunded };
  }
}
