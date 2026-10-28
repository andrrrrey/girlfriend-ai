/**
 * @file proactive-admin.module.ts
 * @description Админ-API инициативных сообщений (сервис — в ChatsModule).
 */

import { Module } from "@nestjs/common";
import { ChatsModule } from "../../chats/chats.module";
import { ProactiveAdminController } from "./proactive-admin.controller";

@Module({
  imports: [ChatsModule],
  controllers: [ProactiveAdminController],
})
export class ProactiveAdminModule {}
