/**
 * @file voices.controller.ts
 * @description Публичный (без аутентификации) маршрут каталога голосов,
 * используемый флоу создания персонажа (`/create`, Шаг 2 «Voice»).
 */

import { Controller, Get } from "@nestjs/common";
import { VoicesService } from "./voices.service";

@Controller("voices")
export class VoicesController {
  constructor(private readonly voices: VoicesService) {}

  /** `GET /voices` — активные голоса для выбора при создании персонажа. */
  @Get()
  async list() {
    return this.voices.listActive();
  }
}
