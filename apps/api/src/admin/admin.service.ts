/**
 * @file admin.service.ts
 * @description Сервис администратора приложения.
 *
 * Предоставляет бизнес-логику для трёх основных областей управления:
 *
 * 1. **Настройки приложения** — чтение и массовое обновление пар ключ/значение
 *    в таблице `AppSetting` (OPENAI_API_KEY, OPENAI_MODEL, ELEVENLABS_API_KEY и др.).
 *
 * 2. **AI-персонажи** — полный CRUD над сущностью `Character`:
 *    имя, системный промпт, личность (JSON), URL аватара, идентификатор голоса
 *    ElevenLabs, теги и флаг публичности. Удаление является мягким (soft-delete):
 *    поле `deletedAt` заполняется текущей датой, запись остаётся в базе.
 *
 * 3. **Пользователи** — постраничный поиск, просмотр, изменение подписки / роли
 *    и сброс демо-лимитов (счётчиков использования).
 *
 * Все методы работают через {@link PrismaService} и могут выбрасывать
 * {@link NotFoundException} при отсутствии запрошенной записи.
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

/**
 * Набор полей пользователя, возвращаемых администратору.
 * Намеренно исключает чувствительные данные (хэш пароля и т.п.).
 */
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

/**
 * Сервис административного управления.
 *
 * Инкапсулирует всю бизнес-логику, связанную с управлением персонажами,
 * глобальными настройками приложения и учётными записями пользователей.
 * Используется исключительно контроллером {@link AdminController},
 * доступ к которому ограничен ролью `admin`.
 */
@Injectable()
export class AdminService {
  /**
   * @param prisma — сервис Prisma ORM для работы с базой данных.
   */
  constructor(private readonly prisma: PrismaService) {}

  // ─── Settings ──────────────────────────────────────────────

  /**
   * Возвращает все глобальные настройки приложения, отсортированные по ключу.
   *
   * Настройки хранятся в таблице `AppSetting` в виде пар ключ/значение и могут
   * включать: `OPENAI_API_KEY`, `OPENAI_MODEL`, `ELEVENLABS_API_KEY` и другие
   * конфигурационные параметры, изменяемые в рантайме без перезапуска сервиса.
   *
   * @returns Массив всех записей `AppSetting`, упорядоченных по полю `key` (A→Z).
   */
  async getAllSettings() {
    return this.prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  }

