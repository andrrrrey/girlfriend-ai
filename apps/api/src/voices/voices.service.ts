/**
 * @file voices.service.ts
 * @description Бизнес-логика каталога голосов ElevenLabs: публичное чтение
 * активных голосов (для Шага 2 создания персонажа) и админский CRUD.
 * Удаление жёсткое — soft-delete не требуется.
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateVoiceDto } from "./dto/create-voice.dto";
import { UpdateVoiceDto } from "./dto/update-voice.dto";

@Injectable()
export class VoicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Public ────────────────────────────────────────────────

  /** Активные голоса для публичного флоу создания персонажа (по порядку). */
  async listActive() {
    return this.prisma.voice.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  // ─── Admin ─────────────────────────────────────────────────

  /** Все голоса, включая неактивные (для админки). */
  async listAll() {
    return this.prisma.voice.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  async getById(id: string) {
    const voice = await this.prisma.voice.findUnique({ where: { id } });
    if (!voice) throw new NotFoundException("Voice not found");
    return voice;
  }

  async create(dto: CreateVoiceDto) {
    return this.prisma.voice.create({
      data: {
        name: dto.name,
        voiceId: dto.voiceId,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateVoiceDto) {
    await this.getById(id);
    return this.prisma.voice.update({
      where: { id },
      data: {
        name: dto.name,
        voiceId: dto.voiceId,
        order: dto.order,
        isActive: dto.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.voice.delete({ where: { id } });
  }
}
