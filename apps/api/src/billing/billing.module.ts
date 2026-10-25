/**
 * @file billing.module.ts
 * @description Глобальный модуль биллинга: кошелёк кредитов, цены, настройки.
 * WalletService доступен в любом модуле (ядро чата, генерация, auth, internal).
 */

import { Global, Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { WalletService } from "./wallet.service";
import { PricingService } from "./pricing.service";
import { BillingConfigService } from "./billing-config.service";
import { BillingController } from "./billing.controller";
import { BillingAdminController } from "./billing-admin.controller";

@Global()
@Module({
  controllers: [BillingController, BillingAdminController],
  providers: [PrismaService, WalletService, PricingService, BillingConfigService],
  exports: [WalletService, PricingService, BillingConfigService],
})
export class BillingModule {}
