/**
 * @file autochat.controller.ts
 * @description Админ-API управления автопиской робота с персонажами.
 *
 * Все маршруты под /admin/autochat защищены JwtAuthGuard + RolesGuard("admin").
 */

import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles } from "../../auth/guards/roles.guard";
import { AutochatService } from "./autochat.service";
import { StartAutochatDto } from "./dto/start-autochat.dto";

@Controller("admin/autochat")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AutochatController {
  constructor(private readonly autochat: AutochatService) {}

  /** Запустить автопереписку с выбранными персонажами. */
  @Post()
  start(@Req() req: any, @Body() dto: StartAutochatDto) {
    return this.autochat.createTask(req.user.id, dto.characterIds, dto.turnsPerChar, dto.contentMode);
  }

  /** Список последних задач. */
  @Get()
  list() {
    return this.autochat.list();
  }

  /** Одна задача (для поллинга прогресса). */
  @Get(":id")
  get(@Param("id") id: string) {
    return this.autochat.get(id);
  }

  @Post(":id/pause")
  pause(@Param("id") id: string) {
    return this.autochat.pause(id);
  }

  @Post(":id/resume")
  resume(@Param("id") id: string) {
    return this.autochat.resume(id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string) {
    return this.autochat.cancel(id);
  }

  /** Анализ поведения одного персонажа в рамках задачи. */
  @Post(":id/analyze/:characterId")
  analyzeCharacter(@Req() req: any, @Param("id") id: string, @Param("characterId") characterId: string) {
    return this.autochat.analyzeCharacter(id, characterId, req.user.id);
  }

  /** Сводный вывод по всем проанализированным персонажам задачи. */
  @Post(":id/analyze-summary")
  analyzeSummary(@Req() req: any, @Param("id") id: string) {
    return this.autochat.analyzeSummary(id, req.user.id);
  }

  /** Сохранённые анализы задачи. */
  @Get(":id/analyses")
  getAnalyses(@Param("id") id: string) {
    return this.autochat.getAnalyses(id);
  }
}
