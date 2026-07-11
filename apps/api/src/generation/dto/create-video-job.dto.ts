import { IsString, MinLength, IsOptional, IsIn, IsInt } from "class-validator";

const ALLOWED_VIDEO_MODELS = [
  "atlascloud/van-2.6/text-to-video",
  "atlascloud/wan-2.6-spicy/image-to-video",
  "alibaba/wan-2.7/image-to-video",
] as const;

const ALLOWED_ASPECT_RATIOS = ["1:1", "4:5", "5:4", "9:16", "16:9"] as const;

const ALLOWED_PROVIDERS = ["modelslab", "atlascloud"] as const;

const ALLOWED_MODES = ["scratch", "img2vid", "continue"] as const;

const ALLOWED_COUNTS = [1, 4, 8, 16] as const;

export class CreateVideoJobDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_VIDEO_MODELS)
  model?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_ASPECT_RATIOS)
  aspectRatio?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_PROVIDERS)
  provider?: string;

  /** Режим генерации видео: с нуля, из изображения или продолжение существующего. */
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_MODES)
  mode?: string;

  /** S3-ключ исходного изображения для режима img2vid. */
  @IsOptional()
  @IsString()
  initImageKey?: string;

  /** S3-ключ исходного видео для режима continue. */
  @IsOptional()
  @IsString()
  initVideoKey?: string;

  /** Количество видео для генерации (создаётся N отдельных заданий). */
  @IsOptional()
  @IsInt()
  @IsIn(ALLOWED_COUNTS)
  count?: number;

  /**
   * Seed генерации. Если задан — прокидывается до провайдера для
   * воспроизводимости. Если не задан — используется случайный seed.
   */
  @IsOptional()
  @IsInt()
  seed?: number;
}
