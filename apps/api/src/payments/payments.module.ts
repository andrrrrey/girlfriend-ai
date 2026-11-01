/**
 * @file payments.module.ts
 * @description Платежи сайта. Адаптеры провайдеров подключаются в PAYMENT_PROVIDERS.
 */

import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { FulfillmentService } from "./fulfillment.service";
import { PaymentEventsService } from "./payment-events.service";
import { PAYMENT_PROVIDERS, type PaymentProvider } from "./payment-provider";
import { PaymentRegistryService } from "./payment-registry.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { ProviderConfigService } from "./provider-config.service";
import { CoinGateProvider } from "./providers/coingate.provider";
import { UpGateProvider } from "./providers/upgate.provider";

@Module({
  controllers: [PaymentsController],
  providers: [
    PrismaService,
    CoinGateProvider,
    UpGateProvider,
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (coingate: CoinGateProvider, upgate: UpGateProvider): PaymentProvider[] => [coingate, upgate],
      inject: [CoinGateProvider, UpGateProvider],
    },
    ProviderConfigService,
    PaymentRegistryService,
    FulfillmentService,
    PaymentEventsService,
    PaymentsService,
  ],
  exports: [PaymentsService, ProviderConfigService, PaymentRegistryService],
})
export class PaymentsModule {}
