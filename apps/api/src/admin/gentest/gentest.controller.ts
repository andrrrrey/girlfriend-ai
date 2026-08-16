/**
 * @file gentest.controller.ts
 * @description Админ-API тестового перебора генераций.
 * Все маршруты под /admin/gentest защищены JwtAuthGuard + RolesGuard("admin").
 */

import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles } from "../../auth/guards/roles.guard";
import { GentestService } from "./gentest.service";
import { StartGenTestDto } from "./dto/start-gentest.dto";

@Controller("admin/gentest")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class GentestController {
  constructor(private readonly gentest: GentestService) {}

  /** Запустить тестовый перебор для персонажа. */
  @Post()
  start(@Req() req: any, @Body() dto: StartGenTestDto) {
    return this.gentest.createTask(req.user.id, dto);
  }

  /** Список последних задач. */
  @Get()
  list() {
    return this.gentest.list();
  }

  /** Одна задача + её элементы (для таблицы результатов и поллинга). */
  @Get(":id")
  get(@Param("id") id: string) {
    return this.gentest.get(id);
  }

  /** Отмена задачи. */
  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.gentest.cancel(id);
  }
}
