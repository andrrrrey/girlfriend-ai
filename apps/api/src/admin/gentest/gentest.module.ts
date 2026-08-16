/**
 * @file gentest.module.ts
 * @description Модуль тестового перебора генераций (админка).
 * Переиспользует GenerationService (постановка image-job + статус).
 */

import { Module } from "@nestjs/common";
import { GentestController } from "./gentest.controller";
import { GentestService } from "./gentest.service";
import { PrismaService } from "../../prisma.service";
import { GenerationModule } from "../../generation/generation.module";

@Module({
  imports: [GenerationModule],
  controllers: [GentestController],
  providers: [GentestService, PrismaService],
})
export class GentestModule {}
