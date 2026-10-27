/**
 * @file telegram.module.ts
 * @description Личные Telegram-боты: подключение, webhook/polling, обработка
 * обновлений через ядро чата и доставка ответов через outbox.
 */

import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { ChatsModule } from "../chats/chats.module";
import { S3Module } from "../s3/s3.module";
import { TelegramBotsController, TelegramWebhookController } from "./telegram.controller";
import { TelegramBotsService } from "./telegram-bots.service";
import { TelegramUpdatesService } from "./telegram-updates.service";
import { TelegramHandlerService } from "./telegram-handler.service";
import { TelegramDeliveryService } from "./telegram-delivery.service";
import { TelegramResellerService } from "./telegram-reseller.service";

@Module({
  imports: [ChatsModule, S3Module],
  controllers: [TelegramBotsController, TelegramWebhookController],
  providers: [PrismaService, TelegramBotsService, TelegramUpdatesService, TelegramHandlerService, TelegramDeliveryService, TelegramResellerService],
  exports: [TelegramBotsService],
})
export class TelegramModule {}
