import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaService } from "../prisma.service";
import { CreateUserCharacterDto } from "./dto/create-user-character.dto";
import { generateSystemPrompt } from "./generate-system-prompt";
import type { Prisma } from "@prisma/client";

@Controller("characters")
@UseGuards(JwtAuthGuard)
export class CharactersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listPublic() {
    return this.prisma.character.findMany({
      where: { isPublic: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tags: true,
        personality: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  @Get("my")
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
    return this.prisma.character.findFirst({
      where: { id, isPublic: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        tags: true,
        personality: true,
      },
    });
  }

  @Post()
  async createCharacter(@Req() req: any, @Body() dto: CreateUserCharacterDto) {
    const systemPrompt = generateSystemPrompt(dto);

    const personalityJson: Record<string, unknown> = {
      gender: dto.gender,
      orientation: dto.orientation,
      age: dto.age,
      style: dto.style,
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
        isPublic: false,
        createdBy: req.user.id,
      },
    });

    return character;
  }
}
