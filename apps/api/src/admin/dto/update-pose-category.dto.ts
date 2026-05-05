import { IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class UpdatePoseCategoryDto {
  @IsOptional()
  @IsString()
  @IsIn(["FACIAL_EXPRESSION", "POSE"])
  tab?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
