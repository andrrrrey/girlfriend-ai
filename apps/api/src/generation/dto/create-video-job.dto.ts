import { IsString, MinLength, IsOptional, IsIn } from "class-validator";

const ALLOWED_VIDEO_MODELS = [
  "cogvideox",
  "hunyuan-video",
  "wan-ai",
  "animatediff",
  "stable-video-diffusion",
  "ltx-video",
] as const;

const ALLOWED_ASPECT_RATIOS = ["1:1", "4:5", "5:4", "9:16", "16:9"] as const;

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
}
