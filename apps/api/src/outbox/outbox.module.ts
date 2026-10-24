/**
 * @file outbox.module.ts
 * @description Глобальный модуль outbox: OutboxService (постановка событий, реестр
 * подписчиков) и OutboxDispatcher (фоновая доставка). Зависит от RedisModule
 * (SchedulerService).
 */

import { Global, Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { OutboxService } from "./outbox.service";
import { OutboxDispatcher } from "./outbox.dispatcher";

@Global()
@Module({
  providers: [PrismaService, OutboxService, OutboxDispatcher],
  exports: [OutboxService],
})
export class OutboxModule {}
