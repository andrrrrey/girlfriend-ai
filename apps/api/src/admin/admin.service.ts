import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Settings ──────────────────────────────────────────────

  async getAllSettings() {
    return this.prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  }

  async getSetting(key: string) {
    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting "${key}" not found`);
    return setting;
  }

  async upsertSetting(key: string, value: string) {
    return this.prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async upsertSettings(settings: Record<string, string>) {
    const ops = Object.entries(settings).map(([key, value]) =>
      this.prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      }),
    );
    return this.prisma.$transaction(ops);
  }

  // ─── Characters ────────────────────────────────────────────

  async getCharacters(includeDeleted = false) {
    return this.prisma.character.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async getCharacter(id: string) {
    const character = await this.prisma.character.findFirst({
      where: { id, deletedAt: null },
    });
    if (!character) throw new NotFoundException("Character not found");
    return character;
  }

  async createCharacter(data: {
    name: string;
    systemPrompt: string;
    personality?: Record<string, unknown>;
    avatarUrl?: string;
    voiceId?: string;
    tags?: string[];
    isPublic?: boolean;
  }) {
    return this.prisma.character.create({
      data: {
        name: data.name,
        systemPrompt: data.systemPrompt,
        personality: data.personality ?? {},
        avatarUrl: data.avatarUrl,
        voiceId: data.voiceId,
        tags: data.tags ?? [],
        isPublic: data.isPublic ?? true,
      },
    });
  }

  async updateCharacter(
    id: string,
    data: {
      name?: string;
      systemPrompt?: string;
      personality?: Record<string, unknown>;
      avatarUrl?: string;
      voiceId?: string;
      tags?: string[];
      isPublic?: boolean;
    },
  ) {
    await this.getCharacter(id);
    return this.prisma.character.update({ where: { id }, data });
  }

  async deleteCharacter(id: string) {
    await this.getCharacter(id);
    return this.prisma.character.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
