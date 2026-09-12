/**
 * @file engagement-gen.module.ts
 * @description Модуль фоновой автогенерации контента для персонажей (админка,
 * раздел «Вовлечённость»).
 *
 * Переиспользует:
 * - GenerationService (GenerationModule) — постановка image/video-job в очередь + статус
 */

import { Module } from "@nestjs/common";
import { EngagementGenController } from "./engagement-gen.controller";
import { EngagementGenService } from "./engagement-gen.service";
import { PrismaService } from "../../prisma.service";
import { GenerationModule } from "../../generation/generation.module";

@Module({
  imports: [GenerationModule],
  controllers: [EngagementGenController],
  providers: [EngagementGenService, PrismaService],
})
export class EngagementGenModule {}
