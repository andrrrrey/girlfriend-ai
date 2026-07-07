import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma.service";
import { DemoService } from "../demo/demo.service";
import { CharactersService } from "./characters.service";
import { CreateUserCharacterDto } from "./dto/create-user-character.dto";
import { ensureCharacterSeo } from "./character-seo";
import { S3Service } from "../s3/s3.service";
import { loadEnv } from "@repo/config";
import type { Prisma } from "@prisma/client";

const env = loadEnv();

/** Проверка, что строка — UUID (а не SEO-slug). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URL результата генерации (AiJob.output.url хранится как прямой публичный S3
 * URL) → клиентский путь через media-прокси, как у Message.mediaUrl. Так сторис
 * одинаково отображает картинки из чатов и из раздела «Генерация».
 */
function aiJobUrlToClient(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api-proxy") || url.startsWith("/media")) return url;
  const publicBase = env.S3_PUBLIC_URL || env.S3_ENDPOINT;
  if (publicBase) {
    const key = S3Service.extractKeyFromUrl(url, publicBase, env.S3_BUCKET ?? "media");
    if (key) return `/api-proxy/media/stream?key=${encodeURIComponent(key)}`;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `/api-proxy/media/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

/** Достаёт url из AiJob.output (Json). */
function aiJobOutputUrl(output: unknown): string | null {
  if (output && typeof output === "object" && typeof (output as Record<string, unknown>).url === "string") {
    return (output as Record<string, string>).url;
  }
  return null;
}

@Controller("characters")
export class CharactersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoService: DemoService,
    private readonly charactersService: CharactersService,
  ) {}

  @Get()
  async listPublic(
    @Query("search") search?: string,
    @Query("gender") gender?: string,
    @Query("style") style?: string,
    @Query("createdBy") createdBy?: string,
    @Query("createdByUserId") createdByUserId?: string,
    @Query("sortBy") sortBy?: string,
    @Query("tags") tags?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const where: Prisma.CharacterWhereInput = { deletedAt: null };

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const jsonFilters: Prisma.CharacterWhereInput[] = [];
    if (gender) {
      jsonFilters.push({ personality: { path: ["gender"], equals: gender } });
    }
    if (style) {
      jsonFilters.push({ personality: { path: ["style"], equals: style } });
    }
    if (jsonFilters.length > 0) {
      where.AND = jsonFilters;
    }

    if (createdByUserId) {
      where.createdBy = createdByUserId;
    } else if (createdBy === "platform") {
      where.createdBy = null;
    } else if (createdBy === "community") {
      where.createdBy = { not: null };
    }

    if (tags) {
      const tagList = tags.split(",").filter(Boolean);
      if (tagList.length > 0) {
        where.tags = { hasSome: tagList };
      }
    }

    let orderBy: Prisma.CharacterOrderByWithRelationInput = { createdAt: "desc" };
    if (sortBy === "name") {
      orderBy = { name: "asc" };
    } else if (sortBy === "oldest") {
      orderBy = { createdAt: "asc" };
    }

    const take = limit ? parseInt(limit, 10) : 30;
    const skip = page ? (parseInt(page, 10) - 1) * take : 0;

    const [rawItems, total] = await Promise.all([
      this.prisma.character.findMany({
        where,
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          tags: true,
          personality: true,
          createdBy: true,
          createdAt: true,
        },
        orderBy,
        take,
        skip,
      }),
      this.prisma.character.count({ where }),
    ]);

    // Attach creator info for characters created by users
    const creatorIds = [...new Set(rawItems.map((c) => c.createdBy).filter(Boolean) as string[])];
    const creatorsMap = new Map<string, { id: string; nickname: string | null; avatarUrl: string | null }>();
    if (creatorIds.length > 0) {
      const creators = await this.prisma.user.findMany({
        where: { id: { in: creatorIds } },
        select: { id: true, nickname: true, avatarUrl: true },
      });
      for (const c of creators) creatorsMap.set(c.id, c);
    }

    const items = rawItems.map((c) => ({
      ...c,
      isPublic: true,
      systemPrompt: "",
      voiceId: null,
      creator: c.createdBy ? (creatorsMap.get(c.createdBy) ?? null) : null,
    }));

    return { items, total };
  }

  @Get("tags")
  async getTags() {
    const characters = await this.prisma.character.findMany({
      where: { deletedAt: null },
      select: { tags: true },
    });

    const freq = new Map<string, number>();
    for (const c of characters) {
      for (const tag of c.tags) {
        freq.set(tag, (freq.get(tag) ?? 0) + 1);
      }
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }

  @Get("my")
  @UseGuards(JwtAuthGuard)
  async listMy(@Req() req: any) {
    return this.prisma.character.findMany({
      where: { createdBy: req.user.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tags: true,
        personality: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Stories-лента для главной страницы.
   *
   * Возвращает персонажей в виде кружков. Персонажи, у которых за последние
   * 24 часа в чатах с пользователями были сгенерированы картинки (Message
   * type="image"), помечаются hasActiveStory=true и идут первыми, отсортированные
   * по свежести последней истории. Остальные публичные персонажи идут следом
   * (новые первыми). Через 24 часа история «протухает» — персонаж теряет обводку
   * и уходит в конец списка автоматически (т.к. перестаёт попадать в окно).
   */
  @Get("stories")
  async getStories(@Query("limit") limit?: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Картинки за последние 24 часа с привязкой к персонажу — из двух источников:
    // 1) чаты (Message type="image"), 2) раздел «Генерация» (AiJob с characterId).
    const [recentImages, recentJobs] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          type: "image",
          mediaUrl: { not: null },
          deletedAt: null,
          createdAt: { gte: since },
          chatSession: { deletedAt: null },
        },
        select: {
          createdAt: true,
          chatSession: { select: { characterId: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.aiJob.findMany({
        where: {
          type: "image",
          status: "completed",
          characterId: { not: null },
          createdAt: { gte: since },
        },
        select: { createdAt: true, characterId: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Агрегируем по персонажу: время последней истории и количество кадров
    const storyMap = new Map<string, { latestAt: Date; count: number }>();
    const bump = (cid: string, at: Date) => {
      const cur = storyMap.get(cid);
      if (cur) {
        cur.count += 1;
        if (at > cur.latestAt) cur.latestAt = at;
      } else {
        storyMap.set(cid, { latestAt: at, count: 1 });
      }
    };
    for (const m of recentImages) bump(m.chatSession.characterId, m.createdAt);
    for (const j of recentJobs) if (j.characterId) bump(j.characterId, j.createdAt);

    const activeIds = [...storyMap.keys()];
    const restTake = limit ? parseInt(limit, 10) : 60;

    const [activeRaw, restRaw] = await Promise.all([
      activeIds.length
        ? this.prisma.character.findMany({
            where: { id: { in: activeIds }, deletedAt: null, avatarUrl: { not: null } },
            select: { id: true, name: true, avatarUrl: true },
          })
        : Promise.resolve([]),
      this.prisma.character.findMany({
        where: {
          deletedAt: null,
          avatarUrl: { not: null },
          ...(activeIds.length ? { id: { notIn: activeIds } } : {}),
        },
        select: { id: true, name: true, avatarUrl: true },
        orderBy: { createdAt: "desc" },
        take: restTake,
      }),
    ]);

    const active = activeRaw
      .map((c) => {
        const story = storyMap.get(c.id)!;
        return {
          ...c,
          hasActiveStory: true,
          storyCount: story.count,
          latestStoryAt: story.latestAt,
        };
      })
      .sort((a, b) => b.latestStoryAt.getTime() - a.latestStoryAt.getTime());

    const rest = restRaw.map((c) => ({
      ...c,
      hasActiveStory: false,
      storyCount: 0,
      latestStoryAt: null as Date | null,
    }));

    return { items: [...active, ...rest] };
  }

  /**
   * Кадры истории конкретного персонажа — картинки из чатов за последние 24 часа.
   * Отсортированы хронологически (старые → новые), как слайды в Instagram Stories.
   */
  @Get(":id/story")
  async getCharacterStory(@Param("id") id: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [character, messages, jobs] = await Promise.all([
      this.prisma.character.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, name: true, avatarUrl: true },
      }),
      this.prisma.message.findMany({
        where: {
          type: "image",
          mediaUrl: { not: null },
          deletedAt: null,
          createdAt: { gte: since },
          chatSession: { characterId: id, deletedAt: null },
        },
        select: { id: true, mediaUrl: true, content: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.aiJob.findMany({
        where: {
          type: "image",
          status: "completed",
          characterId: id,
          createdAt: { gte: since },
        },
        select: { id: true, output: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Объединяем кадры из чатов и из раздела генерации, сортируем по времени.
    const items = [
      ...messages.map((m) => ({ id: m.id, url: m.mediaUrl as string | null, label: m.content || "", createdAt: m.createdAt })),
      ...jobs.map((j) => ({ id: j.id, url: aiJobUrlToClient(aiJobOutputUrl(j.output)), label: "", createdAt: j.createdAt })),
    ]
      .filter((it) => !!it.url)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return { character, items };
  }

  /**
   * Картинки персонажа для попапа на главной: последние 5 изображений,
   * сгенерированных ВСЕМИ пользователями в чатах с этим персонажем,
   * плюс общее количество таких изображений (для счётчика GENERATED).
   *
   * В отличие от /story здесь нет окна «24 часа» — берём за всё время.
   */
  @Get(":id/images")
  async getCharacterImages(@Param("id") id: string) {
    const msgWhere = {
      type: "image",
      mediaUrl: { not: null },
      deletedAt: null,
      chatSession: { characterId: id, deletedAt: null },
    } as const;
    const jobWhere = {
      type: "image",
      status: "completed",
      characterId: id,
    } as const;

    // Считаем и берём последние картинки из обоих источников: чаты (Message) и
    // раздел «Генерация» (AiJob). Счётчик GENERATED — сумма обоих.
    const [msgCount, jobCount, messages, jobs] = await Promise.all([
      this.prisma.message.count({ where: msgWhere }),
      this.prisma.aiJob.count({ where: jobWhere }),
      this.prisma.message.findMany({
        where: msgWhere,
        select: { id: true, mediaUrl: true, content: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      this.prisma.aiJob.findMany({
        where: jobWhere,
        select: { id: true, output: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const items = [
      ...messages.map((m) => ({ id: m.id, url: m.mediaUrl as string | null, label: m.content || "", createdAt: m.createdAt })),
      ...jobs.map((j) => ({ id: j.id, url: aiJobUrlToClient(aiJobOutputUrl(j.output)), label: "", createdAt: j.createdAt })),
    ]
      .filter((it) => !!it.url)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);

    return { count: msgCount + jobCount, items };
  }

  /**
   * Данные персонажа для публичной SEO-страницы (/characters/:idOrSlug).
   *
   * Параметр — SEO-slug (personality.slug) ИЛИ UUID (фолбэк для персонажей без
   * slug). Возвращает персонажа + AI-описание (bio/appearance). Описание и slug
   * обычно уже подготовлены заранее (при создании персонажа или бэкфилле); если
   * чего-то нет — генерится здесь как фолбэк (ensureCharacterSeo) и кэшируется.
   *
   * Публичный (без авторизации), как остальные read-методы.
   */
  @Get(":id/seo")
  async getSeo(@Param("id") idOrSlug: string) {
    const select = {
      id: true,
      name: true,
      avatarUrl: true,
      tags: true,
      personality: true,
      createdBy: true,
      createdAt: true,
      isPublic: true,
      voiceId: true,
    } as const;

    const where: Prisma.CharacterWhereInput = UUID_RE.test(idOrSlug)
      ? { id: idOrSlug, deletedAt: null }
      : { personality: { path: ["slug"], equals: idOrSlug }, deletedAt: null };

    let character = await this.prisma.character.findFirst({ where, select });
    if (!character) return null;

    let personality = (character.personality as Record<string, unknown> | null) || {};
    let seo = personality.seo as { bio?: string; appearance?: string } | undefined;

    // Фолбэк: описание/slug ещё не подготовлены — генерим и перечитываем.
    if (!seo || !seo.bio) {
      try {
        await ensureCharacterSeo(this.prisma, character.id);
        const fresh = await this.prisma.character.findFirst({
          where: { id: character.id },
          select,
        });
        if (fresh) {
          character = fresh;
          personality = (fresh.personality as Record<string, unknown> | null) || {};
        }
        seo = (personality.seo as { bio?: string; appearance?: string }) || { bio: "", appearance: "" };
      } catch {
        seo = { bio: "", appearance: "" };
      }
    }

    let creator = null;
    if (character.createdBy) {
      const user = await this.prisma.user.findFirst({
        where: { id: character.createdBy },
        select: { id: true, nickname: true, avatarUrl: true },
      });
      if (user) creator = user;
    }

    return {
      ...character,
      systemPrompt: "",
      creator,
      seo: { bio: seo.bio || "", appearance: seo.appearance || "" },
    };
  }

  @Get(":id")
  async getOne(@Param("id") id: string) {
    const character = await this.prisma.character.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tags: true,
        personality: true,
        createdBy: true,
        createdAt: true,
        isPublic: true,
        voiceId: true,
      },
    });

    if (!character) return null;

    let creator = null;
    if (character.createdBy) {
      const user = await this.prisma.user.findFirst({
        where: { id: character.createdBy },
        select: { id: true, nickname: true, avatarUrl: true },
      });
      if (user) {
        const [followerCount, likeCount] = await Promise.all([
          this.prisma.follow.count({ where: { followeeId: user.id } }),
          this.prisma.like.count({ where: { userId: user.id } }),
        ]);
        creator = { ...user, followerCount, likeCount };
      }
    }

    return { ...character, systemPrompt: "", creator };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createCharacter(@Req() req: any, @Body() rawDto: CreateUserCharacterDto) {
    await this.demoService.checkCharacterCreation(req.user.id, req.user.subscription);

    // Создание делегируем общему сервису (тот же пайплайн использует автогенерация
    // в админке). Владелец — текущий пользователь.
    return this.charactersService.createFromDto(rawDto, { createdBy: req.user.id });
  }
}
