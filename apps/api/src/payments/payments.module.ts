/**
 * @file payments.module.ts
 * @description Платежи сайта. Адаптеры провайдеров подключаются в PAYMENT_PROVIDERS;
 * пока список пуст, webhook отвечает 404, а способов оплаты нет.
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

@Module({
  controllers: [PaymentsController],
  providers: [
    PrismaService,
    { provide: PAYMENT_PROVIDERS, useValue: [] as PaymentProvider[] },
    ProviderConfigService,
    PaymentRegistryService,
    FulfillmentService,
    PaymentEventsService,
    PaymentsService,
  ],
  exports: [PaymentsService, ProviderConfigService, PaymentRegistryService],
})
export class PaymentsModule {}
