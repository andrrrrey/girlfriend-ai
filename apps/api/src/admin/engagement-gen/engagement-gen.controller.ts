/**
 * @file engagement-gen.controller.ts
 * @description Админ-API управления фоновой автогенерацией контента для персонажей.
 *
 * Все маршруты под /admin/engagement-gen защищены JwtAuthGuard + RolesGuard("admin").
 */

import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles } from "../../auth/guards/roles.guard";
import { EngagementGenService } from "./engagement-gen.service";
import { StartEngagementGenDto } from "./dto/start-engagement-gen.dto";

@Controller("admin/engagement-gen")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class EngagementGenController {
  constructor(private readonly engagementGen: EngagementGenService) {}

  /** Запустить автогенерацию контента для выбранных персонажей. */
  @Post()
  start(@Req() req: any, @Body() dto: StartEngagementGenDto) {
    return this.engagementGen.createTask(req.user.id, dto);
  }

  /** Список последних задач. */
  @Get()
  list() {
    return this.engagementGen.list();
  }

  /** Одна задача (для поллинга прогресса). */
  @Get(":id")
  get(@Param("id") id: string) {
    return this.engagementGen.get(id);
  }

  @Post(":id/pause")
  pause(@Param("id") id: string) {
    return this.engagementGen.pause(id);
  }

  @Post(":id/resume")
  resume(@Param("id") id: string) {
    return this.engagementGen.resume(id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.engagementGen.cancel(id);
  }
}
