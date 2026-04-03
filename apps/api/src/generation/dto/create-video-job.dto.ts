import { IsString, MinLength, IsOptional, IsIn } from "class-validator";

const ALLOWED_VIDEO_MODELS = [
  "wan2.1",
  "wan2.2",
  "cogvideox",
  "hunyuan-video",
  "animatediff",
  "ltx-video",
  "wan-2.2-t2v-spicy",
  "wan-2.1-t2v-spicy",
  "seedance-v1.5-t2v-spicy",
] as const;

const ALLOWED_ASPECT_RATIOS = ["1:1", "4:5", "5:4", "9:16", "16:9"] as const;

const ALLOWED_PROVIDERS = ["modelslab", "atlascloud"] as const;

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
}
