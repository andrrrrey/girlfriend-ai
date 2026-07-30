/**
 * @file analytics.module.ts
 * @description Глобальный модуль серверной аналитики (PostHog).
 *
 * Помечен @Global, поэтому AnalyticsService можно инжектить в любой модуль
 * без повторного импорта AnalyticsModule (по образцу QueueModule).
 * Регистрируется один раз в AppModule.
 */

import { Global, Module } from "@nestjs/common";
import { AnalyticsService } from "./analytics.service";

@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
