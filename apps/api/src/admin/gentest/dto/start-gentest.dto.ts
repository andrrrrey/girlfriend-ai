import { IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from "class-validator";

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

  /** Сила изменения img2img (0.1..1). Только для режима img2img. */
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  denoise?: number;

  /** Карта подгруппа → id выбранных опций (валидируется/санитайзится в сервисе). */
  @IsObject()
  selections!: Record<string, string[]>;
}
