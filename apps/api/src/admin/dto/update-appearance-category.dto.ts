import { IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateAppearanceCategoryDto {
  @IsOptional()
  @IsString()
  @IsIn(["OUTFITS", "OUTFIT_DETAILS"])
  tab?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
