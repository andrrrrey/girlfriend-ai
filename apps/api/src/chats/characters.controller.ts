import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma.service";
import { DemoService } from "../demo/demo.service";
import { CreateUserCharacterDto } from "./dto/create-user-character.dto";
import { generateSystemPrompt } from "./generate-system-prompt";
import type { Prisma } from "@prisma/client";

@Controller("characters")
export class CharactersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoService: DemoService,
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
  async createCharacter(@Req() req: any, @Body() dto: CreateUserCharacterDto) {
    await this.demoService.checkCharacterCreation(req.user.id, req.user.subscription);

    const systemPrompt = generateSystemPrompt(dto);

    const personalityJson: Record<string, unknown> = {
      gender: dto.gender,
      orientation: dto.orientation,
      age: dto.age,
      style: dto.style,
      generationStyle: dto.generationStyle,
      surname: dto.surname,
      nationality: dto.nationality,
      language: dto.language,
      ethnicity: dto.ethnicity,
      voice: dto.voice,
      eyeColor: dto.eyeColor,
      hairStyle: dto.hairStyle,
      hairColor: dto.hairColor,
      bodyType: dto.bodyType,
      breastSize: dto.breastSize,
      buttSize: dto.buttSize,
      personality: dto.personality,
      relationshipType: dto.relationshipType,
      familyStatus: dto.familyStatus,
      lifestyle: dto.lifestyle,
      work: dto.work,
      hobbies: dto.hobbies,
      kinks: dto.kinks,
      childhoodMemory: dto.childhoodMemory,
      lifeStory: dto.lifeStory,
      phobias: dto.phobias,
    };

    const tags: string[] = [];
    if (dto.personality) tags.push(dto.personality);
    if (dto.ethnicity) tags.push(dto.ethnicity);
    if (dto.bodyType) tags.push(dto.bodyType);
    if (dto.lifestyle) tags.push(dto.lifestyle);
    if (dto.hobbies) tags.push(...dto.hobbies.slice(0, 3));
    if (dto.kinks) tags.push(...dto.kinks.slice(0, 3));

    const character = await this.prisma.character.create({
      data: {
        name: dto.name,
        systemPrompt,
        personality: personalityJson as Prisma.InputJsonValue,
        tags,
        avatarUrl: dto.avatarUrl,
        isPublic: true,
        createdBy: req.user.id,
      },
    });

    return character;
  }
}
