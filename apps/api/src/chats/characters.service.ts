/**
 * @file characters.service.ts
 * @description Общая бизнес-логика создания персонажа.
 *
 * Вынесена из CharactersController, чтобы её мог переиспользовать как обычный
 * пользовательский эндпоинт (POST /characters, createdBy = userId), так и
 * фоновая автогенерация в админке (createdBy = null → платформенный персонаж).
 *
 * Пайплайн полностью совпадает с прежним инлайн-кодом контроллера:
 *   normalize → systemPrompt → uniqueSlug → сборка personality/tags →
 *   prisma.character.create → fire-and-forget ensureCharacterSeo.
 */

import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CreateUserCharacterDto } from "./dto/create-user-character.dto";
import { generateSystemPrompt } from "./generate-system-prompt";
import { normalizeCharacterDto } from "./character-normalize";
import { ensureCharacterSeo, uniqueSlug } from "./character-seo";

@Injectable()
export class CharactersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Создаёт персонажа из DTO. Нормализует значения (английские snake_case ключи),
   * проставляет SEO-slug сразу (чтобы URL работал с момента создания), а bio/
   * appearance генерит в фоне.
   *
   * @param rawDto — входной DTO (из фронта или из автогенератора)
   * @param opts.createdBy — id пользователя-владельца, либо null для платформенного
   *                         персонажа (появляется в общем каталоге как «официальный»)
   */
  async createFromDto(
    rawDto: CreateUserCharacterDto,
    opts: { createdBy: string | null },
  ) {
    const dto = normalizeCharacterDto(rawDto);

    const systemPrompt = generateSystemPrompt(dto);
    const slug = await uniqueSlug(this.prisma, dto.name);

    const personalityJson: Record<string, unknown> = {
      slug,
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
        voiceId: dto.voiceId ?? null,
        isPublic: true,
        createdBy: opts.createdBy,
      },
    });

    // SEO-описание — в фоне (fire-and-forget): создание не должно ждать ~20с AI.
    void ensureCharacterSeo(this.prisma, character.id).catch(() => {
      // Не удалось — подтянется лениво при первом открытии SEO-страницы.
    });

    return character;
  }
}
