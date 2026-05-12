/**
 * @file users.service.ts
 * @description Сервис управления профилем пользователя.
 *
 * Операции доступны только над профилем текущего пользователя (не admin-операции).
 * Для административных операций над чужими профилями — см. admin.service.ts.
 *
 * Функциональность:
 * - Получение/обновление профиля (nickname, avatarUrl, lang)
 * - Смена пароля (требует текущий пароль — защита от CSRF)
 * - CRUD для социальных ссылок (VK, Instagram, X)
 *
 * Безопасность смены пароля:
 * - Требуется подтверждение текущего пароля (защита при захвате сессии)
 * - Новый пароль хешируется bcrypt с cost-factor 10
 */

import { Injectable, UnauthorizedException, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma.service";

/** Cost-factor bcrypt — должен совпадать с аналогичной константой в auth.service.ts */
const BCRYPT_ROUNDS = 10;

/**
 * Сервис для операций с профилем авторизованного пользователя.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Возвращает полный профиль пользователя включая социальные ссылки.
   *
   * Использует findUniqueOrThrow — если пользователь не найден (теоретически невозможно
   * при валидном JWT), выбросит NotFoundException.
   *
   * @param userId — ID из req.user (установлен JwtStrategy)
   * @returns объект профиля без passwordHash
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarUrl: true,
        aboutMe: true,
        role: true,
        subscription: true,
        lang: true,
        createdAt: true,
        socialLinks: {
          select: { provider: true, url: true },
        },
      },
    });
    return user;
  }

  async checkNicknameAvailability(nickname: string, currentUserId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { nickname, id: { not: currentUserId } },
      select: { id: true },
    });
    return { available: !existing };
  }

  async getPublicProfile(nickname: string, viewerId: string) {
    const user = await this.prisma.user.findFirst({
      where: { nickname, deletedAt: null },
      select: {
        id: true,
        nickname: true,
        avatarUrl: true,
        aboutMe: true,
        createdAt: true,
        socialLinks: { select: { provider: true, url: true } },
        _count: {
          select: {
            followers: true,
            likes: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException("User not found");

    const [characterCount, isFollowing] = await Promise.all([
      this.prisma.character.count({ where: { createdBy: user.id, isPublic: true, deletedAt: null } }),
      this.prisma.follow.findFirst({
        where: { followerId: viewerId, followeeId: user.id },
        select: { id: true },
      }),
    ]);

    return {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      aboutMe: user.aboutMe,
      socialLinks: user.socialLinks,
      followerCount: user._count.followers,
      likeCount: user._count.likes,
      characterCount,
      isFollowing: !!isFollowing,
      createdAt: user.createdAt,
    };
  }

  async followUser(followerId: string, followeeNickname: string) {
    const followee = await this.prisma.user.findFirst({
      where: { nickname: followeeNickname, deletedAt: null },
      select: { id: true },
    });
    if (!followee) throw new NotFoundException("User not found");
    if (followee.id === followerId) throw new BadRequestException("Cannot follow yourself");

    try {
      await this.prisma.follow.create({
        data: { followerId, followeeId: followee.id },
      });
    } catch {
      // Already following — ignore duplicate
    }
    return { following: true };
  }

  async unfollowUser(followerId: string, followeeNickname: string) {
    const followee = await this.prisma.user.findFirst({
      where: { nickname: followeeNickname, deletedAt: null },
      select: { id: true },
    });
    if (!followee) throw new NotFoundException("User not found");

    await this.prisma.follow.deleteMany({
      where: { followerId, followeeId: followee.id },
    });
    return { following: false };
  }

  async getFollowStatus(followerId: string, followeeNickname: string) {
    const followee = await this.prisma.user.findFirst({
      where: { nickname: followeeNickname, deletedAt: null },
      select: { id: true },
    });
    if (!followee) throw new NotFoundException("User not found");

    const follow = await this.prisma.follow.findFirst({
      where: { followerId, followeeId: followee.id },
      select: { id: true },
    });
    return { following: !!follow };
  }

  /**
   * Обновляет редактируемые поля профиля.
   * Все поля опциональны (частичное обновление).
   *
   * @param userId — ID текущего пользователя
   * @param data — поля для обновления: { nickname?, avatarUrl?, lang? }
   *   - nickname: отображаемое имя (до 50 символов, из UpdateProfileDto)
   *   - avatarUrl: URL аватара
   *   - lang: язык интерфейса ("ru" | "en")
   * @returns обновлённый профиль (без socialLinks)
   */
  async updateProfile(
    userId: string,
    data: { nickname?: string; avatarUrl?: string; lang?: string; aboutMe?: string },
  ) {
    if (data.nickname) {
      const conflict = await this.prisma.user.findFirst({
        where: { nickname: data.nickname, id: { not: userId } },
        select: { id: true },
      });
      if (conflict) throw new ConflictException("Nickname is already taken");
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarUrl: true,
        aboutMe: true,
        role: true,
        subscription: true,
        lang: true,
      },
    });
  }

  /**
   * Меняет пароль пользователя с подтверждением текущего пароля.
   *
   * Логика безопасности:
   * 1. Загружаем пользователя с passwordHash (findUniqueOrThrow включает все поля)
   * 2. Проверяем currentPassword через bcrypt.compare (timing-safe)
   * 3. Хешируем новый пароль и сохраняем
   *
   * @param userId — ID текущего пользователя
   * @param currentPassword — текущий пароль для подтверждения
   * @param newPassword — новый пароль (минимум 6 символов, из ChangePasswordDto)
   * @throws UnauthorizedException — если текущий пароль неверный
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    // findUniqueOrThrow включает все поля, в т.ч. passwordHash
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // Timing-safe сравнение (защита от timing attacks)
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /**
   * Создаёт или обновляет социальную ссылку пользователя (upsert).
   *
   * Уникальный ключ: { userId, provider } — у одного пользователя
   * может быть не более одной ссылки на каждую соц. сеть.
   *
   * @param userId — ID текущего пользователя
   * @param provider — соц. сеть: "vk" | "instagram" | "x"
   * @param url — URL профиля (валидируется @IsUrl() в DTO)
   * @returns { provider, url }
   */
  async upsertSocialLink(userId: string, provider: string, url: string) {
    return this.prisma.socialLink.upsert({
      where: { userId_provider: { userId, provider } }, // Составной уникальный ключ
      update: { url },   // Обновляем URL если ссылка уже существует
      create: { userId, provider, url }, // Создаём новую если не существует
      select: { provider: true, url: true },
    });
  }

  /**
   * Удаляет социальную ссылку пользователя.
   * Использует deleteMany — не кидает ошибку если ссылка не найдена (идемпотентно).
   *
   * @param userId — ID текущего пользователя
   * @param provider — соц. сеть для удаления
   */
  async deleteSocialLink(userId: string, provider: string) {
    await this.prisma.socialLink.deleteMany({
      where: { userId, provider },
    });
  }

  /**
   * Возвращает все социальные ссылки пользователя.
   *
   * @param userId — ID текущего пользователя
   * @returns массив { provider, url }[]
   */
  async getSocialLinks(userId: string) {
    return this.prisma.socialLink.findMany({
      where: { userId },
      select: { provider: true, url: true },
    });
  }
}
