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
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { S3Service } from "../s3/s3.service";
import { backfillAllCharacterSeo } from "../chats/character-seo";
import { loadEnv } from "@repo/config";
import {
  DEFAULT_NSFW_PROMPT_TAGS,
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_SFW_PROMPT_TAGS,
  DEFAULT_SFW_NEGATIVE_PROMPT,
} from "@repo/types";
import { randomUUID } from "crypto";

const env = loadEnv();
const AI_BASE = `http://${env.AI_HOST}:${env.AI_PORT}`;

/**
 * Дефолты для ключей AppSetting, у которых пока может не быть строки в БД, но
 * админ должен видеть и редактировать исходное значение (иначе поле пустое, и
 * «дополнять» negative_prompt не из чего). apps/ai использует те же значения из
 * @repo/types как фолбэк, поэтому показанное в админке = реально применяемому.
 */
const SETTING_DEFAULTS: Record<string, string> = {
  NSFW_PROMPT_TAGS: DEFAULT_NSFW_PROMPT_TAGS,
  NEGATIVE_PROMPT: DEFAULT_NEGATIVE_PROMPT,
  SFW_PROMPT_TAGS: DEFAULT_SFW_PROMPT_TAGS,
  SFW_NEGATIVE_PROMPT: DEFAULT_SFW_NEGATIVE_PROMPT,
};

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

  /**
   * Запускает фоновую генерацию SEO-описаний и slug для всех персонажей,
   * у которых их ещё нет. Возвращает число поставленных в очередь персонажей
   * сразу — сама генерация идёт в фоне (последовательно, с паузами).
   */
  async backfillCharacterSeo(): Promise<{ started: true; total: number }> {
    const total = await backfillAllCharacterSeo(this.prisma);
    return { started: true, total };
  }

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
    const rows = await this.prisma.appSetting.findMany({ orderBy: { key: "asc" } });
    // Для ключей с дефолтом, у которых ещё нет строки в БД, подставляем дефолт —
    // чтобы админ сразу видел и мог редактировать/дополнять значение. Ключи с
    // существующей строкой (в т.ч. пустой "" — осознанное отключение) не трогаем.
    const present = new Set(rows.map((r) => r.key));
    const injected = Object.entries(SETTING_DEFAULTS)
      .filter(([key]) => !present.has(key))
      .map(([key, value]) => ({ key, value, updatedAt: new Date() }));
    return [...rows, ...injected].sort((a, b) => a.key.localeCompare(b.key));
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

    const userIds = users.map((u) => u.id);
    const statsMap = await this.getUsersStatsMap(userIds);

    const usersWithStats = users.map((u) => ({
      ...u,
      stats: statsMap.get(u.id) ?? { imageCount: 0, videoCount: 0, chatCount: 0, characterCount: 0 },
    }));

    return { users: usersWithStats, total };
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

  async getUserStats(id: string) {
    await this.getUser(id);

    const [imageCount, videoCount, chatCount, characterCount, jobs] = await Promise.all([
      this.prisma.aiJob.count({ where: { userId: id, type: "image" } }),
      this.prisma.aiJob.count({ where: { userId: id, type: "video" } }),
      this.prisma.chatSession.count({ where: { userId: id, deletedAt: null } }),
      this.prisma.character.count({ where: { createdBy: id, deletedAt: null } }),
      this.prisma.aiJob.findMany({
        where: { userId: id, type: { in: ["image", "video"] } },
        select: { type: true, input: true },
      }),
    ]);

    const modelFreq = new Map<string, number>();
    for (const job of jobs) {
      const input = job.input as Record<string, unknown> | null;
      const model = (input?.model as string) ?? "unknown";
      modelFreq.set(model, (modelFreq.get(model) ?? 0) + 1);
    }
    const modelsUsed = Array.from(modelFreq.entries())
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count);

    return { imageCount, videoCount, chatCount, characterCount, modelsUsed };
  }

  async getUsersStatsMap(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, any>();

    const [imageCounts, videoCounts, chatCounts, characterCounts] = await Promise.all([
      this.prisma.aiJob.groupBy({ by: ["userId"], where: { userId: { in: userIds }, type: "image" }, _count: true }),
      this.prisma.aiJob.groupBy({ by: ["userId"], where: { userId: { in: userIds }, type: "video" }, _count: true }),
      this.prisma.chatSession.groupBy({ by: ["userId"], where: { userId: { in: userIds }, deletedAt: null }, _count: true }),
      this.prisma.character.groupBy({ by: ["createdBy"], where: { createdBy: { in: userIds }, deletedAt: null }, _count: true }),
    ]);

    const toMap = (rows: { userId?: string; createdBy?: string; _count: number }[], key = "userId") =>
      new Map(rows.map((r) => [(r as any)[key] as string, r._count]));

    const imgMap = toMap(imageCounts as any);
    const vidMap = toMap(videoCounts as any);
    const chatMap = toMap(chatCounts as any);
    const charMap = toMap(characterCounts as any, "createdBy");

    const result = new Map<string, { imageCount: number; videoCount: number; chatCount: number; characterCount: number }>();
    for (const uid of userIds) {
      result.set(uid, {
        imageCount: imgMap.get(uid) ?? 0,
        videoCount: vidMap.get(uid) ?? 0,
        chatCount: chatMap.get(uid) ?? 0,
        characterCount: charMap.get(uid) ?? 0,
      });
    }
    return result;
  }

  async deleteUser(id: string) {
    await this.getUser(id);
    await this.prisma.session.deleteMany({ where: { userId: id } });
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ─── Reports (жалобы на персонажей) ────────────────────────

  /**
   * Возвращает список жалоб с фильтрами и пагинацией.
   *
   * @param params.search      — поиск по email/нику репортёра или имени персонажа.
   * @param params.characterId — фильтр по конкретному персонажу.
   * @param params.reason      — фильтр по причине (наличие ключа в массиве `reasons`).
   * @param params.status      — фильтр по статусу (open | resolved).
   */
  async getReports(params: {
    search?: string;
    characterId?: string;
    reason?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const { search, characterId, reason, status, limit = 20, offset = 0 } =
      params;

    const where: Prisma.ReportWhereInput = {
      ...(characterId ? { characterId } : {}),
      ...(reason ? { reasons: { has: reason } } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { user: { email: { contains: search, mode: "insensitive" } } },
              { user: { nickname: { contains: search, mode: "insensitive" } } },
              { character: { name: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, email: true, nickname: true } },
          character: { select: { id: true, name: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    const reports = rows.map((r) => ({
      id: r.id,
      reasons: r.reasons,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      user: r.user,
      character: r.character,
    }));

    return { reports, total };
  }

  async updateReportStatus(id: string, status: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Report not found");
    const updated = await this.prisma.report.update({
      where: { id },
      data: { status },
    });
    return { id: updated.id, status: updated.status };
  }

  async deleteReport(id: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Report not found");
    await this.prisma.report.delete({ where: { id } });
  }

  // ─── Character Options ─────────────────────────────────────

  async getCharacterOptions(category?: string) {
    return this.prisma.characterOption.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createCharacterOption(dto: { category: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number; generationStyle?: string; nsfw?: boolean }) {
    return this.prisma.characterOption.create({
      data: {
        category: dto.category,
        name: dto.name,
        prompt: dto.prompt,
        imageUrl: dto.imageUrl,
        imageThumbKey: dto.imageThumbKey,
        imageFullKey: dto.imageFullKey,
        order: dto.order ?? 0,
        generationStyle: dto.generationStyle,
        nsfw: dto.nsfw ?? true,
      },
    });
  }

  async updateCharacterOption(id: string, dto: { category?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number; generationStyle?: string }) {
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

  async createAppearanceOption(dto: { categoryId: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number; nsfw?: boolean }) {
    const category = await this.prisma.appearanceCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException(`AppearanceCategory "${dto.categoryId}" not found`);
    return this.prisma.appearanceOption.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        prompt: dto.prompt,
        imageUrl: dto.imageUrl,
        imageThumbKey: dto.imageThumbKey,
        imageFullKey: dto.imageFullKey,
        order: dto.order ?? 0,
        nsfw: dto.nsfw ?? true,
      },
    });
  }

  async updateAppearanceOption(id: string, dto: { categoryId?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }) {
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

  async createPoseOption(dto: { categoryId: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }) {
    const category = await this.prisma.poseCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException(`PoseCategory "${dto.categoryId}" not found`);
    return this.prisma.poseOption.create({ data: { ...dto, order: dto.order ?? 0 } });
  }

  async updatePoseOption(id: string, dto: { categoryId?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }) {
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

  // ─── Scene Categories ──────────────────────────────────────

  async getSceneCategories(tab?: string) {
    return this.prisma.sceneCategory.findMany({
      where: tab ? { tab } : undefined,
      orderBy: [{ tab: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createSceneCategory(dto: { tab: string; name: string; order?: number }) {
    return this.prisma.sceneCategory.create({ data: { ...dto, order: dto.order ?? 0 } });
  }

  async updateSceneCategory(id: string, dto: { tab?: string; name?: string; order?: number }) {
    const existing = await this.prisma.sceneCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`SceneCategory "${id}" not found`);
    return this.prisma.sceneCategory.update({ where: { id }, data: dto });
  }

  async deleteSceneCategory(id: string) {
    const existing = await this.prisma.sceneCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`SceneCategory "${id}" not found`);
    await this.prisma.sceneCategory.delete({ where: { id } });
  }

  // ─── Scene Options ─────────────────────────────────────────

  async getSceneOptions(categoryId?: string) {
    return this.prisma.sceneOption.findMany({
      where: categoryId ? { categoryId } : undefined,
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createSceneOption(dto: { categoryId: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }) {
    const category = await this.prisma.sceneCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException(`SceneCategory "${dto.categoryId}" not found`);
    return this.prisma.sceneOption.create({ data: { ...dto, order: dto.order ?? 0 } });
  }

  async updateSceneOption(id: string, dto: { categoryId?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }) {
    const existing = await this.prisma.sceneOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`SceneOption "${id}" not found`);
    return this.prisma.sceneOption.update({ where: { id }, data: dto });
  }

  async deleteSceneOption(id: string) {
    const existing = await this.prisma.sceneOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`SceneOption "${id}" not found`);
    await this.prisma.sceneOption.delete({ where: { id } });
  }

  // ─── Scene Options (public, for generation) ───────────────

  async getSceneOptionsForGeneration() {
    const categories = await this.prisma.sceneCategory.findMany({
      orderBy: [{ tab: "asc" }, { order: "asc" }],
      include: {
        options: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      },
    });
    const result: Record<string, typeof categories> = { LOCATION: [] };
    for (const cat of categories) {
      if (result[cat.tab]) result[cat.tab].push(cat);
    }
    return result;
  }

  // ─── Camera Options ────────────────────────────────────────

  async getCameraOptions(section?: string) {
    return this.prisma.cameraOption.findMany({
      where: section ? { section } : undefined,
      orderBy: [{ section: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
  }

  async createCameraOption(dto: { section: string; name: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }) {
    return this.prisma.cameraOption.create({ data: { ...dto, order: dto.order ?? 0 } });
  }

  async updateCameraOption(id: string, dto: { section?: string; name?: string; prompt?: string; imageUrl?: string; imageThumbKey?: string; imageFullKey?: string; order?: number }) {
    const existing = await this.prisma.cameraOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`CameraOption "${id}" not found`);
    return this.prisma.cameraOption.update({ where: { id }, data: dto });
  }

  async deleteCameraOption(id: string) {
    const existing = await this.prisma.cameraOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`CameraOption "${id}" not found`);
    await this.prisma.cameraOption.delete({ where: { id } });
  }

  // ─── Экспорт опций генерации в CSV ─────────────────────────

  /**
   * Собирает все опции генерации (character/appearance/pose/scene/camera) в один
   * CSV: раздел, категория, название, промпт, имена картинок (S3-ключи/URL),
   * порядок. Категории appearance/pose/scene резолвятся в человекочитаемое имя.
   */
  async exportGenerationOptionsCsv(): Promise<string> {
    const [character, appearance, pose, scene, camera] = await Promise.all([
      this.prisma.characterOption.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }] }),
      this.prisma.appearanceOption.findMany({
        orderBy: [{ order: "asc" }],
        include: { category: { select: { tab: true, name: true } } },
      }),
      this.prisma.poseOption.findMany({
        orderBy: [{ order: "asc" }],
        include: { category: { select: { tab: true, name: true } } },
      }),
      this.prisma.sceneOption.findMany({
        orderBy: [{ order: "asc" }],
        include: { category: { select: { tab: true, name: true } } },
      }),
      this.prisma.cameraOption.findMany({ orderBy: [{ section: "asc" }, { order: "asc" }] }),
    ]);

    const header = ["section", "category", "name", "prompt", "imageUrl", "imageThumbKey", "imageFullKey", "order"];
    const rows: (string | number | null | undefined)[][] = [];

    for (const o of character) {
      rows.push(["character", o.category, o.name, o.prompt, o.imageUrl, o.imageThumbKey, o.imageFullKey, o.order]);
    }
    for (const o of appearance) {
      rows.push(["appearance", `${o.category?.tab ?? ""} / ${o.category?.name ?? ""}`, o.name, o.prompt, o.imageUrl, o.imageThumbKey, o.imageFullKey, o.order]);
    }
    for (const o of pose) {
      rows.push(["pose", `${o.category?.tab ?? ""} / ${o.category?.name ?? ""}`, o.name, o.prompt, o.imageUrl, o.imageThumbKey, o.imageFullKey, o.order]);
    }
    for (const o of scene) {
      rows.push(["scene", `${o.category?.tab ?? ""} / ${o.category?.name ?? ""}`, o.name, o.prompt, o.imageUrl, o.imageThumbKey, o.imageFullKey, o.order]);
    }
    for (const o of camera) {
      rows.push(["camera", o.section, o.name, o.prompt, o.imageUrl, o.imageThumbKey, o.imageFullKey, o.order]);
    }

    const escape = (v: string | number | null | undefined): string => {
      const s = v == null ? "" : String(v);
      // RFC 4180: экранируем кавычки удвоением и оборачиваем поля со спецсимволами.
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [header.join(","), ...rows.map((r) => r.map(escape).join(","))];
    // BOM — чтобы Excel корректно открывал UTF-8 (кириллица в промптах).
    return "﻿" + lines.join("\r\n");
  }

  // ─── Generations ───────────────────────────────────────────

  async getGenerations(opts: { type?: string; limit?: number; offset?: number; search?: string }) {
    const { type, limit = 50, offset = 0, search } = opts;
    const where: any = {
      status: "completed",
      type: { in: ["image", "video"] },
    };
    if (type === "image" || type === "video") {
      where.type = type;
    }
    if (search) {
      where.OR = [
        { input: { path: ["prompt"], string_contains: search } },
        { user: { nickname: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.aiJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, nickname: true, email: true, avatarUrl: true } },
        },
      }),
      this.prisma.aiJob.count({ where }),
    ]);

    const signedItems = await Promise.all(items.map(async (item) => ({
      ...item,
      output: await this.signOutput(item.output),
    })));

    return { items: signedItems, total };
  }

  /**
   * Возвращает расходы на генерацию: список созданных генераций (изображения/видео)
   * с фильтрами, плюс агрегированную разбивку по моделям для подсчёта итоговой суммы.
   *
   * Стоимость считается «за генерацию»: цена за 1 генерацию для каждой модели хранится
   * в `AppSetting` под ключом `MODEL_PRICING` (JSON `{ "<modelId>": <ценаЗаГенерацию> }`)
   * и редактируется администратором. Итоговые суммы вычисляются на клиенте из `breakdown`
   * (количество генераций по каждой модели) и текущих цен, поэтому здесь возвращаются
   * только агрегаты количеств, а не суммы.
   *
   * @param opts.type   — фильтр по типу: "image" | "video" (необязательно).
   * @param opts.model  — фильтр по модели нейросети (`input->>'model'`, необязательно).
   * @param opts.from   — нижняя граница диапазона дат (ISO, включительно, необязательно).
   * @param opts.to     — верхняя граница диапазона дат (ISO, включительно, необязательно).
   * @param opts.limit  — размер страницы списка генераций (по умолчанию 100).
   * @param opts.offset — смещение для пагинации (по умолчанию 0).
   */
  async getGenerationCosts(opts: {
    type?: string;
    model?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const { type, model, from, to, limit = 100, offset = 0 } = opts;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    // Where для Prisma findMany (список генераций).
    const where: Prisma.AiJobWhereInput = {
      status: "completed",
      type: type === "image" || type === "video" ? type : { in: ["image", "video"] },
    };
    if (model) where.input = { path: ["model"], equals: model };
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      };
    }

    // Те же фильтры в виде SQL для агрегатных запросов.
    const conds: Prisma.Sql[] = [
      Prisma.sql`status = 'completed'`,
      type === "image" || type === "video"
        ? Prisma.sql`type = ${type}`
        : Prisma.sql`type IN ('image', 'video')`,
    ];
    if (model) conds.push(Prisma.sql`input->>'model' = ${model}`);
    if (fromDate) conds.push(Prisma.sql`created_at >= ${fromDate}`);
    if (toDate) conds.push(Prisma.sql`created_at <= ${toDate}`);
    const whereSql = Prisma.join(conds, " AND ");

    const [items, total, grouped, distinctModels, pricingSetting] = await Promise.all([
      this.prisma.aiJob.findMany({
        where,
        select: { id: true, type: true, input: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.aiJob.count({ where }),
      this.prisma.$queryRaw<{ type: string; model: string | null; count: number }[]>(
        Prisma.sql`SELECT type, input->>'model' AS model, COUNT(*)::int AS count FROM ai_jobs WHERE ${whereSql} GROUP BY type, model`,
      ),
      // Список доступных моделей для фильтра — по всем завершённым генерациям, без учёта фильтров.
      this.prisma.$queryRaw<{ type: string; model: string | null }[]>(
        Prisma.sql`SELECT DISTINCT type, input->>'model' AS model FROM ai_jobs WHERE status = 'completed' AND type IN ('image', 'video') AND input->>'model' IS NOT NULL ORDER BY type, model`,
      ),
      this.prisma.appSetting.findUnique({ where: { key: "MODEL_PRICING" } }),
    ]);

    let pricing: Record<string, number> = {};
    if (pricingSetting?.value) {
      try {
        pricing = JSON.parse(pricingSetting.value);
      } catch {
        pricing = {};
      }
    }

    const rows = items.map((it) => {
      const input = (it.input as Record<string, unknown> | null) ?? {};
      return {
        jobId: it.id,
        type: it.type,
        model: (input["model"] as string) ?? "unknown",
        prompt: (input["prompt"] as string) ?? (input["originalPrompt"] as string) ?? "",
        createdAt: it.createdAt,
      };
    });

    const breakdown = grouped.map((g) => ({
      type: g.type,
      model: g.model ?? "unknown",
      count: Number(g.count),
    }));

    const availableModels = distinctModels
      .filter((m) => m.model)
      .map((m) => ({ type: m.type, model: m.model as string }));

    return { currency: "USD", rows, total, pricing, availableModels, breakdown };
  }

  private async signOutput(output: unknown): Promise<unknown> {
    if (!output || typeof output !== "object") return output;
    const o = output as Record<string, unknown>;
    if (typeof o["url"] === "string") {
      return { ...o, url: await this.toSignedUrl(o["url"] as string) };
    }
    return output;
  }

  private async toSignedUrl(url: string | undefined | null): Promise<string | null> {
    if (!url) return null;
    const publicBase = (env as any).S3_PUBLIC_URL || env.S3_ENDPOINT;
    if (publicBase) {
      const key = S3Service.extractKeyFromUrl(url, publicBase, env.S3_BUCKET ?? "media");
      if (key) return `/api-proxy/media/stream?key=${encodeURIComponent(key)}`;
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return `/api-proxy/media/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  }

  // ─── Engagement: накрутка лайков + автогенерация комментариев ─────────────

  /** Устанавливает надбавку лайков (boostLikes) для выбранных персонажей или шортов/медиа. */
  async setBoostLikes(targetType: string, targetIds: string[], boostLikes: number) {
    const value = Math.max(0, Math.floor(boostLikes || 0));
    const ids = (targetIds || []).filter(Boolean);
    if (ids.length === 0) throw new NotFoundException("No targets selected");
    if (targetType === "character") {
      await this.prisma.character.updateMany({ where: { id: { in: ids } }, data: { boostLikes: value } });
    } else if (targetType === "short" || targetType === "gallery_item") {
      await this.prisma.aiJob.updateMany({ where: { id: { in: ids } }, data: { boostLikes: value } });
    } else {
      throw new NotFoundException(`Unsupported target type "${targetType}"`);
    }
    return { targetType, count: ids.length, boostLikes: value };
  }

  /**
   * Гарантирует пул бот-пользователей (isDemo) для авторства автокомментариев.
   * Логин под ними невозможен (passwordHash = "!"), email в домене bots.local.
   */
  private async ensureBotUsers(count: number): Promise<{ id: string }[]> {
    const existing = await this.prisma.user.findMany({
      where: { isDemo: true, nickname: { startsWith: "bot_" } },
      select: { id: true },
      take: count,
    });
    if (existing.length >= count) return existing;
    const created: { id: string }[] = [];
    for (let i = 0; i < count - existing.length; i++) {
      const suffix = randomUUID().slice(0, 8);
      const u = await this.prisma.user.create({
        data: {
          email: `bot_${suffix}@bots.local`,
          passwordHash: "!",
          nickname: `bot_${suffix}`,
          isDemo: true,
          emailVerified: true,
        },
        select: { id: true },
      });
      created.push(u);
    }
    return [...existing, ...created];
  }

  /**
   * Генерирует N автокомментариев к каждому из выбранных персонажей или шортов
   * через AI-сервис (/ai/text/completion), от лица пула бот-пользователей.
   */
  async generateComments(targetType: string, targetIds: string[], count: number) {
    const n = Math.min(Math.max(1, Math.floor(count || 0)), 50);
    const ids = (targetIds || []).filter(Boolean);
    if (ids.length === 0) throw new NotFoundException("No targets selected");
    if (targetType !== "character" && targetType !== "short" && targetType !== "gallery_item") {
      throw new NotFoundException(`Unsupported target type "${targetType}"`);
    }

    const normalizedTarget = targetType === "gallery_item" ? "short" : targetType;
    const bots = await this.ensureBotUsers(Math.min(n, 12));
    const system =
      "You write short, casual, positive social-media style viewer comments (1 sentence, max 12 words). " +
      "No hashtags, no surrounding quotes. Vary the tone across comments.";

    let created = 0;
    let requested = 0;

    for (const targetId of ids) {
      // Контекст генерации: имя/описание персонажа или промпт шорта.
      let context = "";
      if (targetType === "character") {
        const c = await this.prisma.character.findUnique({ where: { id: targetId } });
        if (!c) continue; // пропускаем несуществующую цель, не прерывая всю пачку
        const p = (c.personality as Record<string, unknown>) || {};
        context = `AI companion named ${c.name}. ${(p["description"] as string) ?? (p["bio"] as string) ?? ""}`.trim();
      } else {
        const j = await this.prisma.aiJob.findUnique({ where: { id: targetId } });
        if (!j) continue;
        const input = (j.input as Record<string, unknown>) || {};
        context = `A short AI-generated video. Prompt: ${(input["prompt"] as string) ?? ""}`.trim();
      }

      requested += n;
      for (let i = 0; i < n; i++) {
        try {
          const res = await fetch(`${AI_BASE}/ai/text/completion`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system,
              prompt: `Write ONE fresh viewer comment for: ${context}\nReturn only the comment text.`,
              maxTokens: 60,
            }),
          });
          if (!res.ok) continue;
          const data = (await res.json()) as { content?: string };
          const text = (data.content || "").trim().replace(/^["']+|["']+$/g, "").slice(0, 500);
          if (!text) continue;
          const bot = bots[i % bots.length];
          await this.prisma.comment.create({
            data: { userId: bot.id, targetType: normalizedTarget, targetId, content: text },
          });
          created++;
        } catch {
          /* пропускаем неудачную генерацию отдельного комментария */
        }
      }
    }
    return { created, requested, targets: ids.length };
  }
}
