import { IsString, MinLength, IsOptional, IsIn } from "class-validator";

const ALLOWED_MODELS = [
  "realistic-vision-v51",
  "sdxl",
  "juggernaut-xl",
  "flux",
] as const;

const ALLOWED_ASPECT_RATIOS = ["1:1", "4:5", "5:4", "9:16", "16:9"] as const;

export class CreateImageJobDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsString()
  negativePrompt?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_MODELS)
  model?: string;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_ASPECT_RATIOS)
  aspectRatio?: string;
}
