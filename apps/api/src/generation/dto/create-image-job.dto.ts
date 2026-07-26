import { IsString, MinLength, IsOptional, IsIn, IsInt } from "class-validator";

const ALLOWED_MODELS = [
  "realistic-vision-v51",
  "sdxl",
  "juggernaut-xl",
  "flux",
  "alibaba/wan-2.6/text-to-image",
] as const;

const ALLOWED_ASPECT_RATIOS = ["1:1", "4:5", "5:4", "9:16", "16:9"] as const;

const ALLOWED_PROVIDERS = ["modelslab", "atlascloud", "civitai"] as const;

const ALLOWED_COUNTS = [1, 4, 8, 16] as const;

export class CreateImageJobDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_ASPECT_RATIOS)
  aspectRatio?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_PROVIDERS)
  provider?: string;

  @IsOptional()
  @IsString()
  generationStyle?: string;

  /** Количество изображений для генерации (создаётся N отдельных заданий). */
  @IsOptional()
  @IsInt()
  @IsIn(ALLOWED_COUNTS)
  count?: number;

  /**
   * URL исходного изображения (фото персонажа) для режима img2img.
   * Если задан — генерация опирается на это фото, чтобы результат был похож
   * на персонажа (используется при генерации поз в чате).
   */
  @IsOptional()
  @IsString()
  initImageUrl?: string;

  /**
   * ID выбранного персонажа (кнопка «Choose Character» на /generation).
   * Сохраняется в AiJob, чтобы эти картинки показывались в сторис персонажа.
   */
  @IsOptional()
  @IsString()
  characterId?: string;

  /**
   * Seed генерации. Если задан — прокидывается до провайдера, чтобы результат
   * был воспроизводим (нужно для фиксации внешности персонажа). Если не задан —
   * провайдер использует случайный seed.
   */
  @IsOptional()
  @IsInt()
  seed?: number;

  /** Режим контента: "nsfw" | "sfw". Определяет промпт-теги, негатив и флаг nsfw. */
  @IsOptional()
  @IsString()
  @IsIn(["nsfw", "sfw"])
  contentMode?: "nsfw" | "sfw";
}
