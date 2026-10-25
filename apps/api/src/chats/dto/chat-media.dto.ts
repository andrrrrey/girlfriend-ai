/**
 * @file chat-media.dto.ts
 * @description DTO фото персонажа в чате и подтверждения цены медиа.
 */

import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/** Тело POST /chats/:id/photo. */
export class ChatPhotoDto {
  /** Поза: slug или название опции POSE (как в пикере поз чата). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pose?: string;

  /** Режим контента из переключателя интерфейса (несовершеннолетним — всегда sfw). */
  @IsOptional()
  @IsIn(["nsfw", "sfw"])
  contentMode?: "nsfw" | "sfw";

  /** Доп. детали спецификации (одежда, локация, кадр…), см. GenerationSpec. */
  @IsOptional()
  @IsObject()
  spec?: Record<string, unknown>;
}

/** Тело POST /chats/:id/media/confirm. */
export class ConfirmMediaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  token!: string;
}
