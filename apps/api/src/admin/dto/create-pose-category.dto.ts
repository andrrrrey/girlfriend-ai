import { IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CreatePoseCategoryDto {
  @IsString()
  @IsIn(["FACIAL_EXPRESSION", "POSE"])
  tab!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
