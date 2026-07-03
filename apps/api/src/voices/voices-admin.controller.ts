/**
 * @file voices-admin.controller.ts
 * @description Административные маршруты каталога голосов (`/admin/voices`).
 * Полный CRUD, доступен только пользователям с ролью `admin`
 * (JwtAuthGuard + RolesGuard), как и остальной админ-раздел.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard, Roles } from "../auth/guards/roles.guard";
import { VoicesService } from "./voices.service";
import { CreateVoiceDto } from "./dto/create-voice.dto";
import { UpdateVoiceDto } from "./dto/update-voice.dto";

@Controller("admin/voices")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class VoicesAdminController {
  constructor(private readonly voices: VoicesService) {}

  /** `GET /admin/voices` — все голоса, включая неактивные. */
  @Get()
  async list() {
    return this.voices.listAll();
  }

  /** `GET /admin/voices/:id` */
  @Get(":id")
  async get(@Param("id") id: string) {
    return this.voices.getById(id);
  }

  /** `POST /admin/voices` — создать голос. */
  @Post()
  async create(@Body() dto: CreateVoiceDto) {
    return this.voices.create(dto);
  }

  /** `PATCH /admin/voices/:id` — частичное обновление. */
  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateVoiceDto) {
    return this.voices.update(id, dto);
  }

  /** `DELETE /admin/voices/:id` — удалить голос. */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.voices.remove(id);
  }
}
