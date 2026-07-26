/**
 * @file autogen.controller.ts
 * @description Админ-API управления фоновой автогенерацией персонажей.
 *
 * Все маршруты под /admin/autogen защищены JwtAuthGuard + RolesGuard("admin").
 */

import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles } from "../../auth/guards/roles.guard";
import { AutogenService } from "./autogen.service";
import { StartAutogenDto } from "./dto/start-autogen.dto";

@Controller("admin/autogen")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AutogenController {
  constructor(private readonly autogen: AutogenService) {}

  /** Запустить задачу автогенерации на N персонажей. */
  @Post()
  start(@Req() req: any, @Body() dto: StartAutogenDto) {
    return this.autogen.createTask(req.user.id, dto.count, dto.contentMode);
  }

  /** Список последних задач. */
  @Get()
  list() {
    return this.autogen.list();
  }

  /** Одна задача (для поллинга прогресса). */
  @Get(":id")
  get(@Param("id") id: string) {
    return this.autogen.get(id);
  }

  @Post(":id/pause")
  pause(@Param("id") id: string) {
    return this.autogen.pause(id);
  }

  @Post(":id/resume")
  resume(@Param("id") id: string) {
    return this.autogen.resume(id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.autogen.cancel(id);
  }
}
