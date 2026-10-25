/**
 * @file character-identity.controller.ts
 * @description Описание аватаров персонажей моделью со зрением (роль admin).
 *
 *   POST /admin/character-identity/describe — запустить в фоне для всех персонажей без avatarPrompt
 *   GET  /admin/character-identity/status   — прогресс
 */

import { Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../../auth/guards/roles.guard";
import { CharacterIdentityService } from "../../generation/prompt/character-identity.service";

@ApiTags("admin-character-identity")
@ApiBearerAuth()
@Controller("admin/character-identity")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class CharacterIdentityController {
  constructor(private readonly identity: CharacterIdentityService) {}

  @ApiOperation({ summary: "Describe avatars of characters without avatarPrompt (background)" })
  @Post("describe")
  async describe() {
    return this.identity.startBatch();
  }

  @ApiOperation({ summary: "Avatar description progress" })
  @Get("status")
  async status() {
    return this.identity.getStatus();
  }
}
