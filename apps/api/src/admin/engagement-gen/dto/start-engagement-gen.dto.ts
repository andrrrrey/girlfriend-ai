import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

/**
 * Тело запроса на запуск автогенерации контента для выбранных персонажей.
 * Количество изображений/видео задаётся НА КАЖДОГО персонажа.
 */
export class StartEngagementGenDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("all", { each: true })
  characterIds!: string[];

  /** Сколько изображений сгенерировать на каждого персонажа. */
  @IsInt()
  @Min(0)
  @Max(20)
  imagesPerChar!: number;

  /** Сколько видео сгенерировать на каждого персонажа. */
  @IsInt()
  @Min(0)
  @Max(10)
  videosPerChar!: number;

  /** Режим контента: "nsfw" | "sfw". По умолчанию берётся из персонажа. */
  @IsOptional()
  @IsString()
  @IsIn(["nsfw", "sfw"])
  contentMode?: "nsfw" | "sfw";
}
