import { IsString, MinLength, IsOptional, IsIn } from "class-validator";

const ALLOWED_VIDEO_MODELS = [
  "wan2.1",
  "wan2.2",
  "cogvideox",
  "hunyuan-video",
  "animatediff",
  "ltx-video",
  "atlascloud/van-2.6/text-to-video",
  "atlascloud/wan-2.2-turbo-spicy/image-to-video",
  "atlascloud/hunyuan-video/t2v",
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
