import { IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CreateSceneCategoryDto {
  @IsString()
  @IsIn(["LOCATION"])
  tab!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
