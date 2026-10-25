/**
 * @file generation-spec.service.ts
 * @description Превращает спецификацию генерации в параметры задания для
 * GenerationService.createImageJob / createVideoJob.
 *
 * Здесь — серверный перенос логики handleGenerate (страница генерации) и
 * handleGenerateImage (фото персонажа в чате): выбор модели/провайдера/стиля,
 * промпт внешности готового персонажа, negative prompt.
 */

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { IMAGE_MODELS } from "../models";
import type { GenerationService } from "../generation.service";
import { OptionCatalogService } from "./option-catalog.service";
import type { GenerationSpec } from "./generation-spec";
import {
  buildCharacterImagePrompt,
  composeChatExtra,
  composeStudioPrompt,
  resolveOption,
} from "./prompt-composer";

/** Модель видео персонажа в чате (text-to-video). */
export const CHAT_VIDEO_MODEL = "atlascloud/van-2.6/text-to-video";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ImageJobInput = Parameters<GenerationService["createImageJob"]>[1];
export type VideoJobInput = Parameters<GenerationService["createVideoJob"]>[1];

@Injectable()
export class GenerationSpecService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: OptionCatalogService,
  ) {}

  /**
   * Параметры задания изображения по спецификации.
   *
   * - preset "chat" — фото персонажа в чате: промпт внешности + выбранные детали,
   *   чекпоинт и стиль персонажа; characterId в задание не пишется (фото чата не
   *   попадают в сторис персонажа — как и раньше);
   * - готовый персонаж (characterId) — промпт внешности + композиция страницы;
   * - иначе — композиция страницы генерации и выбранная модель.
   *
   * @param userId — для проверки доступа к приватному персонажу
   */
  async toImageJob(spec: GenerationSpec, userId: string): Promise<ImageJobInput> {
    const catalog = await this.catalog.get(spec.contentMode);
    const base = {
      aspectRatio: spec.aspectRatio,
      count: spec.count,
      contentMode: spec.contentMode,
      negativePrompt: spec.negativeTerms?.length ? spec.negativeTerms.join(", ") : undefined,
    };

    if (spec.preset === "chat" || spec.characterId) {
      if (!spec.characterId) throw new BadRequestException("characterId is required for chat photos");
      const character = await this.loadCharacter(spec.characterId, userId);
      const personality = (character.personality ?? {}) as Record<string, unknown>;
      // Нет своего generationStyle → дефолт "realism" (валидный ключ CIVITAI_MODELS).
      const generationStyle = (personality.generationStyle as string | undefined) || "realism";
      // Чекпоинт аватара (Civitai AIR) — иначе Civitai возьмёт случайный и фото не будет похоже.
      const model = typeof personality.avatarModel === "string" ? personality.avatarModel : undefined;

      let prompt: string;
      if (spec.preset === "chat") {
        prompt = buildCharacterImagePrompt(personality, composeChatExtra(spec, catalog) || undefined);
      } else {
        const composite = composeStudioPrompt(spec, catalog);
        const identity = buildCharacterImagePrompt(personality);
        prompt = identity ? `${identity}, ${composite}` : composite;
      }

      return {
        ...base,
        prompt,
        ...(model ? { model } : {}),
        provider: "civitai",
        generationStyle,
        ...(spec.preset === "chat" ? {} : { characterId: character.id }),
      };
    }

    const provider = IMAGE_MODELS.find((m) => m.id === spec.model)?.provider;
    const style = spec.character?.style
      ? resolveOption(catalog.character.filter((o) => o.category === "STYLE"), spec.character.style)
      : undefined;
    return {
      ...base,
      prompt: composeStudioPrompt(spec, catalog),
      model: spec.model,
      provider,
      generationStyle: provider === "civitai" ? style?.generationStyle || undefined : undefined,
    };
  }

  /**
   * Параметры задания видео по спецификации: композиция страницы генерации или,
   * для preset "chat", видео персонажа в чате (внешность + выбранные детали).
   *
   * @param userId — нужен для preset "chat" (проверка доступа к персонажу)
   */
  async toVideoJob(spec: GenerationSpec, userId?: string): Promise<VideoJobInput> {
    const catalog = await this.catalog.get(spec.contentMode);
    if (spec.preset === "chat") {
      if (!spec.characterId || !userId) throw new BadRequestException("characterId is required for chat videos");
      const character = await this.loadCharacter(spec.characterId, userId);
      const personality = (character.personality ?? {}) as Record<string, unknown>;
      return {
        prompt: buildCharacterImagePrompt(personality, composeChatExtra(spec, catalog) || undefined),
        model: CHAT_VIDEO_MODEL,
        mode: "scratch",
        // Вертикальное — как «кружочек»/сторис в мессенджере.
        aspectRatio: spec.aspectRatio ?? "9:16",
        contentMode: spec.contentMode,
      };
    }
    const mode = spec.video?.mode ?? "scratch";
    if (mode === "img2vid" && !spec.video?.initImageKey) throw new BadRequestException("video.initImageKey is required");
    if (mode === "continue" && !spec.video?.initVideoKey) throw new BadRequestException("video.initVideoKey is required");

    return {
      prompt: composeStudioPrompt(spec, catalog),
      negativePrompt: spec.negativeTerms?.length ? spec.negativeTerms.join(", ") : undefined,
      // В режимах из медиа модель определяется на бэкенде по режиму.
      model: mode === "scratch" ? spec.model : undefined,
      aspectRatio: spec.aspectRatio,
      mode,
      initImageKey: mode === "img2vid" ? spec.video?.initImageKey : undefined,
      initVideoKey: mode === "continue" ? spec.video?.initVideoKey : undefined,
      count: spec.count,
      contentMode: spec.contentMode,
    };
  }

  /** Персонаж, доступный пользователю: публичный, платформенный или свой. */
  private async loadCharacter(characterId: string, userId: string) {
    if (!UUID_RE.test(characterId)) throw new NotFoundException("Character not found");
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, deletedAt: null },
      select: { id: true, personality: true, isPublic: true, createdBy: true },
    });
    if (!character || (character.createdBy && character.createdBy !== userId && !character.isPublic)) {
      throw new NotFoundException("Character not found");
    }
    return character;
  }
}
