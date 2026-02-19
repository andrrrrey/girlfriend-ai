import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

const USER_SELECT = {
  id: true,
  email: true,
  nickname: true,
  avatarUrl: true,
  role: true,
  subscription: true,
  isDemo: true,
  lang: true,
  createdAt: true,
  usageCounters: true,
} as const;

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
        personality: (data.personality ?? {}) as Prisma.InputJsonValue,
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
    const { personality, ...rest } = data;
    const updateData: Prisma.CharacterUpdateInput = {
      ...rest,
      ...(personality !== undefined
        ? { personality: personality as Prisma.InputJsonValue }
        : {}),
    };
    return this.prisma.character.update({ where: { id }, data: updateData });
  }

  async deleteCharacter(id: string) {
    await this.getCharacter(id);
    return this.prisma.character.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ─── Users ─────────────────────────────────────────────────

  async getUsers(params: { search?: string; limit?: number; offset?: number }) {
    const { search, limit = 50, offset = 0 } = params;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { nickname: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async updateUser(id: string, data: { subscription?: string; role?: string }) {
    await this.getUser(id);
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  async resetUserLimits(id: string) {
    await this.getUser(id);
    await this.prisma.usageCounter.deleteMany({ where: { userId: id } });
  }
}