  /**
   * Возвращает одну настройку приложения по её ключу.
   *
   * @param key — уникальный ключ настройки (например, `"OPENAI_MODEL"`).
   * @returns Запись `AppSetting` с указанным ключом.
   * @throws {NotFoundException} Если настройка с данным ключом не найдена.
   */
  async getSetting(key: string) {
    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting "${key}" not found`);
    return setting;
  }

  /**
   * Создаёт или обновляет одну настройку приложения (upsert).
   *
   * Если запись с указанным ключом уже существует — обновляется поле `value`.
   * Если не существует — создаётся новая запись.
   *
   * @param key   — уникальный ключ настройки.
   * @param value — новое строковое значение настройки.
   * @returns Актуальная запись `AppSetting` после операции upsert.
   */
  async upsertSetting(key: string, value: string) {
    return this.prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  /**
   * Массово создаёт или обновляет несколько настроек приложения за одну транзакцию.
   *
   * Все операции upsert выполняются атомарно: либо все применяются успешно,
   * либо ни одна — в случае ошибки транзакция откатывается.
   *
   * @param settings — объект, где ключи — названия настроек,
   *                   а значения — соответствующие строковые значения.
   *                   Пример: `{ OPENAI_MODEL: "gpt-4o", ELEVENLABS_API_KEY: "sk-..." }`.
   * @returns Массив обновлённых/созданных записей `AppSetting`.
   */
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

  /**
   * Возвращает список AI-персонажей, отсортированных от новых к старым.
   *
   * По умолчанию исключает мягко удалённых персонажей (`deletedAt != null`).
   * При передаче `includeDeleted = true` возвращаются все записи, включая удалённые.
   *
   * @param includeDeleted — если `true`, в результат включаются мягко удалённые персонажи.
   *                         По умолчанию `false`.
   * @returns Массив записей `Character`.
   */
  async getCharacters(includeDeleted = false) {
    return this.prisma.character.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Возвращает одного AI-персонажа по его идентификатору.
   *
   * Мягко удалённые персонажи считаются несуществующими и вызывают исключение.
   *
   * @param id — UUID персонажа.
   * @returns Запись `Character`.
   * @throws {NotFoundException} Если персонаж не найден или помечен как удалённый.
   */
  async getCharacter(id: string) {
    const character = await this.prisma.character.findFirst({
      where: { id, deletedAt: null },
    });
    if (!character) throw new NotFoundException("Character not found");
    return character;
  }

  /**
   * Создаёт нового AI-персонажа.
   *
   * Если поля `personality`, `tags` или `isPublic` не переданы, применяются
   * значения по умолчанию: `{}`, `[]` и `true` соответственно.
   *
   * @param data                  — данные нового персонажа.
   * @param data.name             — отображаемое имя персонажа (обязательно).
   * @param data.systemPrompt     — системный промпт, определяющий поведение AI (обязательно).
   * @param data.personality      — произвольный JSON-объект с чертами личности персонажа.
   * @param data.avatarUrl        — URL изображения аватара персонажа.
   * @param data.voiceId          — идентификатор голоса ElevenLabs для синтеза речи.
   * @param data.tags             — массив строковых тегов для фильтрации и поиска.
   * @param data.isPublic         — флаг доступности персонажа для обычных пользователей.
   * @returns Созданная запись `Character`.
   */
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

  /**
   * Обновляет существующего AI-персонажа.
   *
   * Передаются только те поля, которые необходимо изменить — остальные
   * остаются без изменений. Перед обновлением выполняется проверка существования
   * персонажа через {@link getCharacter}.
   *
   * @param id                    — UUID персонажа, которого нужно обновить.
   * @param data                  — частичные данные для обновления.
   * @param data.name             — новое имя персонажа.
   * @param data.systemPrompt     — новый системный промпт.
   * @param data.personality      — обновлённый JSON-объект личности.
   * @param data.avatarUrl        — новый URL аватара.
   * @param data.voiceId          — новый идентификатор голоса ElevenLabs.
   * @param data.tags             — обновлённый массив тегов.
   * @param data.isPublic         — новое значение флага публичности.
   * @returns Обновлённая запись `Character`.
   * @throws {NotFoundException} Если персонаж с указанным `id` не найден.
   */
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

  /**
   * Мягко удаляет AI-персонажа, проставляя метку времени в поле `deletedAt`.
   *
   * Физического удаления записи из базы данных не происходит.
   * После вызова этого метода персонаж не будет возвращаться в стандартных
   * запросах (без флага `includeDeleted`).
   *
   * @param id — UUID персонажа, которого нужно удалить.
   * @returns Запись `Character` с заполненным полем `deletedAt`.
   * @throws {NotFoundException} Если персонаж с указанным `id` не найден.
   */
  async deleteCharacter(id: string) {
    await this.getCharacter(id);
    return this.prisma.character.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ─── Users ─────────────────────────────────────────────────

  /**
   * Возвращает постраничный список пользователей с поддержкой поиска.
   *
   * Поиск осуществляется по полям `email` и `nickname` (регистронезависимо,
   * оператор `ILIKE`). Мягко удалённые пользователи (`deletedAt != null`)
   * исключаются из результатов. Вместе с массивом пользователей возвращается
   * общее количество совпадений для пагинации на стороне клиента.
   *
   * @param params          — параметры запроса.
   * @param params.search   — строка для поиска по email или никнейму (необязательно).
   * @param params.limit    — максимальное количество пользователей на странице (по умолчанию 50).
   * @param params.offset   — смещение от начала результирующего набора (по умолчанию 0).
   * @returns Объект `{ users, total }`, где `users` — массив записей пользователей
   *          (только безопасные поля из `USER_SELECT`), `total` — общее количество записей.
   */
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

  /**
   * Возвращает одного пользователя по его идентификатору.
   *
   * Возвращает только безопасные поля, перечисленные в `USER_SELECT`.
   * Мягко удалённые пользователи считаются несуществующими.
   *
   * @param id — UUID пользователя.
   * @returns Объект пользователя с полями из `USER_SELECT`.
   * @throws {NotFoundException} Если пользователь не найден или помечен как удалённый.
   */
  async getUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  /**
   * Обновляет подписку и/или роль пользователя.
   *
   * Позволяет администратору повысить пользователя до `admin`,
   * изменить его подписку с `free` на `paid` и обратно.
   * Перед обновлением выполняется проверка существования через {@link getUser}.
   *
   * @param id                    — UUID пользователя.
   * @param data                  — поля для обновления.
   * @param data.subscription     — новый тип подписки (`"free"` или `"paid"`).
   * @param data.role             — новая роль (`"user"` или `"admin"`).
   * @returns Обновлённый объект пользователя с полями из `USER_SELECT`.
   * @throws {NotFoundException} Если пользователь с указанным `id` не найден.
   */
  async updateUser(id: string, data: { subscription?: string; role?: string }) {
    await this.getUser(id);
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  /**
   * Сбрасывает все счётчики использования демо-пользователя.
   *
   * Удаляет все записи `UsageCounter`, привязанные к данному пользователю,
   * что фактически обнуляет его демо-лимиты и позволяет повторно воспользоваться
   * бесплатными функциями приложения.
   *
   * @param id — UUID пользователя, которому необходимо сбросить лимиты.
   * @returns `void` — метод не возвращает данных.
   * @throws {NotFoundException} Если пользователь с указанным `id` не найден.
   */
  async resetUserLimits(id: string) {
    await this.getUser(id);
    await this.prisma.usageCounter.deleteMany({ where: { userId: id } });
  }

  // ─── Character Options ─────────────────────────────────────

  async getCharacterOptions(category?: string) {
    return this.prisma.characterOption.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createCharacterOption(dto: { category: string; name: string; imageUrl?: string; order?: number }) {
    return this.prisma.characterOption.create({
      data: {
        category: dto.category,
        name: dto.name,
        imageUrl: dto.imageUrl,
        order: dto.order ?? 0,
      },
    });
  }

  async updateCharacterOption(id: string, dto: { category?: string; name?: string; imageUrl?: string; order?: number }) {
    const existing = await this.prisma.characterOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`CharacterOption "${id}" not found`);
    return this.prisma.characterOption.update({ where: { id }, data: dto });
  }

  async deleteCharacterOption(id: string) {
    const existing = await this.prisma.characterOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`CharacterOption "${id}" not found`);
    await this.prisma.characterOption.delete({ where: { id } });
  }

  // ─── Appearance Categories ─────────────────────────────────

  async getAppearanceCategories(tab?: string) {
    return this.prisma.appearanceCategory.findMany({
      where: tab ? { tab } : undefined,
      orderBy: [{ tab: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createAppearanceCategory(dto: { tab: string; name: string; order?: number }) {
    return this.prisma.appearanceCategory.create({
      data: { tab: dto.tab, name: dto.name, order: dto.order ?? 0 },
    });
  }

  async updateAppearanceCategory(id: string, dto: { tab?: string; name?: string; order?: number }) {
    const existing = await this.prisma.appearanceCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`AppearanceCategory "${id}" not found`);
    return this.prisma.appearanceCategory.update({ where: { id }, data: dto });
  }

  async deleteAppearanceCategory(id: string) {
    const existing = await this.prisma.appearanceCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`AppearanceCategory "${id}" not found`);
    await this.prisma.appearanceCategory.delete({ where: { id } });
  }

  // ─── Appearance Options ────────────────────────────────────

  async getAppearanceOptions(categoryId?: string) {
    return this.prisma.appearanceOption.findMany({
      where: categoryId ? { categoryId } : undefined,
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createAppearanceOption(dto: { categoryId: string; name: string; imageUrl?: string; order?: number }) {
    const category = await this.prisma.appearanceCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException(`AppearanceCategory "${dto.categoryId}" not found`);
    return this.prisma.appearanceOption.create({
      data: { categoryId: dto.categoryId, name: dto.name, imageUrl: dto.imageUrl, order: dto.order ?? 0 },
    });
  }

  async updateAppearanceOption(id: string, dto: { categoryId?: string; name?: string; imageUrl?: string; order?: number }) {
    const existing = await this.prisma.appearanceOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`AppearanceOption "${id}" not found`);
    return this.prisma.appearanceOption.update({ where: { id }, data: dto });
  }

  async deleteAppearanceOption(id: string) {
    const existing = await this.prisma.appearanceOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`AppearanceOption "${id}" not found`);
    await this.prisma.appearanceOption.delete({ where: { id } });
  }

  // ─── Appearance Options (public, for generation) ───────────

  async getAppearanceOptionsForGeneration() {
    const categories = await this.prisma.appearanceCategory.findMany({
      orderBy: [{ tab: "asc" }, { order: "asc" }],
      include: {
        options: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      },
    });
    const result: Record<string, typeof categories> = { OUTFITS: [], OUTFIT_DETAILS: [] };
    for (const cat of categories) {
      if (result[cat.tab]) result[cat.tab].push(cat);
    }
    return result;
  }

  // ─── Pose Categories ───────────────────────────────────────

  async getPoseCategories(tab?: string) {
    return this.prisma.poseCategory.findMany({
      where: tab ? { tab } : undefined,
      orderBy: [{ tab: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createPoseCategory(dto: { tab: string; name: string; order?: number }) {
    return this.prisma.poseCategory.create({ data: { ...dto, order: dto.order ?? 0 } });
  }

  async updatePoseCategory(id: string, dto: { tab?: string; name?: string; order?: number }) {
    const existing = await this.prisma.poseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`PoseCategory "${id}" not found`);
    return this.prisma.poseCategory.update({ where: { id }, data: dto });
  }

  async deletePoseCategory(id: string) {
    const existing = await this.prisma.poseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`PoseCategory "${id}" not found`);
    await this.prisma.poseCategory.delete({ where: { id } });
  }

  // ─── Pose Options ──────────────────────────────────────────

  async getPoseOptions(categoryId?: string) {
    return this.prisma.poseOption.findMany({
      where: categoryId ? { categoryId } : undefined,
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createPoseOption(dto: { categoryId: string; name: string; imageUrl?: string; order?: number }) {
    const category = await this.prisma.poseCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException(`PoseCategory "${dto.categoryId}" not found`);
    return this.prisma.poseOption.create({ data: { ...dto, order: dto.order ?? 0 } });
  }

  async updatePoseOption(id: string, dto: { categoryId?: string; name?: string; imageUrl?: string; order?: number }) {
    const existing = await this.prisma.poseOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`PoseOption "${id}" not found`);
    return this.prisma.poseOption.update({ where: { id }, data: dto });
  }

  async deletePoseOption(id: string) {
    const existing = await this.prisma.poseOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`PoseOption "${id}" not found`);
    await this.prisma.poseOption.delete({ where: { id } });
  }

  // ─── Pose Options (public, for generation) ────────────────

  async getPoseOptionsForGeneration() {
    const categories = await this.prisma.poseCategory.findMany({
      orderBy: [{ tab: "asc" }, { order: "asc" }],
      include: {
        options: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      },
    });
    const result: Record<string, typeof categories> = { FACIAL_EXPRESSION: [], POSE: [] };
    for (const cat of categories) {
      if (result[cat.tab]) result[cat.tab].push(cat);
    }
    return result;
  }
}
