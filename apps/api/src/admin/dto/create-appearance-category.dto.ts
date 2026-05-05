import { IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CreateAppearanceCategoryDto {
  @IsString()
  @IsIn(["OUTFITS", "OUTFIT_DETAILS"])
  tab!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
