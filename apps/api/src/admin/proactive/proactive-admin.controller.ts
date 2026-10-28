/**
 * @file proactive-admin.controller.ts
 * @description Инициативные сообщения в админке (роль admin).
 *
 *   GET /admin/proactive?days=30 — политика и статистика A/B (отправлено/ответили)
 *   PUT /admin/proactive         — изменить политику (частично)
 */

import { Body, Controller, Get, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { Roles, RolesGuard } from "../../auth/guards/roles.guard";
import { ProactiveService } from "../../conversation/proactive.service";

@ApiTags("admin-proactive")
@ApiBearerAuth()
@Controller("admin/proactive")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class ProactiveAdminController {
  constructor(private readonly proactive: ProactiveService) {}

  @ApiOperation({ summary: "Proactive messages: policy and A/B stats" })
  @Get()
  async get(@Query("days") days?: string) {
    const [policy, stats] = await Promise.all([this.proactive.getPolicy(), this.proactive.stats(Number(days) || 30)]);
    return { policy, stats };
  }

  @ApiOperation({ summary: "Update proactive messages policy" })
  @Put()
  async update(@Body() body: Record<string, unknown>) {
    return this.proactive.setPolicy(body ?? {});
  }
}
