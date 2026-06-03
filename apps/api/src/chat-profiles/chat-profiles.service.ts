/**
 * @file chat-profiles.service.ts
 * @description Сервис управления чат-профилями (персонами) пользователя.
 *
 * Чат-профиль — это описание самого пользователя ("Андрей — 40-летний стартапер
 * из Твери, увлекающийся аниме"), которое можно выбрать в чате, чтобы персонаж
 * учитывал этот контекст в диалоге.
 *
 * Операции доступны только над профилями текущего пользователя. Удаление — мягкое
 * (deletedAt), чтобы не ломать чаты, которые ссылаются на профиль.
 */

import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateChatProfileDto } from "./dto/create-chat-profile.dto";
import { UpdateChatProfileDto } from "./dto/update-chat-profile.dto";

@Injectable()
export class ChatProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Создаёт новый чат-профиль для пользователя. */
  async create(userId: string, dto: CreateChatProfileDto) {
    return this.prisma.chatProfile.create({
      data: { userId, name: dto.name, description: dto.description },
    });
  }

  /** Возвращает все активные (не удалённые) профили пользователя. */
  async listByUser(userId: string) {
    return this.prisma.chatProfile.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Возвращает профиль по id с проверкой владельца.
   * @throws NotFoundException — профиль не найден или удалён
   * @throws ForbiddenException — профиль принадлежит другому пользователю
   */
  async getById(userId: string, id: string) {
    const profile = await this.prisma.chatProfile.findFirst({
      where: { id, deletedAt: null },
    });
    if (!profile) throw new NotFoundException("Chat profile not found");
    if (profile.userId !== userId) throw new ForbiddenException();
    return profile;
  }

  /** Обновляет имя/описание профиля. */
  async update(userId: string, id: string, dto: UpdateChatProfileDto) {
    const profile = await this.getById(userId, id);
    return this.prisma.chatProfile.update({
      where: { id: profile.id },
      data: dto,
    });
  }

  /** Мягко удаляет профиль (deletedAt). */
  async delete(userId: string, id: string) {
    const profile = await this.getById(userId, id);
    await this.prisma.chatProfile.update({
      where: { id: profile.id },
      data: { deletedAt: new Date() },
    });
  }
}
