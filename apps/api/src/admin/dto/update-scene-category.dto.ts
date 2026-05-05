import { IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class UpdateSceneCategoryDto {
  @IsOptional()
  @IsString()
  @IsIn(["LOCATION"])
  tab?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
