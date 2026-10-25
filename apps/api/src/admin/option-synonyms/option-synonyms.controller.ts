/**
 * @file option-synonyms.controller.ts
 * @description Автогенерация синонимов опций генерации (роль admin).
 *
 *   POST /admin/option-synonyms/generate  { overwrite?: boolean } — запустить в фоне
 *   GET  /admin/option-synonyms/status                            — прогресс
 */

import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../../auth/guards/roles.guard";
import { OptionSynonymsService } from "./option-synonyms.service";

/** Тело POST /admin/option-synonyms/generate. */
export class GenerateSynonymsDto {
  /** true — перегенерировать и для опций, у которых синонимы уже заполнены. */
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;
}

@ApiTags("admin-option-synonyms")
@ApiBearerAuth()
@Controller("admin/option-synonyms")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class OptionSynonymsController {
  constructor(private readonly synonyms: OptionSynonymsService) {}

  @ApiOperation({ summary: "Start background synonym generation for generation options" })
  @Post("generate")
  async generate(@Body() dto: GenerateSynonymsDto) {
    return this.synonyms.start(dto.overwrite === true);
  }

  @ApiOperation({ summary: "Synonym generation progress" })
  @Get("status")
  async status() {
    return this.synonyms.getStatus();
  }
}
