/**
 * @file billing.controller.ts
 * @description Кошелёк текущего пользователя.
 *
 *   GET /billing/wallet  — баланс: { balance, reserved, available, enforced }
 *   GET /billing/ledger  — журнал операций (cursor-пагинация)
 *   GET /billing/prices  — действующие цены (для отображения стоимости в интерфейсе)
 */

import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WalletService } from "./wallet.service";
import { PricingService } from "./pricing.service";

@ApiTags("billing")
@ApiBearerAuth()
@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private readonly wallet: WalletService,
    private readonly pricing: PricingService,
  ) {}

  @ApiOperation({ summary: "Current user's credit balance" })
  @Get("wallet")
  async getWallet(@Req() req: any) {
    return this.wallet.getSummary(req.user.id);
  }

  @ApiOperation({ summary: "Current user's credit ledger (newest first)" })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({ name: "limit", required: false })
  @Get("ledger")
  async getLedger(@Req() req: any, @Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.wallet.listLedger(req.user.id, cursor, limit ? parseInt(limit, 10) || undefined : undefined);
  }

  @ApiOperation({ summary: "Active credit prices" })
  @Get("prices")
  async getPrices() {
    const { version, items } = await this.pricing.getActive();
    return { version, items };
  }
}
