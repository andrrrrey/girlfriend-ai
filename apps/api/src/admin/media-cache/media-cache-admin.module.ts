/**
 * @file media-cache-admin.module.ts
 * @description Админ-API общего кэша медиа (сервис — в GenerationModule).
 */

import { Module } from "@nestjs/common";
import { GenerationModule } from "../../generation/generation.module";
import { MediaCacheAdminController } from "./media-cache-admin.controller";

@Module({
  imports: [GenerationModule],
  controllers: [MediaCacheAdminController],
})
export class MediaCacheAdminModule {}
