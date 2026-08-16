import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

/**
 * Тело запроса на запуск тестового перебора генераций.
 * `selections` — карта подгруппа → массив id выбранных опций. Подгруппы:
 * OUTFITS, OUTFIT_DETAILS, FACIAL_EXPRESSION, POSE, LOCATION, FRAMING, CAMERA_ANGLE.
 */
export class StartGenTestDto {
  @IsString()
  characterId!: string;

  @IsOptional()
  @IsIn(["img2img", "txt2img"])
  mode?: "img2img" | "txt2img";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  concurrency?: number;

  @IsOptional()
  @IsInt()
  seed?: number;

  /** Карта подгруппа → id выбранных опций (валидируется/санитайзится в сервисе). */
  @IsObject()
  selections!: Record<string, string[]>;
}
