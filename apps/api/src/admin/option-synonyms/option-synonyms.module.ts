/**
 * @file option-synonyms.module.ts
 * @description Модуль автогенерации синонимов опций генерации (админка).
 * Redis и локи — из глобального RedisModule.
 */

import { Module } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { OptionSynonymsController } from "./option-synonyms.controller";
import { OptionSynonymsService } from "./option-synonyms.service";

@Module({
  controllers: [OptionSynonymsController],
  providers: [OptionSynonymsService, PrismaService],
})
export class OptionSynonymsModule {}
